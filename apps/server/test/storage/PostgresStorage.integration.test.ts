import { Client, Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PostgresStorage } from "../../src/storage/PostgresStorage.js";
import { runMigrations } from "../../src/storage/migrations.js";

const postgresUrl = process.env.TEST_POSTGRES_DATABASE_URL?.trim();
const describeIfPostgres = postgresUrl ? describe : describe.skip;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function withSearchPath(connectionString: string, schemaName: string): string {
  const url = new URL(connectionString);
  url.searchParams.set("options", `-c search_path=${schemaName}`);
  return url.toString();
}

function gameOver(gameId: string) {
  return { type: "GAME_OVER" as const, gameId, eventSeq: 2, winnerPlayerId: "1" };
}

describeIfPostgres("PostgresStorage integration", () => {
  let client: Client;
  let storage: PostgresStorage;
  let schemaName: string;

  beforeEach(async () => {
    schemaName = `domino_poker_test_${process.pid}_${Date.now()}`;
    client = new Client({ connectionString: postgresUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    storage = await PostgresStorage.open(withSearchPath(postgresUrl!, schemaName));
  });

  afterEach(async () => {
    if (storage) {
      await storage.close();
    }
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
      await client.end();
    }
  });

  it("round-trips matches, events, stats, and chat through a real PostgreSQL database", async () => {
    await storage.saveMatchStarted({
      matchId: "room-1",
      seed: "seed-abc",
      numberOfRounds: 7,
      players: [
        { seatIndex: 0, corePlayerId: "1", kind: "human", displayId: "#p1" },
        { seatIndex: 1, corePlayerId: "2", kind: "bot" }
      ],
      startedAt: 1000
    });
    await storage.appendMatchEvent("room-1", {
      seq: 1,
      event: { type: "TURN_STARTED", gameId: "room-1", eventSeq: 1, turn: {} as never }
    });
    await storage.appendMatchEvent("room-1", { seq: 2, event: gameOver("room-1") });
    await storage.appendMatchEvent("room-1", { seq: 2, event: gameOver("room-1") });

    const unfinished = await storage.loadUnfinishedMatch("room-1");
    expect(unfinished?.match.seed).toBe("seed-abc");
    expect(unfinished?.events.map((entry) => entry.seq)).toEqual([1, 2]);

    await storage.saveMatchFinished({
      matchId: "room-1",
      winnerPlayerId: "1",
      finishedAt: 5000
    });
    expect(await storage.loadUnfinishedMatch("room-1")).toBeUndefined();
    expect((await storage.listRecentMatches(10))[0]).toMatchObject({
      matchId: "room-1",
      finishedAt: 5000,
      winnerPlayerId: "1",
      eventCount: 2
    });

    await storage.incrementPlayerStats({
      playerId: "#p1",
      gamesPlayedDelta: 1,
      gamesWonDelta: 0,
      updatedAt: 100
    });
    await storage.incrementPlayerStats({
      playerId: "#p1",
      gamesPlayedDelta: 1,
      gamesWonDelta: 1,
      updatedAt: 200
    });
    expect(await storage.getPlayerStats("#p1")).toEqual({
      playerId: "#p1",
      gamesPlayed: 2,
      gamesWon: 1,
      updatedAt: 200
    });

    await storage.appendChatMessage({
      id: "chat-1",
      authorDisplayId: "#p1",
      text: "hello",
      serverNow: 100
    });
    await storage.appendChatMessage({
      id: "chat-1",
      authorDisplayId: "#p1",
      text: "duplicate ignored",
      serverNow: 200
    });
    expect(await storage.loadRecentChatMessages(10)).toEqual([
      { id: "chat-1", authorDisplayId: "#p1", text: "hello", serverNow: 100 }
    ]);

    const acquired = await storage.acquireRoomLease({
      roomId: "room-1",
      ownerInstanceId: "instance-a",
      now: 1000,
      ttlMs: 5000
    });
    expect(acquired).toMatchObject({
      roomId: "room-1",
      ownerInstanceId: "instance-a",
      expiresAt: 6000
    });
    await expect(
      storage.acquireRoomLease({
        roomId: "room-1",
        ownerInstanceId: "instance-b",
        now: 2000,
        ttlMs: 5000
      })
    ).resolves.toBeUndefined();
    await expect(
      storage.renewRoomLease({
        roomId: "room-1",
        ownerInstanceId: "instance-a",
        now: 3000,
        ttlMs: 5000
      })
    ).resolves.toMatchObject({ expiresAt: 8000, updatedAt: 3000 });
    await expect(storage.releaseRoomLease("room-1", "instance-b")).resolves.toBe(false);
    await expect(storage.releaseRoomLease("room-1", "instance-a")).resolves.toBe(true);
    await expect(storage.getRoomLease("room-1")).resolves.toBeUndefined();
  });

  it("records the consolidated baseline and re-running migrations is idempotent", async () => {
    const table = `${quoteIdentifier(schemaName)}.schema_migrations`;
    const recorded = await client.query<{ readonly id: string }>(`SELECT id FROM ${table}`);
    expect(recorded.rows.map((row) => row.id)).toEqual(["0001_initial_schema"]);

    const pool = new Pool({ connectionString: withSearchPath(postgresUrl!, schemaName) });
    try {
      await expect(runMigrations(pool)).resolves.toEqual([]);
    } finally {
      await pool.end();
    }

    const after = await client.query<{ readonly count: string }>(
      `SELECT count(*) AS count FROM ${table}`
    );
    expect(Number(after.rows[0]?.count)).toBe(1);
  });

  it("reports DB health, pool stats, fanout backlog, and table sizes", async () => {
    const empty = await storage.healthCheck();
    expect(empty.ok).toBe(true);
    expect(empty.latencyMs).toBeGreaterThanOrEqual(0);
    expect(empty.pool.waiting).toBe(0);
    expect(empty.fanout.rows).toBe(0);
    expect(empty.fanout.oldestAgeMs).toBe(0);
    expect(empty.tables).toHaveProperty("server_event_fanout");
    expect(empty.tables).toHaveProperty("matches");
    expect(empty.tables["server_event_fanout"]?.bytes).toBeGreaterThanOrEqual(0);

    await client.query(
      `INSERT INTO ${quoteIdentifier(schemaName)}.server_event_fanout
         (event_id, origin_instance_id, message_json, created_at)
       VALUES ($1, $2, $3::jsonb, $4)`,
      ["evt-1", "instance-x", JSON.stringify({ kind: "broadcast" }), 100]
    );

    const withBacklog = await storage.healthCheck();
    expect(withBacklog.fanout.rows).toBe(1);
    expect(withBacklog.fanout.oldestAgeMs).toBeGreaterThan(0);
  });

  it("keeps player stat increments atomic under concurrent PostgreSQL writes", async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        storage.incrementPlayerStats({
          playerId: "#p1",
          gamesPlayedDelta: 1,
          gamesWonDelta: index % 5 === 0 ? 1 : 0,
          updatedAt: 1000 + index
        })
      )
    );

    expect(await storage.getPlayerStats("#p1")).toEqual({
      playerId: "#p1",
      gamesPlayed: 25,
      gamesWon: 5,
      updatedAt: 1024
    });
  });

  it("serializes competing room lease owners in PostgreSQL", async () => {
    const results = await Promise.all([
      storage.acquireRoomLease({
        roomId: "room-lease",
        ownerInstanceId: "instance-a",
        now: 1000,
        ttlMs: 5000
      }),
      storage.acquireRoomLease({
        roomId: "room-lease",
        ownerInstanceId: "instance-b",
        now: 1000,
        ttlMs: 5000
      })
    ]);

    const winners = results.filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.ownerInstanceId).toMatch(/^instance-[ab]$/);

    const firstOwner = winners[0]?.ownerInstanceId;
    const secondOwner = firstOwner === "instance-a" ? "instance-b" : "instance-a";
    await expect(
      storage.acquireRoomLease({
        roomId: "room-lease",
        ownerInstanceId: secondOwner,
        now: 2000,
        ttlMs: 5000
      })
    ).resolves.toBeUndefined();
    await expect(
      storage.acquireRoomLease({
        roomId: "room-lease",
        ownerInstanceId: secondOwner,
        now: 6001,
        ttlMs: 5000
      })
    ).resolves.toMatchObject({
      roomId: "room-lease",
      ownerInstanceId: secondOwner,
      expiresAt: 11001
    });
  });

  it("round-trips durable sessions through PostgreSQL", async () => {
    await expect(
      storage.createSessionIfAbsent({
        playerId: "client-A",
        reconnectToken: "token-1",
        displayId: "#12345",
        createdAt: 1000,
        updatedAt: 1000
      })
    ).resolves.toBe("created");
    await expect(storage.getSession("client-A")).resolves.toEqual({
      playerId: "client-A",
      reconnectToken: "token-1",
      displayId: "#12345",
      updatedAt: 1000
    });
    await expect(
      storage.createSessionIfAbsent({
        playerId: "client-B",
        reconnectToken: "token-2",
        displayId: "#12345",
        createdAt: 1000,
        updatedAt: 1000
      })
    ).resolves.toBe("display_id_taken");

    await storage.deleteSession("client-A");
    await expect(storage.getSession("client-A")).resolves.toBeUndefined();
  });
});
