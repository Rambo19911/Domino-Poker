import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";

import { MIGRATIONS, runMigrations, type Migration } from "../../src/storage/migrations.js";

/**
 * Fake pool, kas modelē `schema_migrations` stāvokli: `SELECT id` atgriež jau
 * ierakstītās migrācijas, `INSERT` tās pievieno. Tas ļauj pārbaudīt idempotenci
 * reālistiski (otrā palaišana neko nepiemēro), neizmantojot īstu PostgreSQL.
 */
class FakeMigrationPool {
  readonly queries: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
  readonly applied = new Set<string>();

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>> {
    this.queries.push({ text, values });
    if (text.includes("INSERT INTO schema_migrations")) {
      this.applied.add(values?.[0] as string);
    }
    const rows: unknown[] = text.includes("SELECT id FROM schema_migrations")
      ? [...this.applied].map((id) => ({ id }))
      : [];
    return { rows } as QueryResult<T>;
  }

  upQueries(): string[] {
    return this.queries
      .filter(
        (query) =>
          !query.text.includes("schema_migrations") && query.text.trim() !== ""
      )
      .map((query) => query.text);
  }
}

const fixtures: readonly Migration[] = [
  { id: "0001_a", up: "CREATE TABLE IF NOT EXISTS a (id TEXT)" },
  { id: "0002_b", up: "CREATE TABLE IF NOT EXISTS b (id TEXT)" }
];

describe("runMigrations", () => {
  it("creates schema_migrations and applies every migration on an empty database", async () => {
    const pool = new FakeMigrationPool();

    const ran = await runMigrations(pool, { migrations: fixtures, now: () => 1000 });

    expect(ran).toEqual(["0001_a", "0002_b"]);
    expect(pool.queries[0]?.text).toContain("CREATE TABLE IF NOT EXISTS schema_migrations");
    expect(pool.upQueries()).toEqual([
      "CREATE TABLE IF NOT EXISTS a (id TEXT)",
      "CREATE TABLE IF NOT EXISTS b (id TEXT)"
    ]);
  });

  it("records each applied migration id with the injected timestamp", async () => {
    const pool = new FakeMigrationPool();

    await runMigrations(pool, { migrations: fixtures, now: () => 4242 });

    const inserts = pool.queries.filter((query) =>
      query.text.includes("INSERT INTO schema_migrations")
    );
    expect(inserts.map((query) => query.values)).toEqual([
      ["0001_a", 4242],
      ["0002_b", 4242]
    ]);
    expect(inserts[0]?.text).toContain("ON CONFLICT (id) DO NOTHING");
  });

  it("applies only the unapplied tail when some migrations are already recorded", async () => {
    const pool = new FakeMigrationPool();
    pool.applied.add("0001_a");

    const ran = await runMigrations(pool, { migrations: fixtures, now: () => 1000 });

    expect(ran).toEqual(["0002_b"]);
    expect(pool.upQueries()).toEqual(["CREATE TABLE IF NOT EXISTS b (id TEXT)"]);
  });

  it("is idempotent: a second run applies nothing", async () => {
    const pool = new FakeMigrationPool();

    await runMigrations(pool, { migrations: fixtures, now: () => 1000 });
    const secondRun = await runMigrations(pool, { migrations: fixtures, now: () => 2000 });

    expect(secondRun).toEqual([]);
    expect(pool.upQueries()).toEqual([
      "CREATE TABLE IF NOT EXISTS a (id TEXT)",
      "CREATE TABLE IF NOT EXISTS b (id TEXT)"
    ]);
  });

  it("ships the consolidated baseline schema as the first migration", () => {
    const baseline = MIGRATIONS[0];
    expect(baseline?.id).toBe("0001_initial_schema");
    for (const table of [
      "matches",
      "match_events",
      "player_stats",
      "chat_messages",
      "player_sessions",
      "room_leases",
      "server_event_fanout"
    ]) {
      expect(baseline?.up).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });
});
