import { timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { MultiplayerEvent } from "@domino-poker/core/multiplayer";
import type { ChatMessage } from "@domino-poker/shared";

import type {
  MatchEventRecord,
  MatchFinishedRecord,
  MatchOutcome,
  MatchStartedRecord,
  MatchSummaryRecord,
  PlayerStatsIncrementRecord,
  PlayerStatsRecord,
  StoragePort,
  UnfinishedMatch,
  UserStatsRecord
} from "./StoragePort.js";
import type {
  AccountLanguage,
  AdminAccountUpdate,
  AdminUpdateAccountResult,
  AuthStore,
  AuthTokenRecord,
  CreateUserResult,
  CustomAvatarRecord,
  LeaderboardEntryRecord,
  PasswordResetTokenRecord,
  ProfileUpdate,
  RankSnapshotRecord,
  UpdateProfileResult,
  UserRecord
} from "../auth/AuthStore.js";
import {
  ADMIN_LOGIN_CODE_ID,
  type AdminAuditEntry,
  type AdminLoginCodeConsumeResult,
  type AdminLoginCodeRecord,
  type AdminPlayerRow,
  type AdminSessionRecord,
  type AdminStore,
  type BanRecord,
  type DailyCount,
  type LedgerEntryView,
  type LoginAttemptCounts,
  type LoginAttemptRecord,
  type LoginAttemptView,
  type LoginUserAgent,
  type LoginUserIp,
  type SegmentPlayer,
  type SuspiciousPlayer
} from "../admin/AdminStore.js";
import type { ApplyLedgerResult, CoinStore, LedgerEntryInput } from "./CoinStore.js";
import { scrubSeats } from "./matchAnonymize.js";
import {
  assertValidGameResult,
  type GameResultRecord,
  type GameStatsAggregateRow,
  type PlayerStatsStore
} from "./PlayerStatsStore.js";
import { buildMigrations } from "./schema.js";

export interface SqliteStorageOptions {
  /**
   * DB faila ceļš vai `:memory:` testiem. Lokālais noklusējums (`./data/dev.sqlite`)
   * tiek atvasināts no `DATABASE_URL` (sk. `openSqliteStorage`).
   */
  readonly filename: string;
}

/**
 * `StoragePort` implementācija ar iebūvēto `node:sqlite` (Fāze 10.2). Sinhronie
 * SQLite izsaukumi tiek ietīti `async` metodēs, lai izpildītu DB-agnostisko
 * līgumu (PostgresStorage pieslēdzas tāpat). Idempotence panākta ar
 * `INSERT OR IGNORE` / upsert, lai novēlota vai atkārtota piegāde nedublētu datus.
 *
 * Glabā tikai serializējamus DTO: partijas metadata + append-only event log
 * (state ir atjaunojams no `seed`), pamata statistiku un lobby čatu (pārdzīvo
 * restartu). Nekādu dzīvu objektu vai spēles state šeit.
 */
export class SqliteStorage
  implements StoragePort, AuthStore, CoinStore, PlayerStatsStore, AdminStore
{
  private readonly db: DatabaseSync;

  constructor(options: SqliteStorageOptions) {
    if (options.filename !== ":memory:") {
      // Pārliecināmies, ka vecākmape (piem. ./data) eksistē pirms faila atvēršanas.
      mkdirSync(dirname(options.filename), { recursive: true });
    }
    this.db = new DatabaseSync(options.filename);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  /**
   * Forward-only migrāciju runner ar versiju izsekošanu (`schema_migrations`),
   * paralēli PostgreSQL `runMigrations`. DDL nāk no kopīgā `schema.ts`
   * (`buildMigrations("sqlite")`) — viens DDL avots abiem dialektiem.
   *
   * **Adopcija (drošs jau eksistējošām dev DB):** visi `CREATE` ir `IF NOT EXISTS`,
   * tāpēc, ja vecāks dev `.sqlite` fails jau satur tabulas, bet vēl bez
   * `schema_migrations` rindām, runner "piemēro" katru migrāciju (faktiski no-op)
   * un to ierakstā. Tā ir bāzlīnijas adopcija, NE shēmas validācija (esošs inline
   * `migrate()` arī nelaboja drift).
   */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id         TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);
    const appliedRows = this.db.prepare(`SELECT id FROM schema_migrations`).all() as Array<{
      readonly id: string;
    }>;
    const applied = new Set(appliedRows.map((row) => row.id));
    const insertApplied = this.db.prepare(
      `INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)`
    );
    for (const migration of buildMigrations("sqlite")) {
      if (applied.has(migration.id)) {
        continue;
      }
      this.db.exec(migration.up);
      insertApplied.run(migration.id, Date.now());
    }
  }

  async saveMatchStarted(match: MatchStartedRecord): Promise<void> {
    // Idempotents pēc match_id: atkārtots starts (piem. restart) nepārraksta.
    this.db
      .prepare(
        `INSERT OR IGNORE INTO matches
           (match_id, seed, number_of_rounds, players_json, started_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        match.matchId,
        match.seed,
        match.numberOfRounds,
        JSON.stringify(match.players),
        match.startedAt
      );
  }

  async appendMatchEvent(matchId: string, event: MatchEventRecord): Promise<void> {
    // Idempotents pēc (match_id, seq): novēlota/atkārtota piegāde nedublē žurnālu.
    this.db
      .prepare(
        `INSERT OR IGNORE INTO match_events (match_id, seq, event_json)
         VALUES (?, ?, ?)`
      )
      .run(matchId, event.seq, JSON.stringify(event.event));
  }

  async saveMatchFinished(result: MatchFinishedRecord): Promise<void> {
    // Idempotents: atkārtots finišs pārraksta to pašu rezultātu.
    this.db
      .prepare(
        `UPDATE matches
            SET finished_at = ?, winner_player_id = ?
          WHERE match_id = ?`
      )
      .run(result.finishedAt, result.winnerPlayerId ?? null, result.matchId);
  }

  async loadUnfinishedMatch(matchId: string): Promise<UnfinishedMatch | undefined> {
    const row = this.db
      .prepare(
        `SELECT match_id, seed, number_of_rounds, players_json, started_at
           FROM matches
          WHERE match_id = ? AND finished_at IS NULL`
      )
      .get(matchId) as MatchRow | undefined;
    if (!row) {
      return undefined;
    }

    const eventRows = this.db
      .prepare(
        `SELECT seq, event_json FROM match_events
          WHERE match_id = ? ORDER BY seq ASC`
      )
      .all(matchId) as unknown as EventRow[];

    return {
      match: rowToMatchStarted(row),
      events: eventRows.map((entry) => ({
        seq: Number(entry.seq),
        event: JSON.parse(entry.event_json) as MultiplayerEvent
      }))
    };
  }

  async listRecentMatches(limit: number): Promise<readonly MatchSummaryRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT m.match_id, m.seed, m.number_of_rounds, m.started_at,
                m.finished_at, m.winner_player_id,
                (SELECT COUNT(*) FROM match_events e WHERE e.match_id = m.match_id) AS event_count
           FROM matches m
          ORDER BY m.started_at DESC
          LIMIT ?`
      )
      .all(clampLimit(limit)) as unknown as MatchSummaryRow[];

    return rows.map((row) => ({
      matchId: row.match_id,
      seed: row.seed,
      numberOfRounds: Number(row.number_of_rounds),
      startedAt: Number(row.started_at),
      finishedAt: row.finished_at === null ? undefined : Number(row.finished_at),
      winnerPlayerId: row.winner_player_id ?? undefined,
      eventCount: Number(row.event_count)
    }));
  }

  async anonymizeUserInMatches(userId: string): Promise<number> {
    // `userId` ir randomUUID (hex+defises, NAV LIKE wildcardu) → drošs LIKE bez escape.
    const rows = this.db
      .prepare(`SELECT match_id, players_json FROM matches WHERE players_json LIKE '%' || ? || '%'`)
      .all(userId) as Array<{ readonly match_id: string; readonly players_json: string }>;
    if (rows.length === 0) {
      return 0;
    }
    const update = this.db.prepare(`UPDATE matches SET players_json = ? WHERE match_id = ?`);
    this.db.exec("BEGIN");
    try {
      let changed = 0;
      for (const row of rows) {
        const scrubbed = scrubSeats(row.players_json, userId);
        if (scrubbed !== undefined) {
          update.run(JSON.stringify(scrubbed), row.match_id);
          changed += 1;
        }
      }
      this.db.exec("COMMIT");
      return changed;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async savePlayerStats(stats: PlayerStatsRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO player_stats (player_id, games_played, games_won, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           games_played = excluded.games_played,
           games_won    = excluded.games_won,
           updated_at   = excluded.updated_at`
      )
      .run(stats.playerId, stats.gamesPlayed, stats.gamesWon, stats.updatedAt);
  }

  async incrementPlayerStats(stats: PlayerStatsIncrementRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO player_stats (player_id, games_played, games_won, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET
           games_played = player_stats.games_played + excluded.games_played,
           games_won    = player_stats.games_won + excluded.games_won,
           updated_at   = max(player_stats.updated_at, excluded.updated_at)`
      )
      .run(stats.playerId, stats.gamesPlayedDelta, stats.gamesWonDelta, stats.updatedAt);
  }

  async getPlayerStats(playerId: string): Promise<PlayerStatsRecord | undefined> {
    const row = this.db
      .prepare(
        `SELECT player_id, games_played, games_won, updated_at
           FROM player_stats WHERE player_id = ?`
      )
      .get(playerId) as PlayerStatsRow | undefined;
    if (!row) {
      return undefined;
    }
    return {
      playerId: row.player_id,
      gamesPlayed: Number(row.games_played),
      gamesWon: Number(row.games_won),
      updatedAt: Number(row.updated_at)
    };
  }

  async appendChatMessage(message: ChatMessage): Promise<void> {
    // Idempotents pēc ziņas id (atkārtots id netiek dublēts).
    this.db
      .prepare(
        `INSERT OR IGNORE INTO chat_messages (id, author_display_id, text, server_now)
         VALUES (?, ?, ?, ?)`
      )
      .run(message.id, message.authorDisplayId, message.text, message.serverNow);
  }

  async loadRecentChatMessages(limit: number): Promise<readonly ChatMessage[]> {
    // Paņemam pēdējās N pēc `server_now` (ar `id` kā stabilu neizšķirtu), tad
    // apgriežam uz hronoloģisku (vecākās pirmās). Kārtošana SASKAŅOTA ar
    // `PostgresStorage` (m8: `server_now DESC, id DESC` → pēc reverse `server_now ASC,
    // id ASC`), lai abi backendi dod identisku secību arī pie vienāda `server_now`.
    const rows = this.db
      .prepare(
        `SELECT id, author_display_id, text, server_now
           FROM chat_messages
          ORDER BY server_now DESC, id DESC
          LIMIT ?`
      )
      .all(clampLimit(limit)) as unknown as ChatRow[];

    return rows
      .map((row) => ({
        id: row.id,
        authorDisplayId: row.author_display_id,
        text: row.text,
        serverNow: Number(row.server_now)
      }))
      .reverse();
  }

  async createUser(record: UserRecord): Promise<CreateUserResult> {
    try {
      this.db
        .prepare(
          `INSERT INTO users
             (id, username, username_norm, email, email_norm, password_hash, avatar, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          record.id,
          record.username,
          record.usernameNorm,
          record.email ?? null,
          record.emailNorm ?? null,
          record.passwordHash,
          record.avatar,
          record.createdAt,
          record.updatedAt
        );
      return "created";
    } catch (error) {
      if (isSqliteUniqueViolation(error)) {
        return "conflict";
      }
      throw error;
    }
  }

  async getUserById(id: string): Promise<UserRecord | undefined> {
    const row = this.db.prepare(`${USER_SELECT} WHERE id = ?`).get(id) as UserRow | undefined;
    return row ? rowToUser(row) : undefined;
  }

  async getUserByUsernameNorm(usernameNorm: string): Promise<UserRecord | undefined> {
    const row = this.db
      .prepare(`${USER_SELECT} WHERE username_norm = ?`)
      .get(usernameNorm) as UserRow | undefined;
    return row ? rowToUser(row) : undefined;
  }

  async getUserByEmailNorm(emailNorm: string): Promise<UserRecord | undefined> {
    const row = this.db
      .prepare(`${USER_SELECT} WHERE email_norm = ?`)
      .get(emailNorm) as UserRow | undefined;
    return row ? rowToUser(row) : undefined;
  }

  async updateUserProfile(id: string, update: ProfileUpdate): Promise<UpdateProfileResult> {
    const keepCustom = update.avatar === "custom";
    this.db.exec("BEGIN");
    try {
      // `'custom'` marķieri pārvalda TIKAI setAvatarUpload (uzliek) un preset-switch
      // (noņem) — profila update NEPIESKARAS avatar kolonnai, ja `'custom'`, tikai
      // username. Tas vienā atomiskā UPDATE novērš race + custom-bez-blob stāvokli.
      const result = keepCustom
        ? this.db
            .prepare(`UPDATE users SET username = ?, username_norm = ?, updated_at = ? WHERE id = ?`)
            .run(update.username, update.usernameNorm, update.updatedAt, id)
        : this.db
            .prepare(
              `UPDATE users SET username = ?, username_norm = ?, avatar = ?, updated_at = ? WHERE id = ?`
            )
            .run(update.username, update.usernameNorm, update.avatar, update.updatedAt, id);
      if (Number(result.changes) === 0) {
        this.db.exec("ROLLBACK");
        return "not_found";
      }
      // Pārslēdzoties uz preset, dzēš custom blob TAJĀ PAŠĀ transakcijā.
      if (!keepCustom) {
        this.db.prepare(`DELETE FROM user_avatars WHERE user_id = ?`).run(id);
      }
      this.db.exec("COMMIT");
      return "updated";
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isSqliteUniqueViolation(error)) {
        return "username_taken";
      }
      throw error;
    }
  }

  async adminUpdateAccount(
    id: string,
    update: AdminAccountUpdate
  ): Promise<AdminUpdateAccountResult> {
    this.db.exec("BEGIN");
    try {
      const result = this.db
        .prepare(
          `UPDATE users
              SET username = ?, username_norm = ?, email = ?, email_norm = ?,
                  avatar = ?, updated_at = ?
            WHERE id = ?`
        )
        .run(
          update.username,
          update.usernameNorm,
          update.email ?? null,
          update.emailNorm ?? null,
          update.avatar,
          update.updatedAt,
          id
        );
      if (Number(result.changes) === 0) {
        this.db.exec("ROLLBACK");
        return "not_found";
      }
      // Pārslēdzoties uz preset (NE 'custom'), dzēš orphan custom blob TAJĀ PAŠĀ transakcijā
      // (kā player-side `updateUserProfile`), citādi eksports rādītu `hasCustomAvatar:true` (Codex).
      if (update.avatar !== "custom") {
        this.db.prepare(`DELETE FROM user_avatars WHERE user_id = ?`).run(id);
      }
      this.db.exec("COMMIT");
      return "updated";
    } catch (error) {
      this.db.exec("ROLLBACK");
      if (isSqliteUniqueViolation(error)) {
        return "conflict";
      }
      throw error;
    }
  }

  async adminSetUserStats(
    userId: string,
    stats: { readonly gamesPlayed: number; readonly wins: number; readonly losses: number },
    updatedAt: number
  ): Promise<void> {
    // SET (NE inkrements): pārraksta agregātu uz admin doto vērtību (D3 korekcija).
    this.db
      .prepare(
        `INSERT INTO user_stats (user_id, games_played, wins, losses, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           games_played = excluded.games_played,
           wins         = excluded.wins,
           losses       = excluded.losses,
           updated_at   = excluded.updated_at`
      )
      .run(userId, stats.gamesPlayed, stats.wins, stats.losses, updatedAt);
  }

  async adminInvalidateCredentials(
    userId: string,
    newPasswordHash: string,
    now: number
  ): Promise<void> {
    // node:sqlite ir sinhrons → transakcija ir droša (bez interleaving).
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
        .run(newPasswordHash, now, userId);
      // Piespiedu izlogošana visur: dzēš VISUS lietotāja auth tokenus.
      this.db.prepare(`DELETE FROM auth_tokens WHERE user_id = ?`).run(userId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async createAuthToken(record: AuthTokenRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO auth_tokens (token_hash, user_id, created_at, last_used_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(record.tokenHash, record.userId, record.createdAt, record.lastUsedAt, record.expiresAt);
  }

  async getAuthToken(tokenHash: string): Promise<AuthTokenRecord | undefined> {
    const row = this.db
      .prepare(
        `SELECT token_hash, user_id, created_at, last_used_at, expires_at
           FROM auth_tokens WHERE token_hash = ?`
      )
      .get(tokenHash) as AuthTokenRow | undefined;
    if (!row) {
      return undefined;
    }
    return {
      tokenHash: row.token_hash,
      userId: row.user_id,
      createdAt: Number(row.created_at),
      lastUsedAt: Number(row.last_used_at),
      expiresAt: Number(row.expires_at)
    };
  }

  async touchAuthToken(tokenHash: string, lastUsedAt: number, expiresAt: number): Promise<void> {
    this.db
      .prepare(`UPDATE auth_tokens SET last_used_at = ?, expires_at = ? WHERE token_hash = ?`)
      .run(lastUsedAt, expiresAt, tokenHash);
  }

  async deleteAuthToken(tokenHash: string): Promise<void> {
    this.db.prepare(`DELETE FROM auth_tokens WHERE token_hash = ?`).run(tokenHash);
  }

  async deleteUserAuthTokens(userId: string): Promise<void> {
    this.db.prepare(`DELETE FROM auth_tokens WHERE user_id = ?`).run(userId);
  }

  async hardDeleteUser(userId: string): Promise<boolean> {
    // Atomiski (D5): PIRMS dzēšanas anonimizē piesaistītās login_attempts rindas (FK SET NULL
    // anulē tikai user_id, bet `username_tried`/`ip`/`user_agent` saglabātu PII — Codex). Tad
    // DELETE users; FK CASCADE noņem pārējās rindas, login_attempts.user_id → NULL (rindas paliek).
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `UPDATE login_attempts SET username_tried = '[deleted]', ip = NULL, user_agent = NULL
             WHERE user_id = ?`
        )
        .run(userId);
      const result = this.db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
      this.db.exec("COMMIT");
      return Number(result.changes) > 0;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async deleteExpiredAuthTokens(now: number): Promise<void> {
    this.db.prepare(`DELETE FROM auth_tokens WHERE expires_at <= ?`).run(now);
  }

  async createPasswordResetToken(record: PasswordResetTokenRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO password_reset_tokens (token_hash, user_id, created_at, expires_at, used_at)
         VALUES (?, ?, ?, ?, NULL)`
      )
      .run(record.tokenHash, record.userId, record.createdAt, record.expiresAt);
  }

  async deleteUnusedPasswordResetTokens(userId: string): Promise<void> {
    this.db
      .prepare(`DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL`)
      .run(userId);
  }

  async resetPasswordWithToken(
    tokenHash: string,
    newPasswordHash: string,
    now: number
  ): Promise<string | undefined> {
    // node:sqlite ir sinhrons → transakcija ir droša (bez interleaving).
    this.db.exec("BEGIN");
    try {
      // Atomiski "claim" tokenu: tikai ja neizmantots UN nav beidzies (race-aizsardzība).
      const claimed = this.db
        .prepare(
          `UPDATE password_reset_tokens SET used_at = ?
            WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`
        )
        .run(now, tokenHash, now);
      if (Number(claimed.changes) === 0) {
        this.db.exec("ROLLBACK");
        return undefined;
      }
      const row = this.db
        .prepare(`SELECT user_id FROM password_reset_tokens WHERE token_hash = ?`)
        .get(tokenHash) as { user_id: string };
      this.db
        .prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`)
        .run(newPasswordHash, now, row.user_id);
      // Atsauc visas aktīvās sesijas + visus šī lietotāja reset tokenus (force re-login).
      this.db.prepare(`DELETE FROM auth_tokens WHERE user_id = ?`).run(row.user_id);
      this.db.prepare(`DELETE FROM password_reset_tokens WHERE user_id = ?`).run(row.user_id);
      this.db.exec("COMMIT");
      return row.user_id;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async deleteExpiredPasswordResetTokens(now: number): Promise<void> {
    this.db.prepare(`DELETE FROM password_reset_tokens WHERE expires_at <= ?`).run(now);
  }

  async setUserAvatar(record: CustomAvatarRecord): Promise<void> {
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO user_avatars (user_id, content_type, bytes, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (user_id) DO UPDATE SET
             content_type = excluded.content_type,
             bytes        = excluded.bytes,
             updated_at   = excluded.updated_at`
        )
        .run(record.userId, record.contentType, record.bytes, record.updatedAt);
      this.db
        .prepare(`UPDATE users SET avatar = 'custom', updated_at = ? WHERE id = ?`)
        .run(record.updatedAt, record.userId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async getUserAvatar(userId: string): Promise<CustomAvatarRecord | undefined> {
    const row = this.db
      .prepare(`SELECT content_type, bytes, updated_at FROM user_avatars WHERE user_id = ?`)
      .get(userId) as { content_type: string; bytes: Uint8Array; updated_at: number } | undefined;
    if (!row) {
      return undefined;
    }
    return {
      userId,
      contentType: row.content_type,
      bytes: row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes),
      updatedAt: Number(row.updated_at)
    };
  }

  async deleteUserAvatar(userId: string): Promise<void> {
    this.db.prepare(`DELETE FROM user_avatars WHERE user_id = ?`).run(userId);
  }

  async recordUserMatchOutcome(
    matchId: string,
    userId: string,
    outcome: MatchOutcome,
    now: number
  ): Promise<boolean> {
    // node:sqlite ir sinhrons → transakcija ir droša (bez interleaving).
    this.db.exec("BEGIN");
    try {
      const inserted = this.db
        .prepare(
          `INSERT OR IGNORE INTO match_user_outcomes (match_id, user_id, outcome, recorded_at)
           VALUES (?, ?, ?, ?)`
        )
        .run(matchId, userId, outcome, now);
      const isNew = Number(inserted.changes) > 0;
      if (isNew) {
        this.db
          .prepare(
            `INSERT INTO user_stats (user_id, games_played, wins, losses, updated_at)
             VALUES (?, 1, ?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               games_played = user_stats.games_played + 1,
               wins         = user_stats.wins + excluded.wins,
               losses       = user_stats.losses + excluded.losses,
               updated_at   = excluded.updated_at`
          )
          .run(userId, outcome === "win" ? 1 : 0, outcome === "lose" ? 1 : 0, now);
      }
      this.db.exec("COMMIT");
      return isNew;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async getBalance(userId: string): Promise<number> {
    const row = this.db
      .prepare(`SELECT balance FROM coin_balances WHERE user_id = ?`)
      .get(userId) as { balance: number | bigint } | undefined;
    return row ? Number(row.balance) : 0;
  }

  async applyLedger(entry: LedgerEntryInput): Promise<ApplyLedgerResult> {
    const minBalance = entry.minBalance ?? 0;
    // node:sqlite ir sinhrons → transakcija ir droša (bez interleaving).
    this.db.exec("BEGIN");
    try {
      // Idempotences sargs: atkārtots (userId, reason, ref) → INSERT OR IGNORE neko
      // neraksta; tad delta NETIEK piemērota otrreiz.
      const inserted = this.db
        .prepare(
          `INSERT OR IGNORE INTO coin_ledger (id, user_id, delta, reason, ref, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(entry.id, entry.userId, entry.delta, entry.reason, entry.ref, entry.now);
      const currentRow = this.db
        .prepare(`SELECT balance FROM coin_balances WHERE user_id = ?`)
        .get(entry.userId) as { balance: number | bigint } | undefined;
      const current = currentRow ? Number(currentRow.balance) : 0;
      if (Number(inserted.changes) === 0) {
        // Jau piemērota agrāk — idempotents no-op.
        this.db.exec("COMMIT");
        return { ok: true, applied: false, balance: current };
      }
      const next = current + entry.delta;
      if (next < minBalance) {
        // Debets pārsniegtu sargu — atritina arī tikko ievietoto ledger rindu.
        this.db.exec("ROLLBACK");
        return { ok: false, reason: "insufficient" };
      }
      this.db
        .prepare(
          `INSERT INTO coin_balances (user_id, balance, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET balance = ?, updated_at = ?`
        )
        .run(entry.userId, next, entry.now, next, entry.now);
      this.db.exec("COMMIT");
      return { ok: true, applied: true, balance: next };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async sumLedgerSince(userId: string, reason: string, sinceMs: number): Promise<number> {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(delta), 0) AS total
           FROM coin_ledger WHERE user_id = ? AND reason = ? AND created_at >= ?`
      )
      .get(userId, reason, sinceMs) as { total: number | bigint } | undefined;
    return row ? Number(row.total) : 0;
  }

  async listLedgerRefs(userId: string, reason: string): Promise<readonly string[]> {
    const rows = this.db
      .prepare(`SELECT ref FROM coin_ledger WHERE user_id = ? AND reason = ?`)
      .all(userId, reason) as Array<{ ref: string }>;
    return rows.map((row) => row.ref);
  }

  async getUserStats(userId: string): Promise<UserStatsRecord | undefined> {
    const row = this.db
      .prepare(
        `SELECT user_id, games_played, wins, losses, updated_at
           FROM user_stats WHERE user_id = ?`
      )
      .get(userId) as UserStatsRow | undefined;
    if (!row) {
      return undefined;
    }
    return {
      userId: row.user_id,
      gamesPlayed: Number(row.games_played),
      wins: Number(row.wins),
      losses: Number(row.losses),
      updatedAt: Number(row.updated_at)
    };
  }

  async recordGameResult(record: GameResultRecord): Promise<boolean> {
    assertValidGameResult(record);
    const inserted = this.db
      .prepare(
        `INSERT OR IGNORE INTO player_game_results
           (id, user_id, mode, difficulty, placement, round_count,
            bid_met, bid_exceeded, bid_missed, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.userId,
        record.mode,
        record.difficulty ?? null,
        record.placement,
        record.roundCount,
        record.bidMet,
        record.bidExceeded,
        record.bidMissed,
        record.completedAt
      );
    return Number(inserted.changes) > 0;
  }

  async getPlayerGameStats(userId: string): Promise<readonly GameStatsAggregateRow[]> {
    const rows = this.db
      .prepare(
        `SELECT mode, difficulty, placement,
                COUNT(*)        AS games,
                SUM(bid_met)    AS bid_met,
                SUM(bid_exceeded) AS bid_exceeded,
                SUM(bid_missed) AS bid_missed
           FROM player_game_results
          WHERE user_id = ?
          GROUP BY mode, difficulty, placement`
      )
      .all(userId) as unknown as GameResultsAggRow[];
    return rows.map((row) => ({
      mode: row.mode as GameStatsAggregateRow["mode"],
      difficulty: (row.difficulty ?? null) as GameStatsAggregateRow["difficulty"],
      placement: Number(row.placement),
      games: Number(row.games),
      bidMet: Number(row.bid_met),
      bidExceeded: Number(row.bid_exceeded),
      bidMissed: Number(row.bid_missed)
    }));
  }

  async getGameResultOwner(id: string): Promise<string | undefined> {
    const row = this.db
      .prepare(`SELECT user_id FROM player_game_results WHERE id = ?`)
      .get(id) as { user_id: string } | undefined;
    return row?.user_id;
  }

  async getLeaderboard(limit: number, minGames: number): Promise<readonly LeaderboardEntryRecord[]> {
    // CTE: vispirms aprēķina `win_rate` (REAL), tad ranžē (nedrīkst lietot SELECT
    // aliasu ORDER BY iekšā ROW_NUMBER). LEFT JOIN preferences + COALESCE → veci
    // konti bez valodas rindas nav jābackfillo.
    const rows = this.db
      .prepare(
        `${SQLITE_LEADERBOARD_CTE}
         SELECT ${LEADERBOARD_RANK_EXPR} AS leaderboard_rank, ${LEADERBOARD_COLUMNS}
         FROM eligible
         ORDER BY leaderboard_rank
         LIMIT ?`
      )
      .all(minGames, limit) as unknown as LeaderboardRow[];
    return rows.map(rowToLeaderboardEntry);
  }

  async getUserRank(userId: string, minGames: number): Promise<LeaderboardEntryRecord | null> {
    // Ranžē VISU kvalificēto kopu (globālā vieta), tikai pēc tam filtrē lietotāju.
    const row = this.db
      .prepare(
        `${SQLITE_LEADERBOARD_CTE},
         ranked AS (
           SELECT ${LEADERBOARD_RANK_EXPR} AS leaderboard_rank, ${LEADERBOARD_COLUMNS}
           FROM eligible
         )
         SELECT * FROM ranked WHERE user_id = ?`
      )
      .get(minGames, userId) as LeaderboardRow | undefined;
    return row ? rowToLeaderboardEntry(row) : null;
  }

  async getRankedSnapshot(minGames: number): Promise<readonly RankSnapshotRecord[]> {
    const rows = this.db
      .prepare(
        `${SQLITE_LEADERBOARD_CTE}
         SELECT ${LEADERBOARD_RANK_EXPR} AS leaderboard_rank, user_id
         FROM eligible
         ORDER BY leaderboard_rank`
      )
      .all(minGames) as Array<{ readonly leaderboard_rank: number | bigint; readonly user_id: string }>;
    return rows.map((row) => ({ userId: row.user_id, rank: Number(row.leaderboard_rank) }));
  }

  async setUserLanguage(
    userId: string,
    language: AccountLanguage,
    updatedAt: number
  ): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO user_preferences (user_id, language, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           language   = excluded.language,
           updated_at = excluded.updated_at`
      )
      .run(userId, language, updatedAt);
  }

  async getUserLanguage(userId: string): Promise<AccountLanguage | undefined> {
    const row = this.db
      .prepare(`SELECT language FROM user_preferences WHERE user_id = ?`)
      .get(userId) as { readonly language: AccountLanguage } | undefined;
    return row?.language;
  }

  // --- AdminStore: spēlētāju lasīšana (Fāze 1) ---

  async searchPlayers(
    query: string | undefined,
    limit: number,
    offset: number
  ): Promise<readonly AdminPlayerRow[]> {
    const lim = clampLimit(limit);
    const off = Math.max(0, Math.trunc(offset));
    // Pēdējā VEIKSMĪGĀ pieslēgšanās (apakšvaicājums). ORDER BY lieto output aliasu kā ATSEVIŠĶU
    // terminu ar `DESC NULLS LAST` (nekad-pieslēgušies beigās) — validi UN identiski SQLite+PG.
    // (NElietot `last_login_at IS NULL` — PG nepieņem aliasu izteiksmes iekšienē; SQLite gan.)
    const base =
      `SELECT u.id, u.username, u.email, u.avatar, u.created_at,
              (SELECT MAX(la.created_at) FROM login_attempts la
                WHERE la.user_id = u.id AND la.success = 1) AS last_login_at
         FROM users u`;
    const order = `ORDER BY last_login_at DESC NULLS LAST, u.created_at DESC`;
    const trimmed = query?.trim();
    let rows: AdminPlayerSearchRow[];
    if (trimmed === undefined || trimmed === "") {
      rows = this.db.prepare(`${base} ${order} LIMIT ? OFFSET ?`).all(lim, off) as unknown as AdminPlayerSearchRow[];
    } else {
      const like = `%${escapeLike(trimmed.toLowerCase())}%`;
      rows = this.db
        .prepare(
          `${base}
            WHERE u.id = ?
               OR u.username_norm LIKE ? ESCAPE '\\'
               OR (u.email_norm IS NOT NULL AND u.email_norm LIKE ? ESCAPE '\\')
            ${order} LIMIT ? OFFSET ?`
        )
        .all(trimmed, like, like, lim, off) as unknown as AdminPlayerSearchRow[];
    }
    return rows.map(rowToAdminPlayer);
  }

  async getPlayerLoginHistory(
    userId: string,
    limit: number,
    offset: number
  ): Promise<readonly LoginAttemptView[]> {
    const rows = this.db
      .prepare(
        `SELECT id, ip, user_agent, source, success, created_at
           FROM login_attempts WHERE user_id = ?
          ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
      )
      .all(userId, clampLimit(limit), Math.max(0, Math.trunc(offset))) as unknown as LoginAttemptRow[];
    return rows.map(rowToLoginAttempt);
  }

  async countPlayerLoginAttempts(userId: string): Promise<LoginAttemptCounts> {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failed
           FROM login_attempts WHERE user_id = ?`
      )
      .get(userId) as { total: number | bigint; failed: number | bigint | null } | undefined;
    return { total: Number(row?.total ?? 0), failed: Number(row?.failed ?? 0) };
  }

  // --- AdminStore (admin-panel-plan.md, Fāze 0) ---

  async createAdminSession(record: AdminSessionRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO admin_sessions
           (token_hash, created_at, last_used_at, expires_at, revoked_at, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.tokenHash,
        record.createdAt,
        record.lastUsedAt,
        record.expiresAt,
        record.revokedAt ?? null,
        record.ip ?? null,
        record.userAgent ?? null
      );
  }

  async getAdminSession(tokenHash: string): Promise<AdminSessionRecord | undefined> {
    const row = this.db
      .prepare(
        `SELECT token_hash, created_at, last_used_at, expires_at, revoked_at, ip, user_agent
           FROM admin_sessions WHERE token_hash = ?`
      )
      .get(tokenHash) as AdminSessionRow | undefined;
    return row ? rowToAdminSession(row) : undefined;
  }

  async touchAdminSession(tokenHash: string, lastUsedAt: number, expiresAt: number): Promise<void> {
    this.db
      .prepare(
        `UPDATE admin_sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?`
      )
      .run(lastUsedAt, expiresAt, tokenHash);
  }

  async revokeAdminSession(tokenHash: string, revokedAt: number): Promise<void> {
    this.db
      .prepare(`UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ?`)
      .run(revokedAt, tokenHash);
  }

  async deleteExpiredAdminSessions(now: number): Promise<void> {
    this.db.prepare(`DELETE FROM admin_sessions WHERE expires_at <= ?`).run(now);
  }

  async createAdminLoginCode(record: AdminLoginCodeRecord): Promise<void> {
    // Singleton rinda (viens aktīvs izaicinājums): atomisks upsert aizvieto iepriekšējo
    // kodu un atiestata attempts/consumed_at. Viena statement → nav race ar paralēlu login.
    this.db
      .prepare(
        `INSERT INTO admin_login_codes (id, code_hash, created_at, expires_at, attempts, consumed_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           code_hash   = excluded.code_hash,
           created_at  = excluded.created_at,
           expires_at  = excluded.expires_at,
           attempts    = excluded.attempts,
           consumed_at = excluded.consumed_at`
      )
      .run(
        ADMIN_LOGIN_CODE_ID,
        record.codeHash,
        record.createdAt,
        record.expiresAt,
        record.attempts,
        record.consumedAt ?? null
      );
  }

  async consumeAdminLoginCode(
    submittedCodeHash: string,
    now: number,
    maxAttempts: number
  ): Promise<AdminLoginCodeConsumeResult> {
    // node:sqlite ir sinhrons → transakcija serializē read-modify-write (bez interleaving).
    this.db.exec("BEGIN");
    try {
      const row = this.db
        .prepare(
          `SELECT code_hash, expires_at, attempts FROM admin_login_codes
            WHERE id = ? AND consumed_at IS NULL`
        )
        .get(ADMIN_LOGIN_CODE_ID) as
        | { code_hash: string; expires_at: number; attempts: number }
        | undefined;
      if (!row) {
        this.db.exec("COMMIT");
        return { status: "no_code" };
      }
      const consume = (): void => {
        this.db.prepare(`UPDATE admin_login_codes SET consumed_at = ? WHERE id = ?`).run(now, ADMIN_LOGIN_CODE_ID);
      };
      if (Number(row.expires_at) <= now) {
        consume();
        this.db.exec("COMMIT");
        return { status: "expired" };
      }
      const attempts = Number(row.attempts) + 1;
      if (attempts > maxAttempts) {
        consume();
        this.db.exec("COMMIT");
        return { status: "locked" };
      }
      if (timingSafeEqualHex(row.code_hash, submittedCodeHash)) {
        consume();
        this.db.exec("COMMIT");
        return { status: "ok" };
      }
      this.db.prepare(`UPDATE admin_login_codes SET attempts = ? WHERE id = ?`).run(attempts, ADMIN_LOGIN_CODE_ID);
      this.db.exec("COMMIT");
      return { status: "invalid" };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async deleteExpiredAdminLoginCodes(now: number): Promise<void> {
    this.db.prepare(`DELETE FROM admin_login_codes WHERE expires_at <= ?`).run(now);
  }

  async appendAdminAudit(entry: AdminAuditEntry): Promise<void> {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO admin_audit_log
           (id, action, target_type, target_id, summary, diff_json, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.summary,
        entry.diff === undefined ? null : JSON.stringify(entry.diff),
        entry.ip ?? null,
        entry.createdAt
      );
  }

  async listAdminAudit(limit: number, offset: number): Promise<readonly AdminAuditEntry[]> {
    const rows = this.db
      .prepare(
        `SELECT id, action, target_type, target_id, summary, diff_json, ip, created_at
           FROM admin_audit_log
          ORDER BY created_at DESC, id DESC
          LIMIT ? OFFSET ?`
      )
      .all(clampLimit(limit), Math.max(0, Math.trunc(offset))) as unknown as AdminAuditRow[];
    return rows.map(rowToAdminAudit);
  }

  async appendLoginAttempt(record: LoginAttemptRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO login_attempts
           (id, user_id, username_tried, ip, user_agent, source, success, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.userId ?? null,
        record.usernameTried,
        record.ip ?? null,
        record.userAgent ?? null,
        record.source,
        record.success ? 1 : 0,
        record.createdAt
      );
  }

  async createBan(record: BanRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO bans
           (id, user_id, ip, reason, kind, duration_label, expires_at, created_at, revoked_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.userId ?? null,
        record.ip ?? null,
        record.reason,
        record.kind,
        record.durationLabel,
        record.expiresAt ?? null,
        record.createdAt,
        record.revokedAt ?? null,
        record.createdBy
      );
  }

  async listBans(limit: number, offset: number): Promise<readonly BanRecord[]> {
    const rows = this.db
      .prepare(`${BAN_SELECT} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(limit, offset) as unknown as BanRow[];
    return rows.map(rowToBan);
  }

  async getBanById(id: string): Promise<BanRecord | undefined> {
    const row = this.db.prepare(`${BAN_SELECT} WHERE id = ?`).get(id) as BanRow | undefined;
    return row ? rowToBan(row) : undefined;
  }

  async revokeBan(id: string, now: number): Promise<boolean> {
    // Atsauc TIKAI, ja šobrīd AKTĪVS (nav atsaukts UN nav beidzies) — idempotents pret dubultu
    // revoke; jau-beidzies temporary bans → `false` (`not_active`, atbilst servisa semantikai).
    const result = this.db
      .prepare(
        `UPDATE bans SET revoked_at = ?
           WHERE id = ? AND revoked_at IS NULL AND (kind = 'permanent' OR expires_at > ?)`
      )
      .run(now, id, now);
    return Number(result.changes) > 0;
  }

  async findActiveUserBan(userId: string, now: number): Promise<BanRecord | undefined> {
    const row = this.db
      .prepare(`${BAN_SELECT} WHERE user_id = ? AND ${BAN_ACTIVE_CLAUSE} ORDER BY created_at DESC LIMIT 1`)
      .get(userId, now) as BanRow | undefined;
    return row ? rowToBan(row) : undefined;
  }

  async findActiveIpBan(ip: string, now: number): Promise<BanRecord | undefined> {
    const row = this.db
      .prepare(`${BAN_SELECT} WHERE ip = ? AND ${BAN_ACTIVE_CLAUSE} ORDER BY created_at DESC LIMIT 1`)
      .get(ip, now) as BanRow | undefined;
    return row ? rowToBan(row) : undefined;
  }

  async addBlockedWord(word: string, now: number): Promise<void> {
    this.db
      .prepare(`INSERT OR IGNORE INTO chat_blocked_words (word, created_at) VALUES (?, ?)`)
      .run(word, now);
  }

  async removeBlockedWord(word: string): Promise<void> {
    this.db.prepare(`DELETE FROM chat_blocked_words WHERE word = ?`).run(word);
  }

  async listBlockedWords(): Promise<readonly string[]> {
    const rows = this.db
      .prepare(`SELECT word FROM chat_blocked_words ORDER BY word ASC`)
      .all() as Array<{ readonly word: string }>;
    return rows.map((r) => r.word);
  }

  // --- Analītika (Fāze 4A) ---

  private scalar(sql: string, ...params: Array<string | number>): number {
    const row = this.db.prepare(sql).get(...params) as { readonly v: number | bigint } | undefined;
    return row ? Number(row.v) : 0;
  }

  async countUsers(): Promise<number> {
    return this.scalar(`SELECT COUNT(*) AS v FROM users`);
  }

  async countNewUsers(sinceMs: number): Promise<number> {
    return this.scalar(`SELECT COUNT(*) AS v FROM users WHERE created_at >= ?`, sinceMs);
  }

  async countActiveUsers(sinceMs: number): Promise<number> {
    return this.scalar(
      `SELECT COUNT(DISTINCT user_id) AS v FROM login_attempts
         WHERE success = 1 AND user_id IS NOT NULL AND created_at >= ?`,
      sinceMs
    );
  }

  async countMatches(): Promise<number> {
    return this.scalar(`SELECT COUNT(*) AS v FROM matches`);
  }

  async sumCoinBalances(): Promise<number> {
    return this.scalar(`SELECT COALESCE(SUM(balance), 0) AS v FROM coin_balances`);
  }

  async countActiveBans(now: number): Promise<number> {
    return this.scalar(`SELECT COUNT(*) AS v FROM bans WHERE ${BAN_ACTIVE_CLAUSE}`, now);
  }

  private dailyCounts(sql: string, sinceMs: number): readonly DailyCount[] {
    const rows = this.db.prepare(sql).all(sinceMs) as Array<{
      readonly day: number | bigint;
      readonly c: number | bigint;
    }>;
    return rows.map((r) => ({ day: Number(r.day), count: Number(r.c) }));
  }

  async dailyRegistrations(sinceMs: number): Promise<readonly DailyCount[]> {
    return this.dailyCounts(
      `SELECT created_at / 86400000 AS day, COUNT(*) AS c FROM users
         WHERE created_at >= ? GROUP BY day ORDER BY day ASC`,
      sinceMs
    );
  }

  async dailyLogins(sinceMs: number): Promise<readonly DailyCount[]> {
    return this.dailyCounts(
      `SELECT created_at / 86400000 AS day, COUNT(*) AS c FROM login_attempts
         WHERE success = 1 AND created_at >= ? GROUP BY day ORDER BY day ASC`,
      sinceMs
    );
  }

  // --- Segmenti (Fāze 4A.2) ---

  async listNewPlayers(sinceMs: number, limit: number): Promise<readonly SegmentPlayer[]> {
    const rows = this.db
      .prepare(
        `SELECT id, username, created_at FROM users
           WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(sinceMs, clampLimit(limit)) as unknown as SegmentPlayerRow[];
    return rows.map(rowToSegmentPlayer);
  }

  async listInactivePlayers(beforeMs: number, limit: number): Promise<readonly SegmentPlayer[]> {
    const rows = this.db
      .prepare(
        `SELECT id, username, created_at FROM users u
           WHERE NOT EXISTS (
             SELECT 1 FROM login_attempts la
              WHERE la.user_id = u.id AND la.success = 1 AND la.created_at >= ?
           )
           ORDER BY created_at ASC LIMIT ?`
      )
      .all(beforeMs, clampLimit(limit)) as unknown as SegmentPlayerRow[];
    return rows.map(rowToSegmentPlayer);
  }

  async listSuspiciousPlayers(
    sinceMs: number,
    minFailed: number,
    limit: number
  ): Promise<readonly SuspiciousPlayer[]> {
    const rows = this.db
      .prepare(
        `SELECT u.id, u.username, COUNT(*) AS failed
           FROM login_attempts la JOIN users u ON u.id = la.user_id
          WHERE la.success = 0 AND la.created_at >= ?
          GROUP BY u.id HAVING COUNT(*) >= ?
          ORDER BY failed DESC LIMIT ?`
      )
      .all(sinceMs, minFailed, clampLimit(limit)) as Array<{
      readonly id: string;
      readonly username: string;
      readonly failed: number | bigint;
    }>;
    return rows.map((r) => ({ id: r.id, username: r.username, failedAttempts: Number(r.failed) }));
  }

  async successfulLoginUserIps(sinceMs: number, limit: number): Promise<readonly LoginUserIp[]> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT user_id, ip FROM login_attempts
           WHERE success = 1 AND user_id IS NOT NULL AND ip IS NOT NULL AND created_at >= ?
           ORDER BY user_id, ip LIMIT ?`
      )
      .all(sinceMs, clampGeoLimit(limit)) as unknown as Array<{ user_id: string; ip: string }>;
    return rows.map((r) => ({ userId: r.user_id, ip: r.ip }));
  }

  async successfulLoginUserAgents(sinceMs: number, limit: number): Promise<readonly LoginUserAgent[]> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT user_id, user_agent FROM login_attempts
           WHERE success = 1 AND user_id IS NOT NULL AND created_at >= ?
           ORDER BY user_id, user_agent LIMIT ?`
      )
      .all(sinceMs, clampGeoLimit(limit)) as unknown as Array<{
      user_id: string;
      user_agent: string | null;
    }>;
    return rows.map((r) => ({ userId: r.user_id, userAgent: r.user_agent ?? undefined }));
  }

  // --- Eksports (Fāze 4B.2; pilns, bez limita) ---

  async exportUserLedger(userId: string): Promise<readonly LedgerEntryView[]> {
    const rows = this.db
      .prepare(
        `SELECT id, delta, reason, ref, created_at FROM coin_ledger
           WHERE user_id = ? ORDER BY created_at DESC`
      )
      .all(userId) as Array<{
      readonly id: string;
      readonly delta: number | bigint;
      readonly reason: string;
      readonly ref: string;
      readonly created_at: number | bigint;
    }>;
    return rows.map((r) => ({
      id: r.id,
      delta: Number(r.delta),
      reason: r.reason,
      ref: r.ref,
      createdAt: Number(r.created_at)
    }));
  }

  async exportUserLoginHistory(userId: string): Promise<readonly LoginAttemptView[]> {
    const rows = this.db
      .prepare(
        `SELECT id, ip, user_agent, source, success, created_at FROM login_attempts
           WHERE user_id = ? ORDER BY created_at DESC`
      )
      .all(userId) as unknown as LoginAttemptRow[];
    return rows.map(rowToLoginAttempt);
  }

  async exportUserBans(userId: string): Promise<readonly BanRecord[]> {
    const rows = this.db
      .prepare(`${BAN_SELECT} WHERE user_id = ? ORDER BY created_at DESC`)
      .all(userId) as unknown as BanRow[];
    return rows.map(rowToBan);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

interface MatchRow {
  readonly match_id: string;
  readonly seed: string;
  readonly number_of_rounds: number;
  readonly players_json: string;
  readonly started_at: number;
}

interface MatchSummaryRow extends MatchRow {
  readonly finished_at: number | null;
  readonly winner_player_id: string | null;
  readonly event_count: number;
}

interface EventRow {
  readonly seq: number;
  readonly event_json: string;
}

interface PlayerStatsRow {
  readonly player_id: string;
  readonly games_played: number;
  readonly games_won: number;
  readonly updated_at: number;
}

interface ChatRow {
  readonly id: string;
  readonly author_display_id: string;
  readonly text: string;
  readonly server_now: number;
}

function rowToMatchStarted(row: MatchRow): MatchStartedRecord {
  return {
    matchId: row.match_id,
    seed: row.seed,
    numberOfRounds: Number(row.number_of_rounds),
    players: JSON.parse(row.players_json) as MatchStartedRecord["players"],
    startedAt: Number(row.started_at)
  };
}

/** Drošs LIMIT: vesels skaitlis 1..1000 (sargā pret nederīgu ievadi). */
function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 1;
  }
  return Math.max(1, Math.min(1000, Math.floor(limit)));
}

/** Drošs LIMIT distinct-pāru geo segmentiem (lielāki griesti nekā saraksta `clampLimit`; D4). */
function clampGeoLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 1;
  }
  return Math.max(1, Math.min(200_000, Math.floor(limit)));
}

const USER_SELECT = `SELECT id, username, username_norm, email, email_norm, password_hash, avatar, created_at, updated_at FROM users`;

interface UserRow {
  readonly id: string;
  readonly username: string;
  readonly username_norm: string;
  readonly email: string | null;
  readonly email_norm: string | null;
  readonly password_hash: string;
  readonly avatar: string;
  readonly created_at: number;
  readonly updated_at: number;
}

interface AuthTokenRow {
  readonly token_hash: string;
  readonly user_id: string;
  readonly created_at: number;
  readonly last_used_at: number;
  readonly expires_at: number;
}

interface UserStatsRow {
  readonly user_id: string;
  readonly games_played: number;
  readonly wins: number;
  readonly losses: number;
  readonly updated_at: number;
}

/** Agregāta rinda no `player_game_results` GROUP BY (skaitļi var nākt kā bigint). */
interface GameResultsAggRow {
  readonly mode: string;
  readonly difficulty: string | null;
  readonly placement: number | bigint;
  readonly games: number | bigint;
  readonly bid_met: number | bigint;
  readonly bid_exceeded: number | bigint;
  readonly bid_missed: number | bigint;
}

/**
 * Leaderboard ranžēšanas kārtība (tie-break): win rate DESC, tad wins, games,
 * username, un kā pēdējais — STABILAIS `user_id` (deterministiska secība pie
 * pilnīga neizšķirta). Lietota gan `ROW_NUMBER` logā, gan visos 3 vaicājumos.
 */
const LEADERBOARD_ORDER =
  "win_rate DESC, wins DESC, games_played DESC, username ASC, user_id ASC";
const LEADERBOARD_RANK_EXPR = `ROW_NUMBER() OVER (ORDER BY ${LEADERBOARD_ORDER})`;
const LEADERBOARD_COLUMNS =
  "user_id, username, avatar, wins, losses, games_played, win_rate, language, updated_at";
/** `eligible` CTE (SQLite): win_rate kā REAL; tikai games_played >= ? (param 1). */
const SQLITE_LEADERBOARD_CTE = `WITH eligible AS (
  SELECT u.id AS user_id, u.username, u.avatar,
         us.wins, us.losses, us.games_played,
         (CAST(us.wins AS REAL) / us.games_played) AS win_rate,
         COALESCE(p.language, 'en') AS language,
         us.updated_at
  FROM user_stats us
  JOIN users u ON u.id = us.user_id
  LEFT JOIN user_preferences p ON p.user_id = u.id
  WHERE us.games_played >= ?
)`;

interface LeaderboardRow {
  readonly leaderboard_rank: number | bigint;
  readonly user_id: string;
  readonly username: string;
  readonly avatar: string;
  readonly wins: number;
  readonly losses: number;
  readonly games_played: number;
  readonly win_rate: number;
  readonly language: AccountLanguage;
  readonly updated_at: number | bigint;
}

function rowToLeaderboardEntry(row: LeaderboardRow): LeaderboardEntryRecord {
  return {
    rank: Number(row.leaderboard_rank),
    userId: row.user_id,
    username: row.username,
    avatar: row.avatar,
    wins: Number(row.wins),
    losses: Number(row.losses),
    gamesPlayed: Number(row.games_played),
    winRate: Number(row.win_rate),
    language: row.language,
    updatedAt: Number(row.updated_at)
  };
}

function rowToUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    usernameNorm: row.username_norm,
    email: row.email ?? undefined,
    emailNorm: row.email_norm ?? undefined,
    passwordHash: row.password_hash,
    avatar: row.avatar,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

/** node:sqlite met UNIQUE pārkāpumu kā Error ar ziņu "UNIQUE constraint failed". */
function isSqliteUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error && /UNIQUE constraint failed/iu.test(error.message)
  );
}

interface AdminSessionRow {
  readonly token_hash: string;
  readonly created_at: number | bigint;
  readonly last_used_at: number | bigint;
  readonly expires_at: number | bigint;
  readonly revoked_at: number | bigint | null;
  readonly ip: string | null;
  readonly user_agent: string | null;
}

function rowToAdminSession(row: AdminSessionRow): AdminSessionRecord {
  return {
    tokenHash: row.token_hash,
    createdAt: Number(row.created_at),
    lastUsedAt: Number(row.last_used_at),
    expiresAt: Number(row.expires_at),
    revokedAt: row.revoked_at === null ? undefined : Number(row.revoked_at),
    ip: row.ip ?? undefined,
    userAgent: row.user_agent ?? undefined
  };
}

interface AdminAuditRow {
  readonly id: string;
  readonly action: string;
  readonly target_type: string | null;
  readonly target_id: string | null;
  readonly summary: string;
  readonly diff_json: string | null;
  readonly ip: string | null;
  readonly created_at: number | bigint;
}

function rowToAdminAudit(row: AdminAuditRow): AdminAuditEntry {
  return {
    id: row.id,
    action: row.action,
    targetType: row.target_type ?? undefined,
    targetId: row.target_id ?? undefined,
    summary: row.summary,
    diff: row.diff_json === null ? undefined : (JSON.parse(row.diff_json) as unknown),
    ip: row.ip ?? undefined,
    createdAt: Number(row.created_at)
  };
}

/** Bana kolonnu saraksts + aktīvuma klauzula (koplietots; `?` = `now`). */
const BAN_SELECT = `SELECT id, user_id, ip, reason, kind, duration_label, expires_at,
  created_at, revoked_at, created_by FROM bans`;
const BAN_ACTIVE_CLAUSE = `revoked_at IS NULL AND (kind = 'permanent' OR expires_at > ?)`;

interface BanRow {
  readonly id: string;
  readonly user_id: string | null;
  readonly ip: string | null;
  readonly reason: string;
  readonly kind: string;
  readonly duration_label: string;
  readonly expires_at: number | bigint | null;
  readonly created_at: number | bigint;
  readonly revoked_at: number | bigint | null;
  readonly created_by: string;
}

function rowToBan(row: BanRow): BanRecord {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    ip: row.ip ?? undefined,
    reason: row.reason,
    kind: row.kind as BanRecord["kind"],
    durationLabel: row.duration_label,
    expiresAt: row.expires_at === null ? undefined : Number(row.expires_at),
    createdAt: Number(row.created_at),
    revokedAt: row.revoked_at === null ? undefined : Number(row.revoked_at),
    createdBy: row.created_by
  };
}

interface AdminPlayerSearchRow {
  readonly id: string;
  readonly username: string;
  readonly email: string | null;
  readonly avatar: string;
  readonly created_at: number | bigint;
  readonly last_login_at: number | bigint | null;
}

function rowToAdminPlayer(row: AdminPlayerSearchRow): AdminPlayerRow {
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? undefined,
    avatar: row.avatar,
    createdAt: Number(row.created_at),
    lastLoginAt: row.last_login_at === null ? undefined : Number(row.last_login_at)
  };
}

interface LoginAttemptRow {
  readonly id: string;
  readonly ip: string | null;
  readonly user_agent: string | null;
  readonly source: string;
  readonly success: number | bigint;
  readonly created_at: number | bigint;
}

function rowToLoginAttempt(row: LoginAttemptRow): LoginAttemptView {
  return {
    id: row.id,
    ip: row.ip ?? undefined,
    userAgent: row.user_agent ?? undefined,
    source: row.source,
    success: Number(row.success) !== 0,
    createdAt: Number(row.created_at)
  };
}

interface SegmentPlayerRow {
  readonly id: string;
  readonly username: string;
  readonly created_at: number | bigint;
}

function rowToSegmentPlayer(row: SegmentPlayerRow): SegmentPlayer {
  return { id: row.id, username: row.username, createdAt: Number(row.created_at) };
}

/** Aizsargā LIKE meklēšanas burtus (`\` `%` `_`) ar `\` (lieto ar `ESCAPE '\'`). */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (ch) => `\\${ch}`);
}

/**
 * Konstanta laika hex virkņu salīdzinājums (OTP hash). Atgriež `false` pie atšķirīga
 * garuma (timingSafeEqual prasa vienādu garumu); abi ir sha256 hex (64 rakstzīmes).
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
