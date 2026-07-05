/**
 * Padziļinātās spēlētāja statistikas glabātuves saskarne (sk.
 * `docs/TODO/player-stats-plan.md`). Atsevišķa "spēja" — kā `AuthStore`/`CoinStore` —
 * ko implementē GAN `SqliteStorage` (lokāli), GAN `PostgresStorage` (prod).
 *
 * Modelis: VIENA `player_game_results` tabula ar `mode` diskriminatoru un per-spēli
 * rindām. Idempotence pēc `id`:
 *   - SP = `sp:{gameToken}`   (viens tokens = viena spēle = viena rinda),
 *   - MP = `mp:{matchId}:{userId}`.
 * Agregātus aprēķina UZ LASĪŠANAS (GROUP BY); `PlayerStatsService` (ārpus storage)
 * tos komponē UI formā. Reģistrētiem lietotājiem; rezultāti nedzen ne balvas, ne
 * leaderboard — tāpēc SP klienta-ziņotie skaitļi ir pieņemami (sk. plānu).
 */

import type { SpVariant } from "@domino-poker/shared";

/** Spēles režīms: single-player vai multiplayer. */
export type GameMode = "sp" | "mp";

/** SP botu grūtība (tikai SP; MP rindām `difficulty` ir `undefined`/NULL). */
export type GameDifficulty = "medium" | "hard" | "epic";

/** Viena pabeigta spēle, attiecināta uz reģistrētu lietotāju. */
export interface GameResultRecord {
  /** Idempotences atslēga: `sp:{gameToken}` vai `mp:{matchId}:{userId}`. */
  readonly id: string;
  readonly userId: string;
  readonly mode: GameMode;
  /** Tikai SP (medium|hard|epic); MP = `undefined`. */
  readonly difficulty?: GameDifficulty | undefined;
  /** Gala vieta 1..4. */
  readonly placement: number;
  /** Nospēlēto raundu skaits (> 0). */
  readonly roundCount: number;
  /** Raundi, kuros solījums izpildīts PRECĪZI (won == bid). */
  readonly bidMet: number;
  /** Raundi, kuros PĀRSNIEGTS (won > bid) → "nepasolīšana" (pārlieku piesardzīgs). */
  readonly bidExceeded: number;
  /** Raundi, kuros NEIZPILDĪTS (won < bid) → "pārsolīšana" (pārlieku agresīvs). */
  readonly bidMissed: number;
  /** Servera laiks (ms), kad spēle pabeigta. */
  readonly completedAt: number;
  /**
   * Spēles ilgums ms (`now - token.issuedAt`, tikai SP; MP = `undefined`/NULL). Lieto
   * dienas uzdevumu anti-abuse skaitīšanā (`countSpWinsSince` min-ilguma vārti). Vecām
   * rindām (pirms migrācijas `0014`) NULL. Idempotentā INSERT dublikātā NEatjaunina.
   */
  readonly durationMs?: number | undefined;
  /**
   * SP spēles variants (`weekly_bosses` = nedēļas speciālā istaba; `undefined`/NULL = parasta
   * standard istaba). Tikai SP; MP = `undefined`. Nāk no `/sp/start` tokena (servera-autoritatīvs).
   * Lieto nedēļas uzdevumu 3/4 skaitīšanā (`countSpTaskWins` variant vārti). Vecām rindām (pirms
   * migrācijas `0015`) NULL. Idempotentā INSERT dublikātā NEatjaunina.
   */
  readonly variant?: SpVariant | undefined;
}

/**
 * Agregāta rinda: grupēta pēc `(mode, difficulty, placement)`. `games` = spēļu skaits
 * grupā; `bid*` = solījumu-precizitātes raundu SUMMAS šajā grupā. `PlayerStatsService`
 * no šīm rindām būvē placement-sadali un bid-accuracy kopsummas.
 */
export interface GameStatsAggregateRow {
  readonly mode: GameMode;
  readonly difficulty: GameDifficulty | null;
  readonly placement: number;
  readonly games: number;
  readonly bidMet: number;
  readonly bidExceeded: number;
  readonly bidMissed: number;
}

export interface PlayerStatsStore {
  /**
   * Reģistrē vienu pabeigtu spēli. Idempotents pēc `id` (`INSERT ... ON CONFLICT(id)
   * DO NOTHING`): atgriež `true`, ja rinda tikko ievietota; `false`, ja jau bija
   * (dublikāts/replay). Met kļūdu, ja ieraksts pārkāpj invariantus
   * (sk. `assertValidGameResult`) — tas ir DB-agnostisks sargs PIRMS DDL `CHECK`,
   * lai abi backendi noraida vienādi.
   */
  recordGameResult(record: GameResultRecord): Promise<boolean>;

  /**
   * Lietotāja statistikas agregāts (grupēts pēc mode/difficulty/placement). Tukšs
   * masīvs, ja vēl nav nevienas spēles.
   */
  getPlayerGameStats(userId: string): Promise<readonly GameStatsAggregateRow[]>;

  /**
   * Ieraksta īpašnieka `userId` pēc `id`, vai `undefined`, ja nav. Lieto `/sp/complete`
   * replay-noteikšanai: ja tokens jau patērēts, bet rinda eksistē → stabils success
   * (NE 409). Atgriež tikai `userId` (īpašumtiesību pārbaudei), ne pilnu rindu.
   */
  getGameResultOwner(id: string): Promise<string | undefined>;

  /**
   * Dienas uzdevumu progress: skaita SP UZVARAS (placement ≤ 2) dotajā grūtībā laika
   * logā `[sinceMs, untilMs)` ar `duration_ms >= minDurationMs` (anti-abuse; NULL/legacy
   * rindas izslēgtas — tas GAN gate momentānus skriptus, GAN dod "skaita no palaišanas")
   * UN ar `round_count >= minRounds` (N-raundu uzdevuma vārti; raundu skaits ir servera-
   * autoritatīvs no /sp/start tokena). Atvasināts (nav skaitītāja tabulas). Identisks
   * SQLite + PostgreSQL (kontrakta tests).
   */
  countSpWinsSince(
    userId: string,
    difficulty: GameDifficulty,
    sinceMs: number,
    untilMs: number,
    minDurationMs: number,
    minRounds: number
  ): Promise<number>;

  /**
   * Nedēļas uzdevums 1: skaita PABEIGTAS MP spēles (jebkura vieta = `GAME_OVER`-sasniegta rinda)
   * laika logā `[sinceMs, untilMs)`. Atvasināts no `mode='mp'` rindām. Bez min-ilguma/raundu
   * vārtiem (īpašnieka lēmums — maza balva). Identisks SQLite + PostgreSQL (kontrakta tests).
   */
  countMpFinishedSince(userId: string, sinceMs: number, untilMs: number): Promise<number>;

  /**
   * Nedēļas uzdevumi 2/3/4: skaita SP UZVARAS (`placement <= placementMax`) dotajā grūtībā ar
   * TIEŠU raundu skaitu (`round_count == exactRounds`) laika logā `[sinceMs, untilMs)` ar
   * `duration_ms >= minDurationMs` (anti-abuse; NULL/legacy izslēgtas). `variant` filtrs:
   * `null` = tikai standard istaba (`variant IS NULL`); `"weekly_bosses"` = tikai speciālā istaba
   * (`variant = 'weekly_bosses'`). Atvasināts. Identisks SQLite + PostgreSQL (kontrakta tests).
   */
  countSpTaskWins(
    userId: string,
    difficulty: GameDifficulty,
    variant: SpVariant | null,
    exactRounds: number,
    sinceMs: number,
    untilMs: number,
    minDurationMs: number,
    placementMax: number
  ): Promise<number>;
}

/** Runtime pārbaude, vai glabātuve atbalsta statistiku (abas to dara; sargs `index.ts`). */
export function isPlayerStatsStore(value: unknown): value is PlayerStatsStore {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PlayerStatsStore).recordGameResult === "function" &&
    typeof (value as PlayerStatsStore).getPlayerGameStats === "function" &&
    typeof (value as PlayerStatsStore).getGameResultOwner === "function" &&
    typeof (value as PlayerStatsStore).countSpWinsSince === "function" &&
    typeof (value as PlayerStatsStore).countMpFinishedSince === "function" &&
    typeof (value as PlayerStatsStore).countSpTaskWins === "function"
  );
}

const GAME_MODES: ReadonlySet<string> = new Set<GameMode>(["sp", "mp"]);
const GAME_DIFFICULTIES: ReadonlySet<string> = new Set<GameDifficulty>([
  "medium",
  "hard",
  "epic"
]);
const SP_VARIANTS: ReadonlySet<string> = new Set<SpVariant>(["weekly_bosses"]);

function assertNonNegativeInt(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`player_game_results: ${label} must be a non-negative integer (got ${value})`);
  }
}

/**
 * DB-agnostiska ieraksta validācija. Met kļūdu pirms jebkura DB ieraksta, lai SQLite
 * un PostgreSQL noraida nederīgus ierakstus IDENTISKI (DDL `CHECK` paliek kā otrā
 * aizsardzības līnija). Atspoguļo tabulas `CHECK` ierobežojumus.
 */
export function assertValidGameResult(record: GameResultRecord): void {
  if (!GAME_MODES.has(record.mode)) {
    throw new Error(`player_game_results: invalid mode (got ${record.mode})`);
  }
  if (!Number.isInteger(record.placement) || record.placement < 1 || record.placement > 4) {
    throw new Error(`player_game_results: placement must be 1..4 (got ${record.placement})`);
  }
  if (!Number.isInteger(record.roundCount) || record.roundCount <= 0) {
    throw new Error(`player_game_results: roundCount must be > 0 (got ${record.roundCount})`);
  }
  assertNonNegativeInt("bidMet", record.bidMet);
  assertNonNegativeInt("bidExceeded", record.bidExceeded);
  assertNonNegativeInt("bidMissed", record.bidMissed);
  if (record.bidMet + record.bidExceeded + record.bidMissed !== record.roundCount) {
    throw new Error(
      `player_game_results: bid counts (${record.bidMet}+${record.bidExceeded}+${record.bidMissed}) must equal roundCount (${record.roundCount})`
    );
  }
  if (record.mode === "sp") {
    if (record.difficulty === undefined || !GAME_DIFFICULTIES.has(record.difficulty)) {
      throw new Error(`player_game_results: sp result requires a valid difficulty (got ${record.difficulty ?? "undefined"})`);
    }
  } else if (record.difficulty !== undefined) {
    throw new Error(`player_game_results: mp result must not have a difficulty (got ${record.difficulty})`);
  }
  // `variant` ir opcionāls (standard/legacy = undefined→NULL). Tikai SP drīkst nest variantu, un tam
  // jābūt derīgam `SpVariant`. MP nekad nav speciālā istaba → variant jābūt undefined.
  if (record.variant !== undefined) {
    if (record.mode !== "sp") {
      throw new Error(`player_game_results: mp result must not have a variant (got ${record.variant})`);
    }
    if (!SP_VARIANTS.has(record.variant)) {
      throw new Error(`player_game_results: invalid sp variant (got ${record.variant})`);
    }
  }
  // `durationMs` ir opcionāls (MP/legacy = undefined→NULL); ja dots, ne-negatīvs vesels
  // skaitlis (aizsargā pret NaN/frakcionālu/negatīvu ilgumu; SQLite/PG noraida identiski).
  if (record.durationMs !== undefined) {
    assertNonNegativeInt("durationMs", record.durationMs);
  }
}
