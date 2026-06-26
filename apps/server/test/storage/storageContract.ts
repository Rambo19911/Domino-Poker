import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MultiplayerEvent } from "@domino-poker/core/multiplayer";
import type { ChatMessage } from "@domino-poker/shared";

import type { AdminStore } from "../../src/admin/AdminStore.js";
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
export type ContractStorage = StoragePort & AuthStore & CoinStore & PlayerStatsStore & AdminStore;

/** sha256-garuma (64 hex) palīgs admin OTP/sesijas hash testiem. */
function hex(seed: string): string {
  return seed.repeat(64).slice(0, 64);
}

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

      it("accepts the admin_adjust reason after 0010 dropped the coin_ledger reason CHECK (D6)", async () => {
        // Pierāda, ka migrācija 0010 noņēma `reason` CHECK enum ABOS dialektos — citādi
        // `admin_adjust` insert mestu CHECK pārkāpumu. (Iemeslu tagad enforcē TS domēna slānis.)
        const credit = await storage.applyLedger({
          id: "a1",
          userId: "user-1",
          delta: 250,
          reason: "admin_adjust",
          ref: "adj-1",
          now: 100
        });
        expect(credit).toEqual({ ok: true, applied: true, balance: 250 });
        // Idempotents pēc (user, admin_adjust, ref): atkārtots adj-1 = no-op.
        const repeat = await storage.applyLedger({
          id: "a2",
          userId: "user-1",
          delta: 250,
          reason: "admin_adjust",
          ref: "adj-1",
          now: 200
        });
        expect(repeat).toEqual({ ok: true, applied: false, balance: 250 });
        // minBalance sargs joprojām strādā uz admin debetu (bilance < 0 nedrīkst).
        const overdraw = await storage.applyLedger({
          id: "a3",
          userId: "user-1",
          delta: -1000,
          reason: "admin_adjust",
          ref: "adj-2",
          minBalance: 0,
          now: 300
        });
        expect(overdraw).toEqual({ ok: false, reason: "insufficient" });
        expect(await storage.getBalance("user-1")).toBe(250);
      });
    });

    describe("admin player writes (account, stats, credentials)", () => {
      beforeEach(async () => {
        expect(
          await storage.createUser(
            makeUser({ email: "old@example.com", emailNorm: "old@example.com" })
          )
        ).toBe("created");
      });

      it("updates account fields (display name, email, avatar) atomically", async () => {
        const result = await storage.adminUpdateAccount("user-1", {
          username: "NewName",
          usernameNorm: "newname",
          email: "new@example.com",
          emailNorm: "new@example.com",
          avatar: "avatar-3",
          updatedAt: 2000
        });
        expect(result).toBe("updated");
        const user = await storage.getUserById("user-1");
        expect(user?.username).toBe("NewName");
        expect(user?.email).toBe("new@example.com");
        expect(user?.avatar).toBe("avatar-3");
      });

      it("deletes the orphan custom avatar blob when admin switches to a preset", async () => {
        await storage.setUserAvatar({
          userId: "user-1",
          contentType: "image/png",
          bytes: new Uint8Array([1, 2, 3]),
          updatedAt: 1500
        });
        expect(await storage.getUserAvatar("user-1")).toBeDefined();
        // Admin pārslēdz uz preset → blob jādzēš (citādi hasCustomAvatar paliek true).
        await storage.adminUpdateAccount("user-1", {
          username: "Rihards",
          usernameNorm: "rihards",
          email: undefined,
          emailNorm: undefined,
          avatar: "avatar-5",
          updatedAt: 2500
        });
        expect(await storage.getUserAvatar("user-1")).toBeUndefined();
      });

      it("keeps the custom avatar blob when admin update leaves avatar = 'custom'", async () => {
        await storage.setUserAvatar({
          userId: "user-1",
          contentType: "image/png",
          bytes: new Uint8Array([9, 9]),
          updatedAt: 1500
        });
        await storage.adminUpdateAccount("user-1", {
          username: "Renamed",
          usernameNorm: "renamed",
          email: undefined,
          emailNorm: undefined,
          avatar: "custom",
          updatedAt: 2500
        });
        expect(await storage.getUserAvatar("user-1")).toBeDefined();
      });

      it("reports conflict when the new username collides with another account", async () => {
        await storage.createUser(
          makeUser({ id: "user-2", username: "Taken", usernameNorm: "taken" })
        );
        const result = await storage.adminUpdateAccount("user-1", {
          username: "Taken",
          usernameNorm: "taken",
          email: "old@example.com",
          emailNorm: "old@example.com",
          avatar: "default",
          updatedAt: 2000
        });
        expect(result).toBe("conflict");
      });

      it("reports not_found for an unknown account", async () => {
        const result = await storage.adminUpdateAccount("ghost", {
          username: "X",
          usernameNorm: "x",
          email: undefined,
          emailNorm: undefined,
          avatar: "default",
          updatedAt: 2000
        });
        expect(result).toBe("not_found");
      });

      it("sets the user_stats aggregate (overwrite, not increment) and upserts when missing", async () => {
        await storage.adminSetUserStats("user-1", { gamesPlayed: 5, wins: 3, losses: 2 }, 1000);
        expect(await storage.getUserStats("user-1")).toMatchObject({
          gamesPlayed: 5,
          wins: 3,
          losses: 2
        });
        // Otrā korekcija PĀRRAKSTA (NE inkrements).
        await storage.adminSetUserStats("user-1", { gamesPlayed: 10, wins: 7, losses: 3 }, 2000);
        expect(await storage.getUserStats("user-1")).toMatchObject({
          gamesPlayed: 10,
          wins: 7,
          losses: 3
        });
      });

      it("invalidates credentials: changes the password hash and revokes all auth tokens", async () => {
        await storage.createAuthToken({
          tokenHash: hex("t"),
          userId: "user-1",
          createdAt: 100,
          lastUsedAt: 100,
          expiresAt: 9_000_000
        });
        await storage.adminInvalidateCredentials("user-1", "scrypt$brand-new", 3000);
        const user = await storage.getUserById("user-1");
        expect(user?.passwordHash).toBe("scrypt$brand-new");
        // Visas sesijas atsauktas (piespiedu izlogošana).
        expect(await storage.getAuthToken(hex("t"))).toBeUndefined();
      });
    });

    describe("bans (Phase 3.1)", () => {
      beforeEach(async () => {
        expect(await storage.createUser(makeUser())).toBe("created");
      });

      function banRecord(over: Partial<Parameters<ContractStorage["createBan"]>[0]> = {}) {
        return {
          id: "ban-1",
          userId: "user-1",
          ip: undefined,
          reason: "cheating",
          kind: "permanent" as const,
          durationLabel: "Permanent",
          expiresAt: undefined,
          createdAt: 1000,
          revokedAt: undefined,
          createdBy: "admin",
          ...over
        };
      }

      it("creates and reads a ban back by id", async () => {
        await storage.createBan(banRecord());
        const ban = await storage.getBanById("ban-1");
        expect(ban).toMatchObject({ id: "ban-1", userId: "user-1", kind: "permanent", reason: "cheating" });
      });

      it("finds an active permanent user ban and stops finding it after revoke", async () => {
        await storage.createBan(banRecord());
        expect(await storage.findActiveUserBan("user-1", 5000)).toMatchObject({ id: "ban-1" });
        // Atsaukšana → vairs nav aktīvs; idempotents (otrā revoke → false).
        expect(await storage.revokeBan("ban-1", 6000)).toBe(true);
        expect(await storage.revokeBan("ban-1", 7000)).toBe(false);
        expect(await storage.findActiveUserBan("user-1", 8000)).toBeUndefined();
      });

      it("treats a temporary ban as active only before expiry", async () => {
        await storage.createBan(
          banRecord({ id: "ban-t", kind: "temporary", durationLabel: "7 days", expiresAt: 10_000 })
        );
        expect(await storage.findActiveUserBan("user-1", 9_999)).toMatchObject({ id: "ban-t" });
        // Tieši pēc beigām → vairs nav aktīvs (auto-beidzas, owner D1 lēmums).
        expect(await storage.findActiveUserBan("user-1", 10_001)).toBeUndefined();
        // Revoke uz JAU-beigušos banu → false (not_active; tikai aktīvus var atsaukt — Codex).
        expect(await storage.revokeBan("ban-t", 10_002)).toBe(false);
      });

      it("finds an active ip ban (user_id NULL)", async () => {
        await storage.createBan(
          banRecord({ id: "ban-ip", userId: undefined, ip: "9.9.9.9" })
        );
        expect(await storage.findActiveIpBan("9.9.9.9", 5000)).toMatchObject({ id: "ban-ip", ip: "9.9.9.9" });
        expect(await storage.findActiveIpBan("1.2.3.4", 5000)).toBeUndefined();
      });

      it("lists bans newest-first incl. revoked", async () => {
        await storage.createBan(banRecord({ id: "b1", createdAt: 1000 }));
        await storage.createBan(banRecord({ id: "b2", createdAt: 3000, userId: undefined, ip: "8.8.8.8" }));
        const bans = await storage.listBans(10, 0);
        expect(bans.map((b) => b.id)).toEqual(["b2", "b1"]);
      });

      it("deletes all of a user's auth tokens (ban → forced HTTP logout)", async () => {
        await storage.createAuthToken({
          tokenHash: hex("a"), userId: "user-1", createdAt: 1, lastUsedAt: 1, expiresAt: 9_000_000
        });
        await storage.createAuthToken({
          tokenHash: hex("b"), userId: "user-1", createdAt: 1, lastUsedAt: 1, expiresAt: 9_000_000
        });
        await storage.deleteUserAuthTokens("user-1");
        expect(await storage.getAuthToken(hex("a"))).toBeUndefined();
        expect(await storage.getAuthToken(hex("b"))).toBeUndefined();
      });
    });

    describe("analytics + governance (Phase 4)", () => {
      it("computes overview aggregates over users / logins / coins", async () => {
        await storage.createUser(makeUser({ id: "u-old", username: "Old", usernameNorm: "old", createdAt: 1000 }));
        await storage.createUser(makeUser({ id: "u-new", username: "New", usernameNorm: "new", createdAt: 50_000 }));
        await storage.appendLoginAttempt({
          id: "la-1", userId: "u-new", usernameTried: "New", source: "password", success: true, createdAt: 50_000
        });
        await storage.appendLoginAttempt({
          id: "la-2", userId: "u-new", usernameTried: "New", source: "password", success: true, createdAt: 50_001
        });
        await storage.applyLedger({ id: "c1", userId: "u-old", delta: 5000, reason: "signup", ref: "u-old", now: 1 });
        expect(await storage.countUsers()).toBe(2);
        expect(await storage.countNewUsers(40_000)).toBe(1); // tikai u-new
        // Atšķirīgi aktīvie konti (2 login no u-new → 1 atšķirīgs lietotājs).
        expect(await storage.countActiveUsers(40_000)).toBe(1);
        expect(await storage.sumCoinBalances()).toBe(5000);
        expect(await storage.countActiveBans(99_999)).toBe(0);
        const regs = await storage.dailyRegistrations(0);
        expect(regs.reduce((a, b) => a + b.count, 0)).toBe(2);
      });

      it("segments: new / inactive / suspicious", async () => {
        await storage.createUser(makeUser({ id: "u-1", username: "Fresh", usernameNorm: "fresh", createdAt: 90_000 }));
        await storage.createUser(makeUser({ id: "u-2", username: "Ghost", usernameNorm: "ghost", createdAt: 1000 }));
        // u-2 daudz neveiksmīgu login → aizdomīgs; u-2 nav veiksmīga login → neaktīvs.
        for (let i = 0; i < 6; i += 1) {
          await storage.appendLoginAttempt({
            id: `f-${i}`, userId: "u-2", usernameTried: "Ghost", source: "password", success: false, createdAt: 80_000 + i
          });
        }
        expect((await storage.listNewPlayers(50_000, 10)).map((p) => p.id)).toContain("u-1");
        expect((await storage.listInactivePlayers(50_000, 10)).map((p) => p.id)).toEqual(
          expect.arrayContaining(["u-1", "u-2"])
        );
        const susp = await storage.listSuspiciousPlayers(50_000, 5, 10);
        expect(susp.find((p) => p.id === "u-2")?.failedAttempts).toBe(6);
      });

      it("geo/platform segments: distinct (user,ip) + (user,ua) pairs for successful logins only", async () => {
        await storage.createUser(makeUser({ id: "u-a", username: "A", usernameNorm: "a", createdAt: 1000 }));
        await storage.createUser(makeUser({ id: "u-b", username: "B", usernameNorm: "b", createdAt: 1000 }));
        // u-a: 3 veiksmīgi login no 2 IP ar to pašu UA — DISTINCT dod 2 IP pārus + 1 UA pāri.
        await storage.appendLoginAttempt({ id: "g1", userId: "u-a", usernameTried: "A", ip: "8.8.8.8", userAgent: "M-UA", source: "password", success: true, createdAt: 50_000 });
        await storage.appendLoginAttempt({ id: "g2", userId: "u-a", usernameTried: "A", ip: "8.8.4.4", userAgent: "M-UA", source: "password", success: true, createdAt: 50_001 });
        await storage.appendLoginAttempt({ id: "g3", userId: "u-a", usernameTried: "A", ip: "8.8.8.8", userAgent: "M-UA", source: "password", success: true, createdAt: 50_002 });
        // u-b: viens veiksmīgs login BEZ UA (NULL spainis).
        await storage.appendLoginAttempt({ id: "g4", userId: "u-b", usernameTried: "B", ip: "1.1.1.1", source: "password", success: true, createdAt: 50_003 });
        // Neveiksmīgs login — NEDRĪKST parādīties.
        await storage.appendLoginAttempt({ id: "g5", userId: "u-b", usernameTried: "B", ip: "2.2.2.2", userAgent: "X", source: "password", success: false, createdAt: 50_004 });
        // Pirms loga — izslēgts.
        await storage.appendLoginAttempt({ id: "g6", userId: "u-a", usernameTried: "A", ip: "9.9.9.9", source: "password", success: true, createdAt: 40_000 });

        const ips = await storage.successfulLoginUserIps(50_000, 1000);
        expect(ips.map((r) => `${r.userId}|${r.ip}`).sort()).toEqual(["u-a|8.8.4.4", "u-a|8.8.8.8", "u-b|1.1.1.1"]);

        const uas = await storage.successfulLoginUserAgents(50_000, 1000);
        expect(uas.map((r) => `${r.userId}|${r.userAgent ?? "∅"}`).sort()).toEqual(["u-a|M-UA", "u-b|∅"]);
      });

      it("exports full per-user data (no limit) for ledger / logins / bans", async () => {
        await storage.createUser(makeUser());
        await storage.applyLedger({ id: "l1", userId: "user-1", delta: 5000, reason: "signup", ref: "user-1", now: 1 });
        await storage.applyLedger({ id: "l2", userId: "user-1", delta: -100, reason: "mp_entry", ref: "e1", now: 2 });
        await storage.appendLoginAttempt({
          id: "la", userId: "user-1", usernameTried: "Rihards", source: "password", success: true, createdAt: 5
        });
        await storage.createBan({
          id: "b", userId: "user-1", reason: "x", kind: "permanent", durationLabel: "Permanent", createdAt: 3, createdBy: "admin"
        });
        expect(await storage.exportUserLedger("user-1")).toHaveLength(2);
        expect(await storage.exportUserLoginHistory("user-1")).toHaveLength(1);
        expect(await storage.exportUserBans("user-1")).toHaveLength(1);
      });

      it("anonymizeUserInMatches removes userId+clientId (keeps replay fields, idempotent, others untouched)", async () => {
        await storage.createUser(makeUser());
        await storage.saveMatchStarted({
          matchId: "m-1",
          seed: "s",
          numberOfRounds: 7,
          players: [
            { seatIndex: 0, corePlayerId: "1", kind: "human", clientId: "c-1", displayId: "P-100", userId: "user-1" },
            { seatIndex: 1, corePlayerId: "2", kind: "human", clientId: "c-2", displayId: "P-200", userId: "other" }
          ],
          startedAt: 1000
        });
        expect(await storage.anonymizeUserInMatches("user-1")).toBe(1);
        const loaded = await storage.loadUnfinishedMatch("m-1");
        const seats = loaded!.match.players;
        const mine = seats.find((s) => s.corePlayerId === "1")!;
        // userId + clientId DZĒSTI (undefined, NE null) — replay lauki saglabāti.
        expect(mine.userId).toBeUndefined();
        expect(mine.clientId).toBeUndefined();
        expect(mine.displayId).toBe("P-100");
        expect(mine.seatIndex).toBe(0);
        // Cita spēlētāja sēdvieta NETIEK aiztikta.
        expect(seats.find((s) => s.corePlayerId === "2")!.userId).toBe("other");
        // Idempotents: atkārtots → 0.
        expect(await storage.anonymizeUserInMatches("user-1")).toBe(0);
      });

      it("hardDeleteUser cascades dependents but keeps login_attempts (user_id → NULL)", async () => {
        await storage.createUser(makeUser());
        await storage.applyLedger({ id: "l1", userId: "user-1", delta: 5000, reason: "signup", ref: "user-1", now: 1 });
        await storage.createBan({
          id: "b", userId: "user-1", reason: "x", kind: "permanent", durationLabel: "Permanent", createdAt: 1, createdBy: "admin"
        });
        await storage.appendLoginAttempt({
          id: "la", userId: "user-1", usernameTried: "Rihards", source: "password", success: true, createdAt: 5
        });
        expect(await storage.hardDeleteUser("user-1")).toBe(true);
        // Konts + FK CASCADE rindas pazudušas.
        expect(await storage.getUserById("user-1")).toBeUndefined();
        expect(await storage.getBalance("user-1")).toBe(0);
        expect(await storage.exportUserBans("user-1")).toEqual([]);
        // login_attempts rinda PALIEK (SET NULL): vairs nesaista uz user-1, bet skaitās globāli.
        expect(await storage.exportUserLoginHistory("user-1")).toEqual([]);
        expect((await storage.dailyLogins(0)).reduce((a, b) => a + b.count, 0)).toBe(1);
        // Atkārtots hard-delete uz neesošu → false.
        expect(await storage.hardDeleteUser("user-1")).toBe(false);
      });
    });

    describe("chat blocked words (Phase 3.2)", () => {
      it("adds (idempotently), lists sorted, and removes blocked words", async () => {
        await storage.addBlockedWord("zeta", 100);
        await storage.addBlockedWord("alpha", 200);
        await storage.addBlockedWord("alpha", 300); // idempotents (PK)
        expect(await storage.listBlockedWords()).toEqual(["alpha", "zeta"]);
        await storage.removeBlockedWord("alpha");
        expect(await storage.listBlockedWords()).toEqual(["zeta"]);
      });
    });

    describe("admin store (sessions, OTP, audit, login attempts)", () => {
      it("creates, resolves, touches and revokes admin sessions", async () => {
        const tokenHash = hex("a");
        await storage.createAdminSession({
          tokenHash, createdAt: 100, lastUsedAt: 100, expiresAt: 1000, ip: "1.2.3.4", userAgent: "UA"
        });
        const got = await storage.getAdminSession(tokenHash);
        expect(got).toMatchObject({ tokenHash, expiresAt: 1000, ip: "1.2.3.4", userAgent: "UA", revokedAt: undefined });

        await storage.touchAdminSession(tokenHash, 500, 2000);
        expect((await storage.getAdminSession(tokenHash))?.expiresAt).toBe(2000);

        await storage.revokeAdminSession(tokenHash, 600);
        expect((await storage.getAdminSession(tokenHash))?.revokedAt).toBe(600);

        expect(await storage.getAdminSession(hex("z"))).toBeUndefined();
      });

      it("deletes expired admin sessions only", async () => {
        await storage.createAdminSession({ tokenHash: hex("a"), createdAt: 1, lastUsedAt: 1, expiresAt: 100 });
        await storage.createAdminSession({ tokenHash: hex("b"), createdAt: 1, lastUsedAt: 1, expiresAt: 9999 });
        await storage.deleteExpiredAdminSessions(500);
        expect(await storage.getAdminSession(hex("a"))).toBeUndefined();
        expect(await storage.getAdminSession(hex("b"))).toBeDefined();
      });

      it("consumes a valid OTP exactly once and rejects a wrong/expired/missing code", async () => {
        // Nav aktīva izaicinājuma.
        expect(await storage.consumeAdminLoginCode(hex("a"), 100, 5)).toEqual({ status: "no_code" });

        await storage.createAdminLoginCode({ codeHash: hex("a"), createdAt: 1, expiresAt: 1000, attempts: 0 });
        // Nepareizs kods (tāds pats garums) → invalid (attempts inkrementēts).
        expect(await storage.consumeAdminLoginCode(hex("b"), 100, 5)).toEqual({ status: "invalid" });
        // Pareizs kods → ok (patērēts).
        expect(await storage.consumeAdminLoginCode(hex("a"), 100, 5)).toEqual({ status: "ok" });
        // Atkārtots → jau patērēts → no_code.
        expect(await storage.consumeAdminLoginCode(hex("a"), 100, 5)).toEqual({ status: "no_code" });
      });

      it("locks the challenge after exceeding max attempts", async () => {
        await storage.createAdminLoginCode({ codeHash: hex("a"), createdAt: 1, expiresAt: 1000, attempts: 0 });
        expect(await storage.consumeAdminLoginCode(hex("b"), 10, 2)).toEqual({ status: "invalid" });
        expect(await storage.consumeAdminLoginCode(hex("b"), 10, 2)).toEqual({ status: "invalid" });
        // 3. mēģinājums pārsniedz griestus → locked (un izaicinājums invalidēts).
        expect(await storage.consumeAdminLoginCode(hex("b"), 10, 2)).toEqual({ status: "locked" });
        // Pat pareizs kods vairs nestrādā (izaicinājums patērēts).
        expect(await storage.consumeAdminLoginCode(hex("a"), 10, 2)).toEqual({ status: "no_code" });
      });

      it("treats an expired OTP as expired", async () => {
        await storage.createAdminLoginCode({ codeHash: hex("a"), createdAt: 1, expiresAt: 100, attempts: 0 });
        expect(await storage.consumeAdminLoginCode(hex("a"), 200, 5)).toEqual({ status: "expired" });
      });

      it("replaces the active OTP challenge when a new code is created", async () => {
        await storage.createAdminLoginCode({ codeHash: hex("a"), createdAt: 1, expiresAt: 1000, attempts: 0 });
        await storage.createAdminLoginCode({ codeHash: hex("b"), createdAt: 2, expiresAt: 1000, attempts: 0 });
        // Vecais kods vairs nav aktīvs; tikai jaunais der.
        expect(await storage.consumeAdminLoginCode(hex("a"), 100, 5)).toEqual({ status: "invalid" });
        expect(await storage.consumeAdminLoginCode(hex("b"), 100, 5)).toEqual({ status: "ok" });
      });

      it("appends audit entries and lists them newest first with diff round-trip", async () => {
        await storage.appendAdminAudit({
          id: "ev-1", action: "admin.login", summary: "signed in", createdAt: 100, ip: "1.1.1.1"
        });
        await storage.appendAdminAudit({
          id: "ev-2", action: "player.coins.adjust", targetType: "player", targetId: "user-1",
          summary: "+100 coins", diff: { before: 0, after: 100 }, createdAt: 200
        });
        const entries = await storage.listAdminAudit(10, 0);
        expect(entries.map((e) => e.id)).toEqual(["ev-2", "ev-1"]);
        expect(entries[0]).toMatchObject({
          action: "player.coins.adjust", targetType: "player", targetId: "user-1", diff: { before: 0, after: 100 }
        });
        expect(entries[1]).toMatchObject({ action: "admin.login", diff: undefined });
        // Lapošana: offset izlaiž jaunāko.
        expect((await storage.listAdminAudit(10, 1)).map((e) => e.id)).toEqual(["ev-1"]);
      });

      it("records player login attempts (success + failure, with and without a userId)", async () => {
        expect(await storage.createUser(makeUser())).toBe("created");
        await storage.appendLoginAttempt({
          id: "la-1", userId: "user-1", usernameTried: "Rihards", ip: "1.2.3.4",
          userAgent: "Mozilla/5.0", source: "password", success: true, createdAt: 100
        });
        // Neveiksme bez userId (nezināms lietotājs) — nedrīkst mest (FK SET NULL atļauj NULL).
        await storage.appendLoginAttempt({
          id: "la-2", usernameTried: "ghost", ip: "5.6.7.8", source: "password", success: false, createdAt: 200
        });
        // Idempotents pēc id (atkārtots netiek dublēts un nemet).
        await storage.appendLoginAttempt({
          id: "la-2", usernameTried: "ghost", source: "password", success: false, createdAt: 999
        });
      });

      it("searches players by id / display name / email and sorts by last successful login", async () => {
        expect(await storage.createUser(makeUser({ id: "u-alice", username: "Alice", usernameNorm: "alice", email: "alice@example.com", emailNorm: "alice@example.com", createdAt: 10 }))).toBe("created");
        expect(await storage.createUser(makeUser({ id: "u-bob", username: "Bob", usernameNorm: "bob", email: "bob@test.lv", emailNorm: "bob@test.lv", createdAt: 20 }))).toBe("created");
        expect(await storage.createUser(makeUser({ id: "u-carol", username: "Carol", usernameNorm: "carol", createdAt: 30 }))).toBe("created");
        // Last successful logins: bob @300 (newest), alice @100; carol never.
        await storage.appendLoginAttempt({ id: "a1", userId: "u-alice", usernameTried: "Alice", source: "password", success: true, createdAt: 100 });
        await storage.appendLoginAttempt({ id: "a2", userId: "u-bob", usernameTried: "Bob", source: "password", success: true, createdAt: 300 });
        await storage.appendLoginAttempt({ id: "a3", userId: "u-bob", usernameTried: "Bob", source: "password", success: false, createdAt: 400 });

        // No query → all, sorted by last-login desc (bob, alice), never-logged last (carol).
        const all = await storage.searchPlayers(undefined, 10, 0);
        expect(all.map((p) => p.id)).toEqual(["u-bob", "u-alice", "u-carol"]);
        expect(all.find((p) => p.id === "u-bob")?.lastLoginAt).toBe(300);
        expect(all.find((p) => p.id === "u-carol")?.lastLoginAt).toBeUndefined();

        // Search by exact id.
        expect((await storage.searchPlayers("u-carol", 10, 0)).map((p) => p.id)).toEqual(["u-carol"]);
        // Search by display name (case-insensitive substring).
        expect((await storage.searchPlayers("ali", 10, 0)).map((p) => p.id)).toEqual(["u-alice"]);
        // Search by email substring.
        expect((await storage.searchPlayers("test.lv", 10, 0)).map((p) => p.id)).toEqual(["u-bob"]);
        // No match → empty.
        expect(await storage.searchPlayers("zzz-nope", 10, 0)).toEqual([]);
      });

      it("returns paginated login history (newest first) and total/failed counts", async () => {
        expect(await storage.createUser(makeUser())).toBe("created");
        await storage.appendLoginAttempt({ id: "h1", userId: "user-1", usernameTried: "Rihards", ip: "1.1.1.1", userAgent: "UA1", source: "password", success: true, createdAt: 100 });
        await storage.appendLoginAttempt({ id: "h2", userId: "user-1", usernameTried: "Rihards", ip: "2.2.2.2", source: "password", success: false, createdAt: 200 });
        await storage.appendLoginAttempt({ id: "h3", userId: "user-1", usernameTried: "Rihards", source: "password", success: false, createdAt: 300 });

        const counts = await storage.countPlayerLoginAttempts("user-1");
        expect(counts).toEqual({ total: 3, failed: 2 });

        const page1 = await storage.getPlayerLoginHistory("user-1", 2, 0);
        expect(page1.map((e) => e.id)).toEqual(["h3", "h2"]); // newest first
        expect(page1[1]).toMatchObject({ id: "h2", ip: "2.2.2.2", success: false });
        const page2 = await storage.getPlayerLoginHistory("user-1", 2, 2);
        expect(page2.map((e) => e.id)).toEqual(["h1"]);
        expect(page2[0]).toMatchObject({ ip: "1.1.1.1", userAgent: "UA1", success: true });

        // No attempts → zeroes / empty.
        expect(await storage.countPlayerLoginAttempts("nobody")).toEqual({ total: 0, failed: 0 });
        expect(await storage.getPlayerLoginHistory("nobody", 10, 0)).toEqual([]);
      });
    });
  });
}
