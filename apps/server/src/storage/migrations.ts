import type { QueryResult, QueryResultRow } from "pg";

/**
 * PostgreSQL migrāciju sistēma (single source of truth shēmai).
 *
 * **Kāpēc šis modulis eksistē?** Iepriekš shēma tika veidota ar inline
 * `CREATE TABLE IF NOT EXISTS` divās vietās vienlaikus — `PostgresStorage` un
 * `PostgresEventBus` katrs "zināja" daļu shēmas (t.sk. dublēja
 * `server_event_fanout`). Tas riskē ar nejaušām atšķirībām un nedod skaidru
 * deployotās shēmas versiju. Šeit visa shēma ir vienā sakārtotā `MIGRATIONS`
 * sarakstā; abi adapteri to tikai izsauc.
 *
 * **Tvērums:** tikai PostgreSQL. SQLite (lokālā izstrāde) turpina veidot shēmu
 * ar `CREATE IF NOT EXISTS` atvēršanas brīdī — to nav vērts sarežģīt.
 *
 * **Modelis:** forward-only. `schema_migrations` izseko, kuras migrācijas jau
 * piemērotas. Rollback notiek caur restore-no-backup (sk. README ops sadaļu);
 * `down()` apzināti nav, jo šim mērogam tas pievienotu sarežģītību bez ieguvuma.
 *
 * **Idempotence un drošība:** `runMigrations` izlaiž jau ierakstītās migrācijas,
 * un `schema_migrations` ieraksts izmanto `ON CONFLICT DO NOTHING`. Migrācijas
 * `up` SQL jāraksta idempotenti (`IF NOT EXISTS` / `IF EXISTS` aizsargi), lai
 * atkārtota palaišana (piem. process nokrīt starp `up` un ierakstu) būtu droša.
 */
export interface Migration {
  /** Sakārtots, unikāls identifikators, piem. `0001_initial_schema`. */
  readonly id: string;
  /** Idempotents DDL, kas piemēro šo migrāciju. */
  readonly up: string;
}

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
 * Bāzlīnija (0001): konsolidē VISU līdzšinējo shēmu. Visi `CREATE` ir
 * `IF NOT EXISTS`, lai šī migrācija droši adoptētu jau provizētas DB (kas tabulas
 * ieguva no agrākā inline `migrate()`), neierakstot tās dubultā.
 */
const INITIAL_SCHEMA = `
  CREATE TABLE IF NOT EXISTS matches (
    match_id         TEXT PRIMARY KEY,
    seed             TEXT NOT NULL,
    number_of_rounds INTEGER NOT NULL,
    players_json     JSONB NOT NULL,
    started_at       BIGINT NOT NULL,
    finished_at      BIGINT,
    winner_player_id TEXT
  );

  CREATE TABLE IF NOT EXISTS match_events (
    match_id   TEXT NOT NULL,
    seq        BIGINT NOT NULL,
    event_json JSONB NOT NULL,
    PRIMARY KEY (match_id, seq)
  );

  CREATE TABLE IF NOT EXISTS player_stats (
    player_id     TEXT PRIMARY KEY,
    games_played  INTEGER NOT NULL,
    games_won     INTEGER NOT NULL,
    updated_at    BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id                TEXT PRIMARY KEY,
    author_display_id TEXT NOT NULL,
    text              TEXT NOT NULL,
    server_now        BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS player_sessions (
    player_id       TEXT PRIMARY KEY,
    reconnect_token TEXT NOT NULL,
    display_id      TEXT NOT NULL UNIQUE,
    created_at      BIGINT NOT NULL,
    updated_at      BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS room_leases (
    room_id           TEXT PRIMARY KEY,
    owner_instance_id TEXT NOT NULL,
    expires_at        BIGINT NOT NULL,
    updated_at        BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS server_event_fanout (
    event_id           TEXT PRIMARY KEY,
    origin_instance_id TEXT NOT NULL,
    message_json       JSONB NOT NULL,
    created_at         BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_matches_started_at ON matches (started_at);
  CREATE INDEX IF NOT EXISTS idx_player_sessions_updated_at ON player_sessions (updated_at);
  CREATE INDEX IF NOT EXISTS idx_room_leases_expires_at ON room_leases (expires_at);
  CREATE INDEX IF NOT EXISTS idx_server_event_fanout_created_at
    ON server_event_fanout (created_at);
`;

/** Sakārtots migrāciju saraksts. Jaunas migrācijas pievieno BEIGĀS, nekad nepārkārto. */
export const MIGRATIONS: readonly Migration[] = [
  { id: "0001_initial_schema", up: INITIAL_SCHEMA }
];

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
