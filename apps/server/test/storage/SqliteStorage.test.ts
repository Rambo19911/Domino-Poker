import { DatabaseSync } from "node:sqlite";

import type { MultiplayerEvent } from "@domino-poker/core/multiplayer";
import type { ChatMessage } from "@domino-poker/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import type { MatchStartedRecord } from "../../src/storage/StoragePort.js";

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

describe("SqliteStorage", () => {
  let storage: SqliteStorage;

  beforeEach(() => {
    storage = new SqliteStorage({ filename: ":memory:" });
  });

  afterEach(async () => {
    await storage.close();
  });

  describe("matches + event log", () => {
    it("saves a started match and loads it as unfinished with its events", async () => {
      await storage.saveMatchStarted(makeMatch());
      await storage.appendMatchEvent("room-1", { seq: 1, event: bidEvent(1) });
      await storage.appendMatchEvent("room-1", { seq: 2, event: bidEvent(2) });

      const loaded = await storage.loadUnfinishedMatch("room-1");
      expect(loaded?.match.seed).toBe("seed-abc");
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
      // Pirmais starts paliek (INSERT OR IGNORE), dublētais seq netiek pievienots.
      expect(loaded?.match.seed).toBe("seed-abc");
      expect(loaded?.events).toHaveLength(1);
    });

    it("hides a finished match from loadUnfinishedMatch and keeps the result", async () => {
      await storage.saveMatchStarted(makeMatch());
      await storage.appendMatchEvent("room-1", { seq: 1, event: bidEvent(1) });
      await storage.saveMatchFinished({
        matchId: "room-1",
        winnerPlayerId: "1",
        finishedAt: 5000
      });

      expect(await storage.loadUnfinishedMatch("room-1")).toBeUndefined();

      const [summary] = await storage.listRecentMatches(10);
      expect(summary?.finishedAt).toBe(5000);
      expect(summary?.winnerPlayerId).toBe("1");
      expect(summary?.eventCount).toBe(1);
    });

    it("returns undefined for an unknown match", async () => {
      expect(await storage.loadUnfinishedMatch("nope")).toBeUndefined();
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
    it("returns undefined before any stats are stored", async () => {
      expect(await storage.getPlayerStats("P-1")).toBeUndefined();
    });

    it("upserts player stats", async () => {
      await storage.savePlayerStats({
        playerId: "P-1",
        gamesPlayed: 1,
        gamesWon: 0,
        updatedAt: 100
      });
      await storage.savePlayerStats({
        playerId: "P-1",
        gamesPlayed: 2,
        gamesWon: 1,
        updatedAt: 200
      });

      expect(await storage.getPlayerStats("P-1")).toEqual({
        playerId: "P-1",
        gamesPlayed: 2,
        gamesWon: 1,
        updatedAt: 200
      });
    });

    it("increments player stats in one storage operation", async () => {
      await storage.incrementPlayerStats({
        playerId: "P-1",
        gamesPlayedDelta: 1,
        gamesWonDelta: 0,
        updatedAt: 100
      });
      await storage.incrementPlayerStats({
        playerId: "P-1",
        gamesPlayedDelta: 1,
        gamesWonDelta: 1,
        updatedAt: 200
      });
      await storage.incrementPlayerStats({
        playerId: "P-1",
        gamesPlayedDelta: 1,
        gamesWonDelta: 0,
        updatedAt: 150
      });

      expect(await storage.getPlayerStats("P-1")).toEqual({
        playerId: "P-1",
        gamesPlayed: 3,
        gamesWon: 1,
        updatedAt: 200
      });
    });
  });

  describe("chat history (survives restart)", () => {
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
});

describe("SqliteStorage persistence across reopen", () => {
  const tmpFile = `./data/test-${process.pid}-${Math.floor(performance.now())}.sqlite`;

  afterEach(async () => {
    const { rmSync } = await import("node:fs");
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(`${tmpFile}${suffix}`, { force: true });
    }
  });

  it("loads chat history written before a simulated restart", async () => {
    const first = new SqliteStorage({ filename: tmpFile });
    await first.appendChatMessage(chat("persisted-1", 100));
    await first.appendChatMessage(chat("persisted-2", 200));
    await first.close();

    const second = new SqliteStorage({ filename: tmpFile });
    const recent = await second.loadRecentChatMessages(10);
    expect(recent.map((message) => message.id)).toEqual(["persisted-1", "persisted-2"]);
    await second.close();
  });
});

describe("SqliteStorage schema version tracking", () => {
  const tmpFile = `./data/test-migrate-${process.pid}-${Math.floor(performance.now())}.sqlite`;

  afterEach(async () => {
    const { rmSync } = await import("node:fs");
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(`${tmpFile}${suffix}`, { force: true });
    }
  });

  function recordedMigrations(): string[] {
    const db = new DatabaseSync(tmpFile);
    const rows = db.prepare(`SELECT id FROM schema_migrations ORDER BY id`).all() as Array<{
      readonly id: string;
    }>;
    db.close();
    return rows.map((row) => row.id);
  }

  it("records every migration id on fresh boot and re-running is idempotent", async () => {
    const first = new SqliteStorage({ filename: tmpFile });
    await first.close();

    expect(recordedMigrations()).toEqual([
      "0001_initial_schema",
      "0002_auth_schema",
      "0003_user_stats",
      "0004_password_reset_tokens",
      "0005_custom_avatars",
      "0006_user_preferences",
      "0007_coin_wallet"
    ]);

    // Reopen: nepiemēro neko atkārtoti (joprojām tieši tās pašas rindas).
    const second = new SqliteStorage({ filename: tmpFile });
    await second.close();
    expect(recordedMigrations()).toHaveLength(7);
  });
});
