import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { MultiplayerEvent } from "@domino-poker/core/multiplayer";
import type { ChatMessage } from "@domino-poker/shared";

import type {
  MatchEventRecord,
  MatchFinishedRecord,
  MatchStartedRecord,
  MatchSummaryRecord,
  PlayerStatsIncrementRecord,
  PlayerStatsRecord,
  StoragePort,
  UnfinishedMatch
} from "./StoragePort.js";

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
export class SqliteStorage implements StoragePort {
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

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        match_id         TEXT PRIMARY KEY,
        seed             TEXT NOT NULL,
        number_of_rounds INTEGER NOT NULL,
        players_json     TEXT NOT NULL,
        started_at       INTEGER NOT NULL,
        finished_at      INTEGER,
        winner_player_id TEXT
      );

      CREATE TABLE IF NOT EXISTS match_events (
        match_id   TEXT NOT NULL,
        seq        INTEGER NOT NULL,
        event_json TEXT NOT NULL,
        PRIMARY KEY (match_id, seq)
      );

      CREATE TABLE IF NOT EXISTS player_stats (
        player_id     TEXT PRIMARY KEY,
        games_played  INTEGER NOT NULL,
        games_won     INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id                TEXT PRIMARY KEY,
        author_display_id TEXT NOT NULL,
        text              TEXT NOT NULL,
        server_now        INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_matches_started_at ON matches (started_at);
    `);
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
