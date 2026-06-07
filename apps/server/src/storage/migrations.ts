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

/**
 * 0002: opcionālo lietotāju kontu shēma (auth). `users.avatar` glabā avatar id
 * (sk. shared `avatarCatalog`). `auth_tokens` glabā tikai `sha256(token)`.
 * `email_norm` UNIQUE ir DAĻĒJS (tikai ne-NULL), lai vairāki konti bez e-pasta
 * nesaduras. Anonīmā spēle to neizmanto (aditīvs slānis).
 */
const AUTH_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL,
    username_norm TEXT NOT NULL UNIQUE,
    email         TEXT,
    email_norm    TEXT,
    password_hash TEXT NOT NULL,
    avatar        TEXT NOT NULL,
    created_at    BIGINT NOT NULL,
    updated_at    BIGINT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_norm
    ON users (email_norm) WHERE email_norm IS NOT NULL;

  CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash   TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   BIGINT NOT NULL,
    last_used_at BIGINT NOT NULL,
    expires_at   BIGINT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens (user_id);
  CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires_at ON auth_tokens (expires_at);
`;

/**
 * 0003: kontu MP statistika (Fāze 3). `user_stats` — agregēti W/L pa lietotājam;
 * `match_user_outcomes` — idempotents reģistrs (PK `(match_id, user_id)`), kas
 * nodrošina TIEŠI VIENU iznākumu uz spēli uz lietotāju (dubultošanas un krāpšanas
 * novēršana — 5.7). Iznākuma reģistrēšana + stats inkrements notiek VIENĀ atomiskā
 * darbībā. Atsevišķa no `player_stats` (kas paliek neaiztikta).
 */
const USER_STATS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS user_stats (
    user_id      TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    games_played INTEGER NOT NULL DEFAULT 0,
    wins         INTEGER NOT NULL DEFAULT 0,
    losses       INTEGER NOT NULL DEFAULT 0,
    updated_at   BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS match_user_outcomes (
    match_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    outcome     TEXT NOT NULL CHECK (outcome IN ('win', 'lose')),
    recorded_at BIGINT NOT NULL,
    PRIMARY KEY (match_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_match_user_outcomes_user_id
    ON match_user_outcomes (user_id);
`;

/**
 * 0004: paroles atjaunošanas tokeni (Fāze 5). Glabā tikai `sha256(token)` (kā
 * `auth_tokens` — augstas entropijas tokens). Īss derīgums (`expires_at`) +
 * vienreizēja lietošana (`used_at` NULL = neizmantots). FK uz `users` ar CASCADE.
 * `user_id` indekss vecu/neizmantotu tokenu invalidēšanai pie jauna pieprasījuma;
 * `expires_at` indekss periodiskai tīrīšanai (kā `auth_tokens`).
 */
const PASSWORD_RESET_SCHEMA = `
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at    BIGINT
  );

  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
    ON password_reset_tokens (user_id);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
    ON password_reset_tokens (expires_at);
`;

/** Sakārtots migrāciju saraksts. Jaunas migrācijas pievieno BEIGĀS, nekad nepārkārto. */
export const MIGRATIONS: readonly Migration[] = [
  { id: "0001_initial_schema", up: INITIAL_SCHEMA },
  { id: "0002_auth_schema", up: AUTH_SCHEMA },
  { id: "0003_user_stats", up: USER_STATS_SCHEMA },
  { id: "0004_password_reset_tokens", up: PASSWORD_RESET_SCHEMA }
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
