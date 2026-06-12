import type { QueryResult, QueryResultRow } from "pg";

import { buildMigrations, type SchemaMigration } from "./schema.js";

/**
 * PostgreSQL migrāciju runner.
 *
 * **Shēmas avots:** visa DDL nāk no `schema.ts` (`buildMigrations`) — viens DDL
 * avots abiem dialektiem (PG + SQLite). Šis modulis ir tikai PostgreSQL runner:
 * izpilda sakārtoto `MIGRATIONS` sarakstu un izseko piemērotās ar
 * `schema_migrations`. SQLite izmanto to pašu `buildMigrations("sqlite")` ar savu
 * runner (`SqliteStorage`).
 *
 * **Modelis:** forward-only. Rollback notiek caur restore-no-backup (sk. README
 * ops sadaļu); `down()` apzināti nav, jo šim mērogam tas pievienotu sarežģītību
 * bez ieguvuma.
 *
 * **Idempotence un drošība:** `runMigrations` izlaiž jau ierakstītās migrācijas,
 * un `schema_migrations` ieraksts izmanto `ON CONFLICT DO NOTHING`. Migrācijas
 * `up` SQL ir idempotents (`IF NOT EXISTS` aizsargi), lai atkārtota palaišana
 * (piem. process nokrīt starp `up` un ierakstu) būtu droša.
 */
export type Migration = SchemaMigration;

/** Minimāla pool/klienta saskarne migrāciju palaišanai (apmierina `pg` `Pool`). */
export interface MigratablePool {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
}

export interface RunMigrationsOptions {
  /** Pārraksta migrāciju sarakstu (testiem). Noklusējums: `MIGRATIONS`. */
  readonly migrations?: readonly Migration[];
  /** Servera laika avots `applied_at` zīmogam (testiem). Noklusējums: `Date.now`. */
  readonly now?: () => number;
}

/**
 * Sakārtots PostgreSQL migrāciju saraksts, renderēts no kopīgā `schema.ts`.
 * Jaunas migrācijas pievieno `schema.ts` BEIGĀS, nekad nepārkārto (prod identitāte).
 */
export const MIGRATIONS: readonly Migration[] = buildMigrations("pg");

interface MigrationRow extends QueryResultRow {
  readonly id: string;
}

/**
 * Piemēro visas vēl nepiemērotās migrācijas sarakstā. Atgriež piemēroto migrāciju
 * id (tukšs masīvs, ja shēma jau aktuāla). Drošs atkārtotai palaišanai.
 */
export async function runMigrations(
  pool: MigratablePool,
  options: RunMigrationsOptions = {}
): Promise<readonly string[]> {
  const migrations = options.migrations ?? MIGRATIONS;
  const now = options.now ?? Date.now;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         TEXT PRIMARY KEY,
      applied_at BIGINT NOT NULL
    )
  `);

  const appliedResult = await pool.query<MigrationRow>(`SELECT id FROM schema_migrations`);
  const applied = new Set(appliedResult.rows.map((row) => row.id));

  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }
    await pool.query(migration.up);
    await pool.query(
      `INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [migration.id, now()]
    );
    ran.push(migration.id);
  }
  return ran;
}
