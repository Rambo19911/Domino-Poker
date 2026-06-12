import { Client } from "pg";
import { describe, it } from "vitest";

import { PostgresStorage } from "../../src/storage/PostgresStorage.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { runStoragePortContract } from "./storageContract.js";

/**
 * Wires the shared `StoragePort` contract to each backend. SQLite runs always
 * (in-memory); PostgreSQL runs only when `TEST_POSTGRES_DATABASE_URL` is set
 * (docker/integration), reusing the per-test schema isolation of the existing
 * integration test. Identical assertions on both = proven parity (Fāze 3, p.13).
 */

// SQLite arm — always runs.
runStoragePortContract("SqliteStorage (:memory:)", async () => {
  const storage = new SqliteStorage({ filename: ":memory:" });
  return { storage, teardown: () => storage.close() };
});

// PostgreSQL arm — only with a real DB URL (skipped placeholder otherwise).
const postgresUrl = process.env.TEST_POSTGRES_DATABASE_URL?.trim();

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function withSearchPath(connectionString: string, schemaName: string): string {
  const url = new URL(connectionString);
  url.searchParams.set("options", `-c search_path=${schemaName}`);
  return url.toString();
}

if (postgresUrl) {
  let counter = 0;
  runStoragePortContract("PostgresStorage (real DB)", async () => {
    // Izolē katru testu savā shēmā; teardown nomet to ar CASCADE (kā integ. tests).
    const schemaName = `dpc_${process.pid}_${Date.now()}_${counter++}`;
    const admin = new Client({ connectionString: postgresUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    const storage = await PostgresStorage.open(withSearchPath(postgresUrl, schemaName));
    return {
      storage,
      teardown: async () => {
        await storage.close();
        await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
        await admin.end();
      }
    };
  });
} else {
  describe.skip("StoragePort contract: PostgresStorage (set TEST_POSTGRES_DATABASE_URL)", () => {
    it("runs against a real PostgreSQL database", () => {
      /* skipped without TEST_POSTGRES_DATABASE_URL */
    });
  });
}
