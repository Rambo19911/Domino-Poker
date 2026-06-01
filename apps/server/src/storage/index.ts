import { SqliteStorage } from "./SqliteStorage.js";
import type { StoragePort } from "./StoragePort.js";

export type {
  MatchEventRecord,
  MatchFinishedRecord,
  MatchSeatRecord,
  MatchStartedRecord,
  MatchSummaryRecord,
  PlayerStatsRecord,
  StoragePort,
  UnfinishedMatch
} from "./StoragePort.js";
export { SqliteStorage } from "./SqliteStorage.js";
export { MatchPersistence } from "./MatchPersistence.js";
export type { MatchPersistenceOptions } from "./MatchPersistence.js";

/**
 * Atver lokālo persistences slāni no atrisinātā `databaseUrl` (sk. `config.ts`).
 * Atgriež `StoragePort`, lai izsaukuma vietas nezinātu par konkrēto adapteri —
 * VPS vidē šeit varēs atgriezt PostgreSQL adapteri ar to pašu līgumu.
 */
export function openSqliteStorage(databaseUrl: string): StoragePort {
  return new SqliteStorage({ filename: databaseUrl });
}
