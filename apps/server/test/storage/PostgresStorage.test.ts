import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";

import { isPostgresDatabaseUrl, openStorage, PostgresStorage, SqliteStorage } from "../../src/storage/index.js";

class RecordingPool {
  readonly queries: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  readonly rowQueue: unknown[][] = [];
  closed = false;
  // `pg` Pool atklāj šos getterus; healthCheck tos lasa pool piesātinājumam.
  totalCount = 0;
  idleCount = 0;
  waitingCount = 0;

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>> {
    this.queries.push({ text, values });
    const rows = (this.rowQueue.shift() ?? []) as T[];
    return { rows } as QueryResult<T>;
  }

  async end(): Promise<void> {
    this.closed = true;
  }
}

/**
 * Atrod pirmo query, kura teksts satur `needle`. Lietojam satura-bāzētu meklēšanu
 * (nevis fiksētus indeksus), jo `PostgresStorage.open/fromPool` tagad palaiž
 * migrāciju runner, kas pirms operāciju query izdod vairākus setup-query
 * (`schema_migrations` izveide, applied SELECT, migrācija, ieraksts).
 */
function queryContaining(pool: RecordingPool, needle: string) {
  return pool.queries.find((entry) => entry.text.includes(needle));
}

describe("storage factory", () => {
  it("detects PostgreSQL URLs", () => {
    expect(isPostgresDatabaseUrl("postgres://localhost/domino")).toBe(true);
    expect(isPostgresDatabaseUrl("postgresql://localhost/domino")).toBe(true);
    expect(isPostgresDatabaseUrl("./data/dev.sqlite")).toBe(false);
  });

  it("keeps SQLite as the default storage for file paths", async () => {
    const storage = await openStorage(":memory:");
    expect(storage).toBeInstanceOf(SqliteStorage);
    await storage.close();
  });
});

describe("PostgresStorage", () => {
  it("runs migrations when opened from a pool", async () => {
    const pool = new RecordingPool();
    await PostgresStorage.fromPool(pool);

    expect(queryContaining(pool, "CREATE TABLE IF NOT EXISTS schema_migrations")).toBeDefined();
    const migration = queryContaining(pool, "CREATE TABLE IF NOT EXISTS matches");
    expect(migration?.text).toContain("CREATE TABLE IF NOT EXISTS player_stats");
    expect(migration?.text).toContain("CREATE TABLE IF NOT EXISTS player_sessions");
    expect(migration?.text).toContain("CREATE TABLE IF NOT EXISTS room_leases");
    expect(migration?.text).toContain("CREATE TABLE IF NOT EXISTS server_event_fanout");
  });

  it("uses parameterized inserts for match starts and events", async () => {
    const pool = new RecordingPool();
    const storage = await PostgresStorage.fromPool(pool);

    await storage.saveMatchStarted({
      matchId: "m1",
      seed: "s1",
      numberOfRounds: 7,
      players: [{ seatIndex: 0, corePlayerId: "1", kind: "human", displayId: "#p" }],
      startedAt: 1000
    });
    await storage.appendMatchEvent("m1", {
      seq: 1,
      event: { type: "TURN_STARTED", gameId: "m1", eventSeq: 1, turn: {} as never }
    });

    const matchInsert = queryContaining(pool, "ON CONFLICT (match_id) DO NOTHING");
    expect(matchInsert?.values?.[0]).toBe("m1");
    const eventInsert = queryContaining(pool, "ON CONFLICT (match_id, seq) DO NOTHING");
    expect(eventInsert?.values?.[1]).toBe(1);
  });

  it("increments player stats with one PostgreSQL upsert", async () => {
    const pool = new RecordingPool();
    const storage = await PostgresStorage.fromPool(pool);

    await storage.incrementPlayerStats({
      playerId: "#p",
      gamesPlayedDelta: 1,
      gamesWonDelta: 1,
      updatedAt: 2000
    });

    const upsert = queryContaining(pool, "INSERT INTO player_stats");
    expect(upsert?.text).toContain(
      "games_played = player_stats.games_played + EXCLUDED.games_played"
    );
    expect(upsert?.text).toContain(
      "games_won    = player_stats.games_won + EXCLUDED.games_won"
    );
    expect(upsert?.text).toContain(
      "updated_at   = GREATEST(player_stats.updated_at, EXCLUDED.updated_at)"
    );
    expect(upsert?.values).toEqual(["#p", 1, 1, 2000]);
  });

  it("maps JSONB and bigint rows back to StoragePort DTOs", async () => {
    const pool = new RecordingPool();
    const storage = await PostgresStorage.fromPool(pool);
    pool.rowQueue.push(
      [
        {
          match_id: "m1",
          seed: "s1",
          number_of_rounds: "7",
          players_json: [{ seatIndex: 0, corePlayerId: "1", kind: "human", displayId: "#p" }],
          started_at: "1000"
        }
      ],
      [{ seq: "1", event_json: { type: "GAME_OVER", gameId: "m1", eventSeq: 1 } }]
    );

    const match = await storage.loadUnfinishedMatch("m1");

    expect(match?.match.numberOfRounds).toBe(7);
    expect(match?.match.startedAt).toBe(1000);
    expect(match?.events[0]?.seq).toBe(1);
  });

  it("acquires room ownership leases with an atomic PostgreSQL upsert", async () => {
    const pool = new RecordingPool();
    const storage = await PostgresStorage.fromPool(pool);
    pool.rowQueue.push([
      {
        room_id: "room-1",
        owner_instance_id: "instance-a",
        expires_at: "6000",
        updated_at: "1000"
      }
    ]);

    const lease = await storage.acquireRoomLease({
      roomId: "room-1",
      ownerInstanceId: "instance-a",
      now: 1000,
      ttlMs: 5000
    });

    const acquire = queryContaining(pool, "ON CONFLICT (room_id) DO UPDATE");
    expect(acquire?.text).toContain("room_leases.expires_at <= $5");
    expect(acquire?.values).toEqual(["room-1", "instance-a", 6000, 1000, 1000]);
    expect(lease).toEqual({
      roomId: "room-1",
      ownerInstanceId: "instance-a",
      expiresAt: 6000,
      updatedAt: 1000
    });
  });

  it("returns undefined when a live room lease is owned elsewhere", async () => {
    const pool = new RecordingPool();
    const storage = await PostgresStorage.fromPool(pool);

    await expect(
      storage.acquireRoomLease({
        roomId: "room-1",
        ownerInstanceId: "instance-b",
        now: 1000,
        ttlMs: 5000
      })
    ).resolves.toBeUndefined();
  });

  it("renews, releases, and reads room ownership leases", async () => {
    const pool = new RecordingPool();
    const storage = await PostgresStorage.fromPool(pool);
    pool.rowQueue.push(
      [
        {
          room_id: "room-1",
          owner_instance_id: "instance-a",
          expires_at: "7000",
          updated_at: "2000"
        }
      ],
      [{ room_id: "room-1" }],
      [
        {
          room_id: "room-1",
          owner_instance_id: "instance-a",
          expires_at: "7000",
          updated_at: "2000"
        }
      ]
    );

    await expect(
      storage.renewRoomLease({
        roomId: "room-1",
        ownerInstanceId: "instance-a",
        now: 2000,
        ttlMs: 5000
      })
    ).resolves.toMatchObject({ expiresAt: 7000, updatedAt: 2000 });
    await expect(storage.releaseRoomLease("room-1", "instance-a")).resolves.toBe(true);
    await expect(storage.getRoomLease("room-1")).resolves.toMatchObject({
      roomId: "room-1",
      ownerInstanceId: "instance-a"
    });

    expect(queryContaining(pool, "UPDATE room_leases")).toBeDefined();
    expect(queryContaining(pool, "DELETE FROM room_leases")).toBeDefined();
    expect(queryContaining(pool, "SELECT room_id, owner_instance_id")).toBeDefined();
  });

  it("reports DB health with SELECT 1 latency and pool saturation", async () => {
    const pool = new RecordingPool();
    pool.totalCount = 5;
    pool.idleCount = 2;
    pool.waitingCount = 1;
    const storage = await PostgresStorage.fromPool(pool);

    const times = [1000, 1007];
    const health = await storage.healthCheck(() => times.shift() ?? 9999);

    expect(queryContaining(pool, "SELECT 1")).toBeDefined();
    expect(health).toEqual({
      ok: true,
      latencyMs: 7,
      pool: { total: 5, idle: 2, waiting: 1 }
    });
  });

  it("reports ok=false when the health probe query fails", async () => {
    class ThrowingPool extends RecordingPool {
      override async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: readonly unknown[]
      ): Promise<QueryResult<T>> {
        if (text.includes("SELECT 1")) {
          throw new Error("connection refused");
        }
        return super.query<T>(text, values);
      }
    }
    const pool = new ThrowingPool();
    const storage = await PostgresStorage.fromPool(pool);

    const health = await storage.healthCheck(() => 1000);

    expect(health.ok).toBe(false);
    expect(health.latencyMs).toBe(0);
  });

  it("creates, reads, and deletes durable player sessions", async () => {
    const pool = new RecordingPool();
    const storage = await PostgresStorage.fromPool(pool);
    pool.rowQueue.push([{ player_id: "client-A" }]);

    await expect(
      storage.createSessionIfAbsent({
        playerId: "client-A",
        reconnectToken: "token-1",
        displayId: "#12345",
        createdAt: 1000,
        updatedAt: 1000
      })
    ).resolves.toBe("created");

    pool.rowQueue.push([
      {
        player_id: "client-A",
        reconnect_token: "token-1",
        display_id: "#12345",
        updated_at: "1000"
      }
    ]);
    await expect(storage.getSession("client-A")).resolves.toEqual({
      playerId: "client-A",
      reconnectToken: "token-1",
      displayId: "#12345",
      updatedAt: 1000
    });

    await storage.deleteSession("client-A");

    expect(queryContaining(pool, "INSERT INTO player_sessions")).toBeDefined();
    expect(queryContaining(pool, "FROM player_sessions")).toBeDefined();
    expect(queryContaining(pool, "DELETE FROM player_sessions")).toBeDefined();
  });
});
