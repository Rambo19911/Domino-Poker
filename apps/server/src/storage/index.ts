import { PostgresStorage, type PgPoolOptions } from "./PostgresStorage.js";
import { SqliteStorage } from "./SqliteStorage.js";
import type { StoragePort } from "./StoragePort.js";

export type {
  MatchEventRecord,
  MatchFinishedRecord,
  MatchSeatRecord,
  MatchStartedRecord,
  MatchSummaryRecord,
  PlayerStatsIncrementRecord,
  PlayerStatsRecord,
  StoragePort,
  UnfinishedMatch
} from "./StoragePort.js";
export { PostgresStorage } from "./PostgresStorage.js";
export type { DbHealthReport, PgPoolOptions } from "./PostgresStorage.js";
export { MIGRATIONS, runMigrations } from "./migrations.js";
export type { Migration, MigratablePool, RunMigrationsOptions } from "./migrations.js";
export { InMemoryRoomLeaseStore, toLeaseRecord } from "./RoomLeaseStore.js";
export type { RoomLeaseRecord, RoomLeaseRequest, RoomLeaseStore } from "./RoomLeaseStore.js";
export { SqliteStorage } from "./SqliteStorage.js";
export { MatchPersistence } from "./MatchPersistence.js";
export type { MatchPersistenceOptions } from "./MatchPersistence.js";
export type {
  CreateDurableSessionResult,
  DurableSessionRecord,
  DurableSessionStore,
  NewDurableSessionRecord
} from "../sessions/DurableSessionStore.js";

/**
 * Atver persistences slāni no atrisinātā `databaseUrl` (sk. `config.ts`).
 * Atgriež `StoragePort`, lai izsaukuma vietas nezinātu par konkrēto adapteri —
 * SQLite ceļi paliek lokāli, bet PostgreSQL URL izmanto kopīgas DB adapteri.
 */
export function openSqliteStorage(databaseUrl: string): StoragePort {
  return new SqliteStorage({ filename: databaseUrl });
}

export async function openStorage(
  databaseUrl: string,
  pgPoolOptions: PgPoolOptions = {}
): Promise<StoragePort> {
  if (isPostgresDatabaseUrl(databaseUrl)) {
    return PostgresStorage.open(databaseUrl, pgPoolOptions);
  }
  return openSqliteStorage(databaseUrl);
}

export function isPostgresDatabaseUrl(databaseUrl: string): boolean {
  return /^postgres(ql)?:\/\//iu.test(databaseUrl);
}
