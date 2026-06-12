import { describe, expect, it } from "vitest";

import { buildMigrations } from "../../src/storage/schema.js";

const EXPECTED_IDS = [
  "0001_initial_schema",
  "0002_auth_schema",
  "0003_user_stats",
  "0004_password_reset_tokens",
  "0005_custom_avatars"
];

const SHARED_TABLES = [
  "matches",
  "match_events",
  "player_stats",
  "chat_messages",
  "users",
  "auth_tokens",
  "user_stats",
  "match_user_outcomes",
  "password_reset_tokens",
  "user_avatars"
];

const PG_ONLY_TABLES = ["player_sessions", "room_leases", "server_event_fanout"];

function fullSql(migrations: readonly { up: string }[]): string {
  return migrations.map((migration) => migration.up).join("\n");
}

describe("schema (single DDL source, per-dialect rendering)", () => {
  it("keeps the exact, stable migration ids for BOTH dialects (prod identity)", () => {
    expect(buildMigrations("pg").map((m) => m.id)).toEqual(EXPECTED_IDS);
    expect(buildMigrations("sqlite").map((m) => m.id)).toEqual(EXPECTED_IDS);
  });

  it("renders all tables (shared + PG-only) for the PostgreSQL dialect", () => {
    const sql = fullSql(buildMigrations("pg"));
    for (const table of [...SHARED_TABLES, ...PG_ONLY_TABLES]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    // PG-specifiskie tipi.
    expect(sql).toContain("JSONB");
    expect(sql).toContain("BIGINT");
    expect(sql).toContain("BYTEA");
  });

  it("renders only the shared tables for SQLite, never the PG-only ones", () => {
    const sql = fullSql(buildMigrations("sqlite"));
    for (const table of SHARED_TABLES) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    for (const table of PG_ONLY_TABLES) {
      expect(sql).not.toContain(table);
    }
    // SQLite tipi — NEKAD PG tipi.
    expect(sql).toContain("TEXT");
    expect(sql).toContain("BLOB");
    expect(sql).not.toContain("JSONB");
    expect(sql).not.toContain("BIGINT");
    expect(sql).not.toContain("BYTEA");
  });

  it("keeps the consolidated baseline (0001) carrying the initial tables per dialect", () => {
    const pgBaseline = buildMigrations("pg")[0];
    expect(pgBaseline?.id).toBe("0001_initial_schema");
    for (const table of ["matches", "match_events", "player_stats", "chat_messages", ...PG_ONLY_TABLES]) {
      expect(pgBaseline?.up).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }

    const sqliteBaseline = buildMigrations("sqlite")[0];
    for (const table of ["matches", "match_events", "player_stats", "chat_messages"]) {
      expect(sqliteBaseline?.up).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    for (const table of PG_ONLY_TABLES) {
      expect(sqliteBaseline?.up).not.toContain(table);
    }
  });
});
