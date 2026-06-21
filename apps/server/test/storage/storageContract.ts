import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MultiplayerEvent } from "@domino-poker/core/multiplayer";
import type { ChatMessage } from "@domino-poker/shared";

import type { AuthStore, UserRecord } from "../../src/auth/AuthStore.js";
import type { CoinStore } from "../../src/storage/CoinStore.js";
import type { PlayerStatsStore } from "../../src/storage/PlayerStatsStore.js";
import type { MatchStartedRecord, StoragePort } from "../../src/storage/StoragePort.js";

/**
 * Parametrizēta `StoragePort` kontrakt-svīta (Fāze 3, 13. punkts). Vienas un tās
 * pašas uzvedības asercijas tiek palaistas pret KATRU backendu (SQLite vienmēr;
 * PostgreSQL, kad `TEST_POSTGRES_DATABASE_URL` iestatīts), lai pierādītu, ka abi
 * dod IDENTISKUS rezultātus. Tā ir parity drošības tīkls pirms shēmas dedublēšanas.
 *
 * Kontrakts pieskaras `StoragePort` + `getUserStats`/`createUser` (`AuthStore`) +
 * `CoinStore` (zelta maks) + `PlayerStatsStore` (padziļinātā statistika), jo to FK
 * prasa esošu lietotāju — tāpēc `Setup` atgriež `StoragePort & AuthStore & CoinStore &
 * PlayerStatsStore` (visi backendi implementē visus).
 */
export type ContractStorage = StoragePort & AuthStore & CoinStore & PlayerStatsStore;

/** Izveido svaigu, izolētu glabātuvi un atgriež arī tās teardown (SQLite: close; PG: close + drop schema). */
export type ContractSetup = () => Promise<{
  readonly storage: ContractStorage;
  readonly teardown: () => Promise<void>;
}>;

function makeMatch(overrides: Partial<MatchStartedRecord> = {}): MatchStartedRecord {
  return {
    matchId: "room-1",
    seed: "seed-abc",
    numberOfRounds: 7,
    players: [
      { seatIndex: 0, corePlayerId: "1", kind: "human", displayId: "P-100" },
      { seatIndex: 1, corePlayerId: "2", kind: "bot" }
    ],
    startedAt: 1000,
    ...overrides
  };
}

function bidEvent(seq: number): MultiplayerEvent {
  return {
    type: "BID_ACCEPTED",
    gameId: "room-1",
    eventSeq: seq,
    playerId: "1",
    turnId: `turn-${seq}`,
    bid: 2
  };
}

function chat(id: string, serverNow: number): ChatMessage {
  return { id, authorDisplayId: "P-100", text: `hello ${id}`, serverNow };
}

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "user-1",
    username: "Rihards",
    usernameNorm: "rihards",
    email: undefined,
    emailNorm: undefined,
    passwordHash: "scrypt$fake",
    avatar: "default",
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides
  };
}

/**
 * Reģistrē `describe` bloku ar identiskām `StoragePort` uzvedības asercijām pret
 * doto backendu. Izsauc šo no katra backenda test faila ar attiecīgo `setup`.
 */
export function runStoragePortContract(label: string, setup: ContractSetup): void {
  describe(`StoragePort contract: ${label}`, () => {
    let storage: ContractStorage;
    let teardown: () => Promise<void>;

    beforeEach(async () => {
      ({ storage, teardown } = await setup());
    });

    afterEach(async () => {
      await teardown();
    });

    describe("fresh boot", () => {
      it("returns empty reads on a freshly migrated database", async () => {
        expect(await storage.listRecentMatches(10)).toEqual([]);
        expect(await storage.loadRecentChatMessages(10)).toEqual([]);
        expect(await storage.loadUnfinishedMatch("nope")).toBeUndefined();
        expect(await storage.getPlayerStats("nobody")).toBeUndefined();
      });
    });

    describe("matches + event log", () => {
      it("saves a started match and loads it as unfinished with its events", async () => {
        await storage.saveMatchStarted(makeMatch());
        await storage.appendMatchEvent("room-1", { seq: 1, event: bidEvent(1) });
        await storage.appendMatchEvent("room-1", { seq: 2, event: bidEvent(2) });

        const loaded = await storage.loadUnfinishedMatch("room-1");
        expect(loaded?.match.seed).toBe("seed-abc");
        expect(loaded?.match.numberOfRounds).toBe(7);
        expect(loaded?.match.players).toHaveLength(2);
        expect(loaded?.events.map((entry) => entry.seq)).toEqual([1, 2]);
        expect(loaded?.events[0]?.event.type).toBe("BID_ACCEPTED");
      });

      it("is idempotent for repeated match starts and events", async () => {
        await storage.saveMatchStarted(makeMatch());
        await storage.saveMatchStarted(makeMatch({ seed: "DIFFERENT" }));
        await storage.appendMatchEvent("room-1", { seq: 1, event: bidEvent(1) });
        await storage.appendMatchEvent("room-1", { seq: 1, event: bidEvent(1) });

        const loaded = await storage.loadUnfinishedMatch("room-1");
        // Pirmais starts paliek (idempotents), dublētais seq netiek pievienots.
        expect(loaded?.match.seed).toBe("seed-abc");
        expect(loaded?.events).toHaveLength(1);
      });

      it("hides a finished match from loadUnfinishedMatch and keeps the result", async () => {
        await storage.saveMatchStarted(makeMatch());
        await storage.appendMatchEvent("room-1", { seq: 1, event: bidEvent(1) });
        await storage.saveMatchFinished({ matchId: "room-1", winnerPlayerId: "1", finishedAt: 5000 });

        expect(await storage.loadUnfinishedMatch("room-1")).toBeUndefined();

        const [summary] = await storage.listRecentMatches(10);
        expect(summary?.finishedAt).toBe(5000);
        expect(summary?.winnerPlayerId).toBe("1");
        expect(summary?.eventCount).toBe(1);
      });

      it("lists recent matches newest first", async () => {
        await storage.saveMatchStarted(makeMatch({ matchId: "room-1", startedAt: 1000 }));
        await storage.saveMatchStarted(makeMatch({ matchId: "room-2", startedAt: 3000 }));
        await storage.saveMatchStarted(makeMatch({ matchId: "room-3", startedAt: 2000 }));

        const recent = await storage.listRecentMatches(2);
        expect(recent.map((row) => row.matchId)).toEqual(["room-2", "room-3"]);
      });
    });

    describe("player stats", () => {
      it("upserts player stats", async () => {
        await storage.savePlayerStats({ playerId: "P-1", gamesPlayed: 1, gamesWon: 0, updatedAt: 100 });
        await storage.savePlayerStats({ playerId: "P-1", gamesPlayed: 2, gamesWon: 1, updatedAt: 200 });

        expect(await storage.getPlayerStats("P-1")).toEqual({
          playerId: "P-1",
          gamesPlayed: 2,
          gamesWon: 1,
          updatedAt: 200
        });
      });

      it("increments player stats and keeps the max updatedAt", async () => {
        await storage.incrementPlayerStats({ playerId: "P-1", gamesPlayedDelta: 1, gamesWonDelta: 0, updatedAt: 100 });
        await storage.incrementPlayerStats({ playerId: "P-1", gamesPlayedDelta: 1, gamesWonDelta: 1, updatedAt: 200 });
        await storage.incrementPlayerStats({ playerId: "P-1", gamesPlayedDelta: 1, gamesWonDelta: 0, updatedAt: 150 });

        expect(await storage.getPlayerStats("P-1")).toEqual({
          playerId: "P-1",
          gamesPlayed: 3,
          gamesWon: 1,
          updatedAt: 200 // max, ne pēdējais
        });
      });
    });

    describe("chat history", () => {
      it("returns recent messages in chronological order", async () => {
        await storage.appendChatMessage(chat("m1", 100));
        await storage.appendChatMessage(chat("m2", 200));
        await storage.appendChatMessage(chat("m3", 300));

        const recent = await storage.loadRecentChatMessages(2);
        expect(recent.map((message) => message.id)).toEqual(["m2", "m3"]);
      });

      it("ignores duplicate message ids", async () => {
        await storage.appendChatMessage(chat("m1", 100));
        await storage.appendChatMessage(chat("m1", 999));

        const recent = await storage.loadRecentChatMessages(10);
        expect(recent).toHaveLength(1);
        expect(recent[0]?.serverNow).toBe(100);
      });
    });

    describe("user match outcomes + stats (atomic, idempotent)", () => {
      it("records exactly one outcome per match per user and increments user_stats atomically", async () => {
        expect(await storage.createUser(makeUser())).toBe("created");
        expect(await storage.getUserStats("user-1")).toBeUndefined();

        // Pirmais iznākums: tiek ierakstīts + stats inkrementēts.
        expect(await storage.recordUserMatchOutcome("match-A", "user-1", "win", 100)).toBe(true);
        expect(await storage.getUserStats("user-1")).toEqual({
          userId: "user-1",
          gamesPlayed: 1,
          wins: 1,
          losses: 0,
          updatedAt: 100
        });

        // Tas pats (match, user): idempotents — atgriež false, stats nemainās (anti-cheat 5.7).
        expect(await storage.recordUserMatchOutcome("match-A", "user-1", "win", 150)).toBe(false);
        expect(await storage.getUserStats("user-1")).toMatchObject({ gamesPlayed: 1, wins: 1, losses: 0 });

        // Cita partija, zaudējums: jauns ieraksts + inkrements.
        expect(await storage.recordUserMatchOutcome("match-B", "user-1", "lose", 200)).toBe(true);
        expect(await storage.getUserStats("user-1")).toEqual({
          userId: "user-1",
          gamesPlayed: 2,
          wins: 1,
          losses: 1,
          updatedAt: 200
        });
      });
    });

    describe("player game results (sp + mp deep stats)", () => {
      beforeEach(async () => {
        expect(await storage.createUser(makeUser())).toBe("created");
      });

      it("returns an empty aggregate before any games", async () => {
        expect(await storage.getPlayerGameStats("user-1")).toEqual([]);
      });

      it("looks up the owner of a recorded game by id (for /sp/complete replay)", async () => {
        expect(await storage.getGameResultOwner("sp:tok-x")).toBeUndefined();
        await storage.recordGameResult({
          id: "sp:tok-x", userId: "user-1", mode: "sp", difficulty: "medium",
          placement: 1, roundCount: 3, bidMet: 3, bidExceeded: 0, bidMissed: 0, completedAt: 1
        });
        expect(await storage.getGameResultOwner("sp:tok-x")).toBe("user-1");
      });

      it("records sp + mp games idempotently and aggregates by mode/difficulty/placement", async () => {
        // SP medium, 1. vieta: 5 met / 1 exceeded / 1 missed pa 7 raundiem.
        expect(
          await storage.recordGameResult({
            id: "sp:tok-1", userId: "user-1", mode: "sp", difficulty: "medium",
            placement: 1, roundCount: 7, bidMet: 5, bidExceeded: 1, bidMissed: 1, completedAt: 100
          })
        ).toBe(true);
        // Tas pats `id` → idempotents no-op.
        expect(
          await storage.recordGameResult({
            id: "sp:tok-1", userId: "user-1", mode: "sp", difficulty: "medium",
            placement: 1, roundCount: 7, bidMet: 5, bidExceeded: 1, bidMissed: 1, completedAt: 999
          })
        ).toBe(false);
        // Otra SP spēle, hard, 3. vieta.
        expect(
          await storage.recordGameResult({
            id: "sp:tok-2", userId: "user-1", mode: "sp", difficulty: "hard",
            placement: 3, roundCount: 5, bidMet: 4, bidExceeded: 0, bidMissed: 1, completedAt: 200
          })
        ).toBe(true);
        // MP spēle (bez difficulty), 2. vieta.
        expect(
          await storage.recordGameResult({
            id: "mp:match-A:user-1", userId: "user-1", mode: "mp",
            placement: 2, roundCount: 7, bidMet: 3, bidExceeded: 2, bidMissed: 2, completedAt: 300
          })
        ).toBe(true);

        const agg = [...(await storage.getPlayerGameStats("user-1"))].sort((a, b) =>
          `${a.mode}|${a.difficulty}|${a.placement}`.localeCompare(
            `${b.mode}|${b.difficulty}|${b.placement}`
          )
        );
        expect(agg).toEqual([
          { mode: "mp", difficulty: null, placement: 2, games: 1, bidMet: 3, bidExceeded: 2, bidMissed: 2 },
          { mode: "sp", difficulty: "hard", placement: 3, games: 1, bidMet: 4, bidExceeded: 0, bidMissed: 1 },
          { mode: "sp", difficulty: "medium", placement: 1, games: 1, bidMet: 5, bidExceeded: 1, bidMissed: 1 }
        ]);
      });

      it("sums multiple games within the same (mode, difficulty, placement) group", async () => {
        for (const [i, ts] of [100, 200].entries()) {
          expect(
            await storage.recordGameResult({
              id: `sp:dup-${i}`, userId: "user-1", mode: "sp", difficulty: "epic",
              placement: 1, roundCount: 4, bidMet: 2, bidExceeded: 1, bidMissed: 1, completedAt: ts
            })
          ).toBe(true);
        }
        expect(await storage.getPlayerGameStats("user-1")).toEqual([
          { mode: "sp", difficulty: "epic", placement: 1, games: 2, bidMet: 4, bidExceeded: 2, bidMissed: 2 }
        ]);
      });

      it("rejects invalid records (sum mismatch, mode/difficulty mismatch, range) without writing", async () => {
        const base = {
          id: "sp:bad", userId: "user-1", mode: "sp" as const, difficulty: "medium" as const,
          placement: 1, roundCount: 7, bidMet: 5, bidExceeded: 1, bidMissed: 1, completedAt: 1
        };
        // Solījumu summa != raundu skaits.
        await expect(storage.recordGameResult({ ...base, id: "sp:bad1", bidMissed: 99 })).rejects.toThrow();
        // SP bez difficulty.
        await expect(storage.recordGameResult({ ...base, id: "sp:bad2", difficulty: undefined })).rejects.toThrow();
        // MP ar difficulty.
        await expect(storage.recordGameResult({ ...base, id: "mp:bad3", mode: "mp" })).rejects.toThrow();
        // Placement ārpus 1..4.
        await expect(storage.recordGameResult({ ...base, id: "sp:bad4", placement: 5 })).rejects.toThrow();
        // Neviens nederīgais ieraksts nedrīkst būt ierakstīts.
        expect(await storage.getPlayerGameStats("user-1")).toEqual([]);
      });
    });

    describe("coin wallet (atomic, idempotent)", () => {
      beforeEach(async () => {
        expect(await storage.createUser(makeUser())).toBe("created");
      });

      it("returns 0 balance for a wallet with no ledger entries", async () => {
        expect(await storage.getBalance("user-1")).toBe(0);
      });

      it("rejects a first-ever debit on a wallet with no balance row (insufficient, not an error)", async () => {
        const res = await storage.applyLedger({
          id: "d1",
          userId: "user-1",
          delta: -100,
          reason: "mp_entry",
          ref: "entry-A",
          now: 100
        });
        expect(res).toEqual({ ok: false, reason: "insufficient" });
        expect(await storage.getBalance("user-1")).toBe(0);
      });

      it("applies a credit and reflects it in the balance", async () => {
        const res = await storage.applyLedger({
          id: "led-1",
          userId: "user-1",
          delta: 5000,
          reason: "signup",
          ref: "user-1",
          now: 100
        });
        expect(res).toEqual({ ok: true, applied: true, balance: 5000 });
        expect(await storage.getBalance("user-1")).toBe(5000);
      });

      it("is idempotent per (user, reason, ref): the second apply is a no-op", async () => {
        await storage.applyLedger({
          id: "led-1",
          userId: "user-1",
          delta: 5000,
          reason: "signup",
          ref: "user-1",
          now: 100
        });
        // Tā pati atslēga (cits id, cits delta) → idempotents no-op, bilance nemainās.
        const repeat = await storage.applyLedger({
          id: "led-2",
          userId: "user-1",
          delta: 999,
          reason: "signup",
          ref: "user-1",
          now: 200
        });
        expect(repeat).toEqual({ ok: true, applied: false, balance: 5000 });
        expect(await storage.getBalance("user-1")).toBe(5000);
      });

      it("debits when funds are sufficient and accumulates across distinct refs", async () => {
        await storage.applyLedger({ id: "c1", userId: "user-1", delta: 5000, reason: "signup", ref: "user-1", now: 100 });
        const debit = await storage.applyLedger({
          id: "d1",
          userId: "user-1",
          delta: -300,
          reason: "mp_entry",
          ref: "entry-A",
          now: 200
        });
        expect(debit).toEqual({ ok: true, applied: true, balance: 4700 });
        const debit2 = await storage.applyLedger({
          id: "d2",
          userId: "user-1",
          delta: -700,
          reason: "mp_entry",
          ref: "entry-B",
          now: 300
        });
        expect(debit2).toEqual({ ok: true, applied: true, balance: 4000 });
      });

      it("sums ledger deltas by (user, reason) since a timestamp (daily-cap support)", async () => {
        await storage.applyLedger({ id: "s1", userId: "user-1", delta: 100, reason: "sp_reward", ref: "g1", now: 1000 });
        await storage.applyLedger({ id: "s2", userId: "user-1", delta: 300, reason: "sp_reward", ref: "g2", now: 2000 });
        await storage.applyLedger({ id: "s3", userId: "user-1", delta: 5000, reason: "signup", ref: "user-1", now: 1500 });
        // Visi sp_reward kopš laika 0.
        expect(await storage.sumLedgerSince("user-1", "sp_reward", 0)).toBe(400);
        // Tikai kopš 1500 → izslēdz g1 (now=1000).
        expect(await storage.sumLedgerSince("user-1", "sp_reward", 1500)).toBe(300);
        // Cits reason netiek jaukts.
        expect(await storage.sumLedgerSince("user-1", "signup", 0)).toBe(5000);
        // Nav rindu → 0.
        expect(await storage.sumLedgerSince("user-1", "mp_payout", 0)).toBe(0);
      });

      it("rejects a debit that would breach the minBalance guard and leaves balance + ledger untouched", async () => {
        await storage.applyLedger({ id: "c1", userId: "user-1", delta: 100, reason: "signup", ref: "user-1", now: 100 });
        const tooBig = await storage.applyLedger({
          id: "d1",
          userId: "user-1",
          delta: -500,
          reason: "mp_entry",
          ref: "entry-A",
          now: 200
        });
        expect(tooBig).toEqual({ ok: false, reason: "insufficient" });
        expect(await storage.getBalance("user-1")).toBe(100);
        // Sargs atritināja ledger rindu → tā PATI atslaga ar pieņemamu summu tagad piemērojas.
        const ok = await storage.applyLedger({
          id: "d2",
          userId: "user-1",
          delta: -40,
          reason: "mp_entry",
          ref: "entry-A",
          now: 300
        });
        expect(ok).toEqual({ ok: true, applied: true, balance: 60 });
      });
    });
  });
}
