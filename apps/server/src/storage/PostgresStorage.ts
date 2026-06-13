import { Pool, type QueryResult, type QueryResultRow } from "pg";

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
import { runMigrations } from "./migrations.js";
import type { RoomLeaseRecord, RoomLeaseRequest, RoomLeaseStore } from "./RoomLeaseStore.js";
import type {
  CreateDurableSessionResult,
  DurableSessionRecord,
  DurableSessionStore,
  NewDurableSessionRecord
} from "../sessions/DurableSessionStore.js";
import type {
  AccountLanguage,
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

interface PgPool {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<T>>;
  end(): Promise<void>;
  // `pg` `Pool` atklāj šos kā sinhronus getterus; opcionāli, lai test-dubultnieki
  // tos var nesniegt (sk. `healthCheck`).
  readonly totalCount?: number;
  readonly idleCount?: number;
  readonly waitingCount?: number;
}

/** PostgreSQL pool limiti (caur no `config.pg`); tieši `pg` `PoolConfig` lauki. */
export interface PgPoolOptions {
  readonly max?: number;
  readonly idleTimeoutMillis?: number;
  readonly connectionTimeoutMillis?: number;
}

/** Savienojumu pool piesātinājums (trendiem `/metrics`). */
export interface PoolStats {
  readonly total: number;
  readonly idle: number;
  readonly waiting: number;
}

/** `/metrics` DB momentuzņēmums (tikai PG režīmā): veselība + backlog + izmēri. */
export interface DbHealthReport {
  /** `true`, ja `SELECT 1` izdevās; `false` signalizē DB nepieejamību monitoringam. */
  readonly ok: boolean;
  /** `SELECT 1` aprites laiks ms (arī pie `ok:false` — cik ilgi gaidīja līdz kļūdai). */
  readonly latencyMs: number;
  /** Storage pool piesātinājums: `waiting > 0` nozīmē pieprasījumus rindā. */
  readonly pool: PoolStats;
  /**
   * Fanout backlog: `server_event_fanout` rindu skaits un vecākā ieraksta vecums ms.
   * Augošs `rows`/`oldestAgeMs` nozīmē, ka prune neuztur līdzi (cleanup problēma).
   */
  readonly fanout: { readonly rows: number; readonly oldestAgeMs: number };
  /** Tabulu aptuvenais izmērs (rindas + baiti) augšanas uzraudzībai, pēc tabulas nosaukuma. */
  readonly tables: Record<string, { readonly rows: number; readonly bytes: number }>;
}

export class PostgresStorage
  implements StoragePort, RoomLeaseStore, DurableSessionStore, AuthStore
{
  private constructor(private readonly pool: PgPool) {}

  static async open(
    connectionString: string,
    poolOptions: PgPoolOptions = {}
  ): Promise<PostgresStorage> {
    const storage = new PostgresStorage(new Pool({ connectionString, ...poolOptions }));
    await storage.migrate();
    return storage;
  }

  static async fromPool(pool: PgPool): Promise<PostgresStorage> {
    const storage = new PostgresStorage(pool);
    await storage.migrate();
    return storage;
  }

  private async migrate(): Promise<void> {
    await runMigrations(this.pool);
  }

  async saveMatchStarted(match: MatchStartedRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO matches (match_id, seed, number_of_rounds, players_json, started_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (match_id) DO NOTHING`,
      [match.matchId, match.seed, match.numberOfRounds, JSON.stringify(match.players), match.startedAt]
    );
  }

  async appendMatchEvent(matchId: string, event: MatchEventRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO match_events (match_id, seq, event_json)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (match_id, seq) DO NOTHING`,
      [matchId, event.seq, JSON.stringify(event.event)]
    );
  }

  async saveMatchFinished(result: MatchFinishedRecord): Promise<void> {
    await this.pool.query(
      `UPDATE matches
          SET finished_at = $1, winner_player_id = $2
        WHERE match_id = $3`,
      [result.finishedAt, result.winnerPlayerId ?? null, result.matchId]
    );
  }

  async loadUnfinishedMatch(matchId: string): Promise<UnfinishedMatch | undefined> {
    const matchResult = await this.pool.query<MatchRow>(
      `SELECT match_id, seed, number_of_rounds, players_json, started_at
         FROM matches
        WHERE match_id = $1 AND finished_at IS NULL`,
      [matchId]
    );
    const row = matchResult.rows[0];
    if (!row) {
      return undefined;
    }

    const eventResult = await this.pool.query<EventRow>(
      `SELECT seq, event_json FROM match_events
        WHERE match_id = $1 ORDER BY seq ASC`,
      [matchId]
    );

    return {
      match: rowToMatchStarted(row),
      events: eventResult.rows.map((entry) => ({
        seq: Number(entry.seq),
        event: parseJsonValue<MultiplayerEvent>(entry.event_json)
      }))
    };
  }

  async listRecentMatches(limit: number): Promise<readonly MatchSummaryRecord[]> {
    const result = await this.pool.query<MatchSummaryRow>(
      `SELECT m.match_id, m.seed, m.number_of_rounds, m.started_at,
              m.finished_at, m.winner_player_id,
              (SELECT COUNT(*) FROM match_events e WHERE e.match_id = m.match_id) AS event_count
         FROM matches m
        ORDER BY m.started_at DESC
        LIMIT $1`,
      [clampLimit(limit)]
    );

    return result.rows.map((row) => ({
      matchId: row.match_id,
      seed: row.seed,
      numberOfRounds: Number(row.number_of_rounds),
      startedAt: Number(row.started_at),
      finishedAt: row.finished_at === null ? undefined : Number(row.finished_at),
      winnerPlayerId: row.winner_player_id ?? undefined,
      eventCount: Number(row.event_count)
    }));
  }

  async savePlayerStats(stats: PlayerStatsRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO player_stats (player_id, games_played, games_won, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (player_id) DO UPDATE SET
         games_played = EXCLUDED.games_played,
         games_won    = EXCLUDED.games_won,
         updated_at   = EXCLUDED.updated_at`,
      [stats.playerId, stats.gamesPlayed, stats.gamesWon, stats.updatedAt]
    );
  }

  async incrementPlayerStats(stats: PlayerStatsIncrementRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO player_stats (player_id, games_played, games_won, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (player_id) DO UPDATE SET
         games_played = player_stats.games_played + EXCLUDED.games_played,
         games_won    = player_stats.games_won + EXCLUDED.games_won,
         updated_at   = GREATEST(player_stats.updated_at, EXCLUDED.updated_at)`,
      [stats.playerId, stats.gamesPlayedDelta, stats.gamesWonDelta, stats.updatedAt]
    );
  }

  async getPlayerStats(playerId: string): Promise<PlayerStatsRecord | undefined> {
    const result = await this.pool.query<PlayerStatsRow>(
      `SELECT player_id, games_played, games_won, updated_at
         FROM player_stats WHERE player_id = $1`,
      [playerId]
    );
    const row = result.rows[0];
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
    await this.pool.query(
      `INSERT INTO chat_messages (id, author_display_id, text, server_now)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [message.id, message.authorDisplayId, message.text, message.serverNow]
    );
  }

  async loadRecentChatMessages(limit: number): Promise<readonly ChatMessage[]> {
    const result = await this.pool.query<ChatRow>(
      `SELECT id, author_display_id, text, server_now
         FROM (
           SELECT id, author_display_id, text, server_now
             FROM chat_messages
            ORDER BY server_now DESC, id DESC
            LIMIT $1
         ) recent
        ORDER BY server_now ASC, id ASC`,
      [clampLimit(limit)]
    );

    return result.rows.map((row) => ({
      id: row.id,
      authorDisplayId: row.author_display_id,
      text: row.text,
      serverNow: Number(row.server_now)
    }));
  }

  async getSession(playerId: string): Promise<DurableSessionRecord | undefined> {
    const result = await this.pool.query<PlayerSessionRow>(
      `SELECT player_id, reconnect_token, display_id, updated_at
         FROM player_sessions
        WHERE player_id = $1`,
      [playerId]
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    return {
      playerId: row.player_id,
      reconnectToken: row.reconnect_token,
      displayId: row.display_id,
      updatedAt: Number(row.updated_at)
    };
  }

  async createSessionIfAbsent(
    record: NewDurableSessionRecord
  ): Promise<CreateDurableSessionResult> {
    try {
      const result = await this.pool.query<Pick<PlayerSessionRow, "player_id">>(
        `INSERT INTO player_sessions
           (player_id, reconnect_token, display_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (player_id) DO NOTHING
         RETURNING player_id`,
        [
          record.playerId,
          record.reconnectToken,
          record.displayId,
          record.createdAt,
          record.updatedAt
        ]
      );
      return result.rows.length > 0 ? "created" : "player_exists";
    } catch (error) {
      if (isUniqueViolation(error)) {
        return "display_id_taken";
      }
      throw error;
    }
  }

  async deleteSession(playerId: string): Promise<void> {
    await this.pool.query(`DELETE FROM player_sessions WHERE player_id = $1`, [playerId]);
  }

  async acquireRoomLease(request: RoomLeaseRequest): Promise<RoomLeaseRecord | undefined> {
    const result = await this.pool.query<RoomLeaseRow>(
      `INSERT INTO room_leases (room_id, owner_instance_id, expires_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (room_id) DO UPDATE SET
         owner_instance_id = EXCLUDED.owner_instance_id,
         expires_at        = EXCLUDED.expires_at,
         updated_at        = EXCLUDED.updated_at
       WHERE room_leases.expires_at <= $5
          OR room_leases.owner_instance_id = EXCLUDED.owner_instance_id
       RETURNING room_id, owner_instance_id, expires_at, updated_at`,
      [
        request.roomId,
        request.ownerInstanceId,
        request.now + normalizeLeaseTtl(request.ttlMs),
        request.now,
        request.now
      ]
    );
    return rowToRoomLease(result.rows[0]);
  }

  async renewRoomLease(request: RoomLeaseRequest): Promise<RoomLeaseRecord | undefined> {
    const result = await this.pool.query<RoomLeaseRow>(
      `UPDATE room_leases
          SET expires_at = $3, updated_at = $4
        WHERE room_id = $1
          AND owner_instance_id = $2
          AND expires_at > $5
        RETURNING room_id, owner_instance_id, expires_at, updated_at`,
      [
        request.roomId,
        request.ownerInstanceId,
        request.now + normalizeLeaseTtl(request.ttlMs),
        request.now,
        request.now
      ]
    );
    return rowToRoomLease(result.rows[0]);
  }

  async releaseRoomLease(roomId: string, ownerInstanceId: string): Promise<boolean> {
    const result = await this.pool.query<Pick<RoomLeaseRow, "room_id">>(
      `DELETE FROM room_leases
        WHERE room_id = $1 AND owner_instance_id = $2
        RETURNING room_id`,
      [roomId, ownerInstanceId]
    );
    return result.rows.length > 0;
  }

  async getRoomLease(roomId: string): Promise<RoomLeaseRecord | undefined> {
    const result = await this.pool.query<RoomLeaseRow>(
      `SELECT room_id, owner_instance_id, expires_at, updated_at
         FROM room_leases
        WHERE room_id = $1`,
      [roomId]
    );
    return rowToRoomLease(result.rows[0]);
  }

  /**
   * DB veselības pārbaude `/metrics` vajadzībām: izpilda `SELECT 1` un mēra
   * latency + pool piesātinājumu. Kļūda NETIEK mesta — tā tiek atspoguļota kā
   * `ok:false`, jo veselības zonde nedrīkst nogāzt `/metrics` endpointu; lejupejošā
   * stāvokļa signāls ir pati `ok:false` vērtība (to redz monitorings). Per-scrape
   * netiek logots, lai pie ilgstošas DB nepieejamības neapplūdinātu žurnālus.
   */
  async healthCheck(now: () => number = Date.now): Promise<DbHealthReport> {
    const start = now();
    try {
      await this.pool.query("SELECT 1");
    } catch {
      // DB nepieejama: atgriežam ok:false + tukšus rādītājus (neapgrūtinām endpointu
      // ar tālākiem izsaukumiem). `ok:false` ir lejupejošā stāvokļa signāls monitoringam.
      return {
        ok: false,
        latencyMs: now() - start,
        pool: this.poolStats(),
        fanout: { rows: 0, oldestAgeMs: 0 },
        tables: {}
      };
    }
    const latencyMs = now() - start;
    // SELECT 1 izdevās → savācam backlog + izmērus. Ja šie pēc veiksmīga SELECT 1
    // tomēr neizdotos (anomālija), kļūda propagējas uz /metrics 500 (netiek slēpta).
    const fanout = await this.fanoutBacklog(now());
    const tables = await this.tableSizes();
    return { ok: true, latencyMs, pool: this.poolStats(), fanout, tables };
  }

  private poolStats(): PoolStats {
    return {
      total: this.pool.totalCount ?? 0,
      idle: this.pool.idleCount ?? 0,
      waiting: this.pool.waitingCount ?? 0
    };
  }

  private async fanoutBacklog(nowMs: number): Promise<{ rows: number; oldestAgeMs: number }> {
    const result = await this.pool.query<FanoutBacklogRow>(
      `SELECT count(*)::bigint AS rows, COALESCE(min(created_at), 0) AS oldest_created_at
         FROM server_event_fanout`
    );
    const row = result.rows[0];
    const rows = row ? Number(row.rows) : 0;
    const oldest = row ? Number(row.oldest_created_at) : 0;
    return { rows, oldestAgeMs: rows > 0 ? Math.max(0, nowMs - oldest) : 0 };
  }

  private async tableSizes(): Promise<Record<string, { rows: number; bytes: number }>> {
    const result = await this.pool.query<TableSizeRow>(
      `SELECT relname AS name, n_live_tup AS rows, pg_total_relation_size(relid) AS bytes
         FROM pg_stat_user_tables
        WHERE schemaname = current_schema()`
    );
    const tables: Record<string, { rows: number; bytes: number }> = {};
    for (const row of result.rows) {
      tables[row.name] = { rows: Number(row.rows), bytes: Number(row.bytes) };
    }
    return tables;
  }

  async createUser(record: UserRecord): Promise<CreateUserResult> {
    try {
      await this.pool.query(
        `INSERT INTO users
           (id, username, username_norm, email, email_norm, password_hash, avatar, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          record.id,
          record.username,
          record.usernameNorm,
          record.email ?? null,
          record.emailNorm ?? null,
          record.passwordHash,
          record.avatar,
          record.createdAt,
          record.updatedAt
        ]
      );
      return "created";
    } catch (error) {
      if (isUniqueViolation(error)) {
        return "conflict";
      }
      throw error;
    }
  }

  async getUserById(id: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRow>(`${USER_SELECT} WHERE id = $1`, [id]);
    return result.rows[0] ? rowToUser(result.rows[0]) : undefined;
  }

  async getUserByUsernameNorm(usernameNorm: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRow>(`${USER_SELECT} WHERE username_norm = $1`, [
      usernameNorm
    ]);
    return result.rows[0] ? rowToUser(result.rows[0]) : undefined;
  }

  async getUserByEmailNorm(emailNorm: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRow>(`${USER_SELECT} WHERE email_norm = $1`, [
      emailNorm
    ]);
    return result.rows[0] ? rowToUser(result.rows[0]) : undefined;
  }

  async updateUserProfile(id: string, update: ProfileUpdate): Promise<UpdateProfileResult> {
    try {
      // Atomiski (CTE): `'custom'` NEMAINA avatar (CASE) — to pārvalda tikai
      // setAvatarUpload; preset maina avatar + dzēš blob tajā pašā statement.
      // Novērš race + custom-bez-blob stāvokli bez TOC/TOU pārbaudes.
      const result = await this.pool.query(
        `WITH upd AS (
           UPDATE users
              SET username = $1, username_norm = $2,
                  avatar = CASE WHEN $3 = 'custom' THEN avatar ELSE $3 END,
                  updated_at = $4
            WHERE id = $5
            RETURNING id
         ),
         del AS (
           DELETE FROM user_avatars
            WHERE user_id IN (SELECT id FROM upd) AND $3 <> 'custom'
         )
         SELECT id FROM upd`,
        [update.username, update.usernameNorm, update.avatar, update.updatedAt, id]
      );
      return (result.rowCount ?? 0) > 0 ? "updated" : "not_found";
    } catch (error) {
      if (isUniqueViolation(error)) {
        return "username_taken";
      }
      throw error;
    }
  }

  async createAuthToken(record: AuthTokenRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_tokens (token_hash, user_id, created_at, last_used_at, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [record.tokenHash, record.userId, record.createdAt, record.lastUsedAt, record.expiresAt]
    );
  }

  async getAuthToken(tokenHash: string): Promise<AuthTokenRecord | undefined> {
    const result = await this.pool.query<AuthTokenRow>(
      `SELECT token_hash, user_id, created_at, last_used_at, expires_at
         FROM auth_tokens WHERE token_hash = $1`,
      [tokenHash]
    );
    const row = result.rows[0];
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
    await this.pool.query(
      `UPDATE auth_tokens SET last_used_at = $1, expires_at = $2 WHERE token_hash = $3`,
      [lastUsedAt, expiresAt, tokenHash]
    );
  }

  async deleteAuthToken(tokenHash: string): Promise<void> {
    await this.pool.query(`DELETE FROM auth_tokens WHERE token_hash = $1`, [tokenHash]);
  }

  async deleteExpiredAuthTokens(now: number): Promise<void> {
    await this.pool.query(`DELETE FROM auth_tokens WHERE expires_at <= $1`, [now]);
  }

  async createPasswordResetToken(record: PasswordResetTokenRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO password_reset_tokens (token_hash, user_id, created_at, expires_at, used_at)
       VALUES ($1, $2, $3, $4, NULL)`,
      [record.tokenHash, record.userId, record.createdAt, record.expiresAt]
    );
  }

  async deleteUnusedPasswordResetTokens(userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );
  }

  async resetPasswordWithToken(
    tokenHash: string,
    newPasswordHash: string,
    now: number
  ): Promise<string | undefined> {
    // Atomiski VIENĀ statement (kā recordUserMatchOutcome): claim tokenu (tikai ja
    // neizmantots UN nav beidzies), nomaina paroli, atsauc visus auth tokenus un
    // pārējos reset tokenus. Visi CTE statements darbojas uz vienu snapshot, tāpēc
    // pārējos reset dzēš ar `token_hash <> $1` (izvairās no UPDATE/DELETE konflikta).
    const result = await this.pool.query<{ user_id: string }>(
      `WITH claimed AS (
         UPDATE password_reset_tokens SET used_at = $3
           WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $3
           RETURNING user_id
       ),
       pw AS (
         UPDATE users SET password_hash = $2, updated_at = $3
           WHERE id IN (SELECT user_id FROM claimed)
           RETURNING id
       ),
       del_auth AS (
         DELETE FROM auth_tokens WHERE user_id IN (SELECT user_id FROM claimed)
       ),
       del_reset AS (
         DELETE FROM password_reset_tokens
           WHERE user_id IN (SELECT user_id FROM claimed) AND token_hash <> $1
       )
       SELECT user_id FROM claimed`,
      [tokenHash, newPasswordHash, now]
    );
    return result.rows[0]?.user_id;
  }

  async deleteExpiredPasswordResetTokens(now: number): Promise<void> {
    await this.pool.query(`DELETE FROM password_reset_tokens WHERE expires_at <= $1`, [now]);
  }

  async setUserAvatar(record: CustomAvatarRecord): Promise<void> {
    // Atomiski (CTE): UPDATE users PIRMAIS (lock users rindu) → INSERT blob ATKARĪGS
    // no tā (SELECT FROM upd). Konsekventa lock secība (users→user_avatars) ar
    // updateUserProfile novērš deadlock + race ar paralēlu preset-save.
    await this.pool.query(
      `WITH upd AS (
         UPDATE users SET avatar = 'custom', updated_at = $4 WHERE id = $1
         RETURNING id
       )
       INSERT INTO user_avatars (user_id, content_type, bytes, updated_at)
       SELECT id, $2, $3, $4 FROM upd
       ON CONFLICT (user_id) DO UPDATE SET
         content_type = EXCLUDED.content_type,
         bytes        = EXCLUDED.bytes,
         updated_at   = EXCLUDED.updated_at`,
      [record.userId, record.contentType, Buffer.from(record.bytes), record.updatedAt]
    );
  }

  async getUserAvatar(userId: string): Promise<CustomAvatarRecord | undefined> {
    const result = await this.pool.query<{ content_type: string; bytes: Buffer; updated_at: number | string }>(
      `SELECT content_type, bytes, updated_at FROM user_avatars WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    return {
      userId,
      contentType: row.content_type,
      bytes: new Uint8Array(row.bytes),
      updatedAt: Number(row.updated_at)
    };
  }

  async deleteUserAvatar(userId: string): Promise<void> {
    await this.pool.query(`DELETE FROM user_avatars WHERE user_id = $1`, [userId]);
  }

  async recordUserMatchOutcome(
    matchId: string,
    userId: string,
    outcome: MatchOutcome,
    now: number
  ): Promise<boolean> {
    // Atomiski VIENĀ statement: ledger insert (ON CONFLICT DO NOTHING) → ja jauns,
    // inkrementē user_stats. `rowCount > 0` nozīmē, ka iznākums tika tikko ierakstīts.
    const winInc = outcome === "win" ? 1 : 0;
    const loseInc = outcome === "lose" ? 1 : 0;
    const result = await this.pool.query(
      `WITH ins AS (
         INSERT INTO match_user_outcomes (match_id, user_id, outcome, recorded_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (match_id, user_id) DO NOTHING
         RETURNING user_id
       )
       INSERT INTO user_stats (user_id, games_played, wins, losses, updated_at)
       SELECT $2, 1, $5, $6, $4 FROM ins
       ON CONFLICT (user_id) DO UPDATE SET
         games_played = user_stats.games_played + 1,
         wins         = user_stats.wins + $5,
         losses       = user_stats.losses + $6,
         updated_at   = $4`,
      [matchId, userId, outcome, now, winInc, loseInc]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getUserStats(userId: string): Promise<UserStatsRecord | undefined> {
    const result = await this.pool.query<UserStatsRow>(
      `SELECT user_id, games_played, wins, losses, updated_at
         FROM user_stats WHERE user_id = $1`,
      [userId]
    );
    const row = result.rows[0];
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

  async getLeaderboard(limit: number, minGames: number): Promise<readonly LeaderboardEntryRecord[]> {
    // CTE: win_rate kā double precision PIRMS ranžēšanas (nedrīkst aliasu ORDER BY
    // iekšā ROW_NUMBER). LEFT JOIN preferences + COALESCE → bez backfill veciem kontiem.
    const result = await this.pool.query<LeaderboardRow>(
      `${PG_LEADERBOARD_CTE}
       SELECT ${LEADERBOARD_RANK_EXPR} AS leaderboard_rank, ${LEADERBOARD_COLUMNS}
       FROM eligible
       ORDER BY leaderboard_rank
       LIMIT $2`,
      [minGames, limit]
    );
    return result.rows.map(rowToLeaderboardEntry);
  }

  async getUserRank(userId: string, minGames: number): Promise<LeaderboardEntryRecord | null> {
    // Ranžē VISU kvalificēto kopu (globālā vieta), tikai pēc tam filtrē lietotāju.
    const result = await this.pool.query<LeaderboardRow>(
      `${PG_LEADERBOARD_CTE},
       ranked AS (
         SELECT ${LEADERBOARD_RANK_EXPR} AS leaderboard_rank, ${LEADERBOARD_COLUMNS}
         FROM eligible
       )
       SELECT * FROM ranked WHERE user_id = $2`,
      [minGames, userId]
    );
    const row = result.rows[0];
    return row ? rowToLeaderboardEntry(row) : null;
  }

  async getRankedSnapshot(minGames: number): Promise<readonly RankSnapshotRecord[]> {
    const result = await this.pool.query<{ leaderboard_rank: string; user_id: string }>(
      `${PG_LEADERBOARD_CTE}
       SELECT ${LEADERBOARD_RANK_EXPR} AS leaderboard_rank, user_id
       FROM eligible
       ORDER BY leaderboard_rank`,
      [minGames]
    );
    return result.rows.map((row) => ({ userId: row.user_id, rank: Number(row.leaderboard_rank) }));
  }

  async setUserLanguage(
    userId: string,
    language: AccountLanguage,
    updatedAt: number
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_preferences (user_id, language, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         language   = EXCLUDED.language,
         updated_at = EXCLUDED.updated_at`,
      [userId, language, updatedAt]
    );
  }

  async getUserLanguage(userId: string): Promise<AccountLanguage | undefined> {
    const result = await this.pool.query<{ language: AccountLanguage }>(
      `SELECT language FROM user_preferences WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0]?.language;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

interface MatchRow {
  readonly match_id: string;
  readonly seed: string;
  readonly number_of_rounds: number | string;
  readonly players_json: unknown;
  readonly started_at: number | string;
}

interface MatchSummaryRow extends MatchRow {
  readonly finished_at: number | string | null;
  readonly winner_player_id: string | null;
  readonly event_count: number | string;
}

interface EventRow {
  readonly seq: number | string;
  readonly event_json: unknown;
}

interface PlayerStatsRow {
  readonly player_id: string;
  readonly games_played: number | string;
  readonly games_won: number | string;
  readonly updated_at: number | string;
}

interface ChatRow {
  readonly id: string;
  readonly author_display_id: string;
  readonly text: string;
  readonly server_now: number | string;
}

interface PlayerSessionRow {
  readonly player_id: string;
  readonly reconnect_token: string;
  readonly display_id: string;
  readonly updated_at: number | string;
}

interface RoomLeaseRow {
  readonly room_id: string;
  readonly owner_instance_id: string;
  readonly expires_at: number | string;
  readonly updated_at: number | string;
}

interface FanoutBacklogRow {
  readonly rows: number | string;
  readonly oldest_created_at: number | string;
}

interface TableSizeRow {
  readonly name: string;
  readonly rows: number | string;
  readonly bytes: number | string;
}

function rowToMatchStarted(row: MatchRow): MatchStartedRecord {
  return {
    matchId: row.match_id,
    seed: row.seed,
    numberOfRounds: Number(row.number_of_rounds),
    players: parseJsonValue<MatchStartedRecord["players"]>(row.players_json),
    startedAt: Number(row.started_at)
  };
}

function parseJsonValue<T>(value: unknown): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value as T;
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 1;
  }
  return Math.max(1, Math.min(1000, Math.floor(limit)));
}

function rowToRoomLease(row: RoomLeaseRow | undefined): RoomLeaseRecord | undefined {
  if (!row) {
    return undefined;
  }
  return {
    roomId: row.room_id,
    ownerInstanceId: row.owner_instance_id,
    expiresAt: Number(row.expires_at),
    updatedAt: Number(row.updated_at)
  };
}

function normalizeLeaseTtl(ttlMs: number): number {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("Room lease ttlMs must be a positive finite number.");
  }
  return Math.floor(ttlMs);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "23505"
  );
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
  readonly created_at: number | string;
  readonly updated_at: number | string;
}

interface AuthTokenRow {
  readonly token_hash: string;
  readonly user_id: string;
  readonly created_at: number | string;
  readonly last_used_at: number | string;
  readonly expires_at: number | string;
}

interface UserStatsRow {
  readonly user_id: string;
  readonly games_played: number | string;
  readonly wins: number | string;
  readonly losses: number | string;
  readonly updated_at: number | string;
}

/**
 * Leaderboard ranžēšanas kārtība (tie-break): identiska SQLite pusei (paritāte) —
 * win rate DESC, tad wins, games, username, un kā pēdējais STABILAIS `user_id`.
 */
const LEADERBOARD_ORDER =
  "win_rate DESC, wins DESC, games_played DESC, username ASC, user_id ASC";
const LEADERBOARD_RANK_EXPR = `ROW_NUMBER() OVER (ORDER BY ${LEADERBOARD_ORDER})`;
const LEADERBOARD_COLUMNS =
  "user_id, username, avatar, wins, losses, games_played, win_rate, language, updated_at";
/** `eligible` CTE (PG): win_rate kā double precision; games_played >= $1. */
const PG_LEADERBOARD_CTE = `WITH eligible AS (
  SELECT u.id AS user_id, u.username, u.avatar,
         us.wins, us.losses, us.games_played,
         (us.wins::double precision / us.games_played) AS win_rate,
         COALESCE(p.language, 'en') AS language,
         us.updated_at
  FROM user_stats us
  JOIN users u ON u.id = us.user_id
  LEFT JOIN user_preferences p ON p.user_id = u.id
  WHERE us.games_played >= $1
)`;

interface LeaderboardRow {
  readonly leaderboard_rank: number | string;
  readonly user_id: string;
  readonly username: string;
  readonly avatar: string;
  readonly wins: number | string;
  readonly losses: number | string;
  readonly games_played: number | string;
  readonly win_rate: number | string;
  readonly language: AccountLanguage;
  readonly updated_at: number | string;
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
