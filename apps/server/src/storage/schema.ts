/**
 * Viens DDL avots (Fāze 3, 13. punkts). Iepriekš shēma bija dublēta divos
 * dialektos: `migrations.ts` (PostgreSQL, versionēts) un `SqliteStorage.migrate()`
 * (inline). Tas riskēja ar neviļus atšķirībām. Šeit katra tabula ir definēta
 * VIENREIZ; dialekta atšķirības ir tikai dažas kolonnu tipa "saites" (token).
 *
 * **Apzināti DUMJA abstrakcija (NE ORM):** tikai tipa-token aizvietošana, nekādu
 * izsecinātu ierobežojumu/indeksu, nekāda shēmas DSL. Migrāciju ID un robežas
 * (0001..0005) ir IDENTISKAS abiem dialektiem un STABILAS (prod identitāte) —
 * mainās tikai renderētie kolonnu tipi un PG-only tabulu klātbūtne.
 *
 * **Dialektu atšķirības (vienīgās):**
 *   - laiks/seq:   PG `BIGINT`  ↔ SQLite `INTEGER` (`t.bigint`)
 *   - JSON:        PG `JSONB`   ↔ SQLite `TEXT`    (`t.json`)
 *   - baiti:       PG `BYTEA`   ↔ SQLite `BLOB`    (`t.bytes`)
 *   - `INTEGER` skaitļi un `TEXT` ir identiski abos → literāli.
 *
 * **PG-only tabulas** (`player_sessions`, `room_leases`, `server_event_fanout`)
 * ir tikai daudz-instanču PostgreSQL izvietojumam; SQLite (lokāls, viena instance)
 * tās NErenderē.
 */

export type SchemaDialect = "pg" | "sqlite";

interface DialectTypes {
  /** Liels vesels skaitlis laikam/seq (PG BIGINT, SQLite INTEGER ir 64-bit). */
  readonly bigint: string;
  /** JSON dokuments (PG JSONB, SQLite TEXT — adapteris (de)serializē). */
  readonly json: string;
  /** Binārie baiti (PG BYTEA, SQLite BLOB). */
  readonly bytes: string;
}

const TYPES: Record<SchemaDialect, DialectTypes> = {
  pg: { bigint: "BIGINT", json: "JSONB", bytes: "BYTEA" },
  sqlite: { bigint: "INTEGER", json: "TEXT", bytes: "BLOB" }
};

/** Migrācija: sakārtots id + idempotents DDL (`CREATE ... IF NOT EXISTS`). */
export interface SchemaMigration {
  readonly id: string;
  readonly up: string;
}

/**
 * 0001 bāzlīnija. Visi `CREATE` ir `IF NOT EXISTS`, lai droši adoptētu jau
 * provizētas DB (kas tabulas ieguva no agrākā inline `migrate()`), neierakstot
 * tās dubultā. PG-only tabulas iekļautas tikai PostgreSQL renderī.
 */
function initialSchema(t: DialectTypes, includePgOnly: boolean): string {
  const shared = `
  CREATE TABLE IF NOT EXISTS matches (
    match_id         TEXT PRIMARY KEY,
    seed             TEXT NOT NULL,
    number_of_rounds INTEGER NOT NULL,
    players_json     ${t.json} NOT NULL,
    started_at       ${t.bigint} NOT NULL,
    finished_at      ${t.bigint},
    winner_player_id TEXT
  );

  CREATE TABLE IF NOT EXISTS match_events (
    match_id   TEXT NOT NULL,
    seq        ${t.bigint} NOT NULL,
    event_json ${t.json} NOT NULL,
    PRIMARY KEY (match_id, seq)
  );

  CREATE TABLE IF NOT EXISTS player_stats (
    player_id     TEXT PRIMARY KEY,
    games_played  INTEGER NOT NULL,
    games_won     INTEGER NOT NULL,
    updated_at    ${t.bigint} NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id                TEXT PRIMARY KEY,
    author_display_id TEXT NOT NULL,
    text              TEXT NOT NULL,
    server_now        ${t.bigint} NOT NULL
  );
`;

  // Daudz-instanču koordinācija (durable sesijas, istabu nomas, event fanout) —
  // tikai PostgreSQL. SQLite (lokāls, viena instance) tās neizmanto.
  const pgOnly = `
  CREATE TABLE IF NOT EXISTS player_sessions (
    player_id       TEXT PRIMARY KEY,
    reconnect_token TEXT NOT NULL,
    display_id      TEXT NOT NULL UNIQUE,
    created_at      ${t.bigint} NOT NULL,
    updated_at      ${t.bigint} NOT NULL
  );

  CREATE TABLE IF NOT EXISTS room_leases (
    room_id           TEXT PRIMARY KEY,
    owner_instance_id TEXT NOT NULL,
    expires_at        ${t.bigint} NOT NULL,
    updated_at        ${t.bigint} NOT NULL
  );

  CREATE TABLE IF NOT EXISTS server_event_fanout (
    event_id           TEXT PRIMARY KEY,
    origin_instance_id TEXT NOT NULL,
    message_json       ${t.json} NOT NULL,
    created_at         ${t.bigint} NOT NULL
  );
`;

  const sharedIndexes = `
  CREATE INDEX IF NOT EXISTS idx_matches_started_at ON matches (started_at);
`;

  const pgOnlyIndexes = `
  CREATE INDEX IF NOT EXISTS idx_player_sessions_updated_at ON player_sessions (updated_at);
  CREATE INDEX IF NOT EXISTS idx_room_leases_expires_at ON room_leases (expires_at);
  CREATE INDEX IF NOT EXISTS idx_server_event_fanout_created_at
    ON server_event_fanout (created_at);
`;

  return includePgOnly
    ? shared + pgOnly + sharedIndexes + pgOnlyIndexes
    : shared + sharedIndexes;
}

/**
 * 0002: opcionālo lietotāju kontu shēma (auth). `users.avatar` glabā avatar id.
 * `auth_tokens` glabā tikai `sha256(token)`. `email_norm` UNIQUE ir DAĻĒJS (tikai
 * ne-NULL), lai vairāki konti bez e-pasta nesaduras.
 */
function authSchema(t: DialectTypes): string {
  return `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL,
    username_norm TEXT NOT NULL UNIQUE,
    email         TEXT,
    email_norm    TEXT,
    password_hash TEXT NOT NULL,
    avatar        TEXT NOT NULL,
    created_at    ${t.bigint} NOT NULL,
    updated_at    ${t.bigint} NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_norm
    ON users (email_norm) WHERE email_norm IS NOT NULL;

  CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash   TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at   ${t.bigint} NOT NULL,
    last_used_at ${t.bigint} NOT NULL,
    expires_at   ${t.bigint} NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens (user_id);
  CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires_at ON auth_tokens (expires_at);
`;
}

/**
 * 0003: kontu MP statistika. `user_stats` — agregēti W/L; `match_user_outcomes` —
 * idempotents reģistrs (PK `(match_id, user_id)`) = TIEŠI VIENS iznākums uz spēli
 * uz lietotāju (anti-cheat 5.7).
 */
function userStatsSchema(t: DialectTypes): string {
  return `
  CREATE TABLE IF NOT EXISTS user_stats (
    user_id      TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    games_played INTEGER NOT NULL DEFAULT 0,
    wins         INTEGER NOT NULL DEFAULT 0,
    losses       INTEGER NOT NULL DEFAULT 0,
    updated_at   ${t.bigint} NOT NULL
  );

  CREATE TABLE IF NOT EXISTS match_user_outcomes (
    match_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    outcome     TEXT NOT NULL CHECK (outcome IN ('win', 'lose')),
    recorded_at ${t.bigint} NOT NULL,
    PRIMARY KEY (match_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_match_user_outcomes_user_id
    ON match_user_outcomes (user_id);
`;
}

/**
 * 0004: paroles atjaunošanas tokeni (Fāze 5). Glabā tikai `sha256(token)`. Īss
 * derīgums + vienreizēja lietošana (`used_at` NULL = neizmantots). FK CASCADE.
 */
function passwordResetSchema(t: DialectTypes): string {
  return `
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at ${t.bigint} NOT NULL,
    expires_at ${t.bigint} NOT NULL,
    used_at    ${t.bigint}
  );

  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
    ON password_reset_tokens (user_id);
  CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
    ON password_reset_tokens (expires_at);
`;
}

/**
 * 0005: pielāgots (augšupielādēts) profila avatars. Glabā JAU klienta pusē
 * samazinātu attēlu kā baitus. `users.avatar = 'custom'` marķē, ka jāņem šī
 * augšupielāde. FK CASCADE. `updated_at` = cache-busting versija serve URL-ā.
 */
function customAvatarSchema(t: DialectTypes): string {
  return `
  CREATE TABLE IF NOT EXISTS user_avatars (
    user_id      TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    bytes        ${t.bytes} NOT NULL,
    updated_at   ${t.bigint} NOT NULL
  );
`;
}

/**
 * 0006: konta preferences (Leaderboard fāze). Pagaidām tikai `language` (spēles
 * valoda), ko leaderboard parāda blakus statistikai. Apzināti ATSEVIŠĶA tabula,
 * NE `ALTER TABLE users ADD COLUMN`: `node:sqlite` neatbalsta
 * `ADD COLUMN IF NOT EXISTS`, tāpēc ALTER nebūtu idempotents pie crash-rerun
 * (runner palaiž `up` PIRMS ieraksta `schema_migrations`). `CREATE TABLE IF NOT
 * EXISTS` ir idempotents abos dialektos un neaiztiek `users` lasīšanas ceļu.
 * `CHECK` ierobežo valodu (kā `match_user_outcomes.outcome`). FK CASCADE.
 */
function userPreferencesSchema(t: DialectTypes): string {
  return `
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    language   TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'lv')),
    updated_at ${t.bigint} NOT NULL DEFAULT 0
  );
`;
}

/**
 * 0007: zelta monētu maku (virtuālā valūta). `coin_balances` = autoritatīvā bilance
 * uz kontu; `coin_ledger` = append-only audita žurnāls + idempotences sargs. Apzināti
 * ATSEVIŠĶAS tabulas (kā `user_preferences`, NE `ALTER TABLE users`): `node:sqlite`
 * neatbalsta `ADD COLUMN IF NOT EXISTS` → ALTER nebūtu idempotents pie crash-rerun.
 *
 * Idempotence: `UNIQUE (user_id, reason, ref)` garantē TIEŠI VIENU kustību uz
 * (lietotājs, iemesls, konteksts). `ref` = per-darbības konteksts: signup→userId,
 * sp_reward→gameToken, mp_entry/mp_refund→entryId (per-sēdvietas-ieņemšana, NE roomId,
 * citādi refund→rejoin tai pašai istabai būtu no-op = bezmaksas sēdvieta), mp_payout→matchId.
 * `CHECK`: bilance nedrīkst kļūt negatīva, `delta != 0`, `reason` ierobežots enum. FK CASCADE.
 */
function coinWalletSchema(t: DialectTypes): string {
  return `
  CREATE TABLE IF NOT EXISTS coin_balances (
    user_id    TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    balance    INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at ${t.bigint} NOT NULL
  );

  CREATE TABLE IF NOT EXISTS coin_ledger (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    delta      INTEGER NOT NULL CHECK (delta <> 0),
    reason     TEXT NOT NULL CHECK (reason IN ('signup', 'sp_reward', 'mp_entry', 'mp_refund', 'mp_payout')),
    ref        TEXT NOT NULL,
    created_at ${t.bigint} NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_coin_ledger_idem
    ON coin_ledger (user_id, reason, ref);
  CREATE INDEX IF NOT EXISTS idx_coin_ledger_user_id ON coin_ledger (user_id);
`;
}

/**
 * Renderē sakārtoto migrāciju sarakstu dotajam dialektam. ID un secība ir
 * STABILA un identiska abiem dialektiem (versionēšanas paritāte); atšķiras tikai
 * kolonnu tipi un PG-only tabulu klātbūtne (tikai 0001).
 *
 * Jaunas migrācijas pievieno BEIGĀS, nekad nepārkārto.
 */
export function buildMigrations(dialect: SchemaDialect): readonly SchemaMigration[] {
  const t = TYPES[dialect];
  return [
    { id: "0001_initial_schema", up: initialSchema(t, dialect === "pg") },
    { id: "0002_auth_schema", up: authSchema(t) },
    { id: "0003_user_stats", up: userStatsSchema(t) },
    { id: "0004_password_reset_tokens", up: passwordResetSchema(t) },
    { id: "0005_custom_avatars", up: customAvatarSchema(t) },
    { id: "0006_user_preferences", up: userPreferencesSchema(t) },
    { id: "0007_coin_wallet", up: coinWalletSchema(t) }
  ];
}
