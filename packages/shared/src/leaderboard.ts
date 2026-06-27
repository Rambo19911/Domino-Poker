/**
 * Globālā Leaderboard publiskais protokols + domēna kartēšana (Leaderboard fāze).
 *
 * Šis modulis ir AUTORITATĪVAIS avots rangu→badge kartēšanai (`rankToBadge`) un
 * leaderboard transporta DTO. Tas ir tīrs (bez I/O, bez framework) — gan serveris
 * (būvē atbildi), gan klients (renderē + atvasina badge no ranga) lieto šo pašu
 * loģiku, lai nebūtu dublēšanas/drifta.
 *
 * Privātums: publiskie DTO satur tikai displeja identitāti (username/avatar), NE
 * iekšējo konta `userId` (kā `RoomSeatView` bez `playerId`).
 */

/**
 * Atbalstītās spēles valodas — VIENS avots gan tipam, gan izpildlaika validācijai
 * (F3 Zod `z.enum(GAME_LANGUAGES)`). DB rigid `CHECK (language IN ('en','lv'))`
 * (`schema.ts` `user_preferences`, 0006) tika NOŅEMTS migrācijā `0013`, tāpēc
 * valodu turpmāk validē TIKAI šis Zod enum (kā `coin_ledger.reason`, 0010) — jaunu
 * valodu pievieno šeit, bez shēmas migrācijas.
 */
export const GAME_LANGUAGES = [
  "en",
  "lv",
  "et",
  "lt",
  "pl",
  "de",
  "fr",
  "es",
  "sv",
  "no",
  "fi",
  "da",
  "it",
  "nl",
  "cs",
  "uk",
  "ro",
  "pt",
  "sk",
  "hu",
  "be"
] as const;

/** Atbalstītā spēles valoda (protokola vērtība; atvasināta no `GAME_LANGUAGES`). */
export type GameLanguage = (typeof GAME_LANGUAGES)[number];

/**
 * Augstākā rangs (1-bāzēts), kas vēl saņem badge — VIENS patiesības avots limitam.
 * Top {@link RANKED_BADGE_LIMIT} vietām katra saņem SAVU unikālo ikonu (rank icon
 * pack); zem tā badge netiek piešķirts.
 */
export const RANKED_BADGE_LIMIT = 30;

/**
 * Rangam piesaistītā badge identifikators = asset bāzes nosaukums mapē
 * `apps/web/public/assets/Badges/` (viens patiesības avots; web atrisina ceļu ar
 * `badgeAssetPath`). Forma vienmēr `rank_<N>`, kur `1 ≤ N ≤ RANKED_BADGE_LIMIT`
 * (izpildlaika invariants — tikai `rankToBadge` ražo šīs vērtības). NULL = nav badge.
 */
export type RankBadgeId = `rank_${number}`;

/**
 * Globālā ranga (1-bāzēts) → badge 1:1 kartēšana: rangs N → `rank_N` augšējām
 * {@link RANKED_BADGE_LIMIT} vietām (1→`rank_1` ir prestižākais … 30→`rank_30`).
 * Rangs ārpus 1..{@link RANKED_BADGE_LIMIT} (vai nederīgs / <1 / ne-vesels) →
 * `null` (badge netiek piešķirts).
 */
export function rankToBadge(rank: number): RankBadgeId | null {
  if (!Number.isInteger(rank) || rank < 1 || rank > RANKED_BADGE_LIMIT) {
    return null;
  }
  return `rank_${rank}`;
}

/**
 * Viena leaderboard rinda (publiska). `rank` ir 1-bāzēta globālā vieta; klients
 * atvasina badge ar `rankToBadge(rank)` (NE dublēts DTO). `winRate` ir 0..1.
 * Konta `userId`/`email` šeit NEKAD neparādās.
 */
export interface LeaderboardEntry {
  readonly rank: number;
  readonly username: string;
  /** Avatar id no `avatarCatalog` (klients atrisina ceļu/fallback). */
  readonly avatar: string;
  readonly wins: number;
  readonly losses: number;
  readonly gamesPlayed: number;
  /** Uzvaru īpatsvars 0..1 (`wins / gamesPlayed`). */
  readonly winRate: number;
  readonly language: GameLanguage;
}

/**
 * Izsaucēja paša stāvoklis leaderboard atbildē (servera-autoritatīvs, lai klients
 * nesecina ranžēšanas tiesīgumu no auth stāvokļa):
 *  - `anonymous` — nav ielogojies;
 *  - `unranked` — ielogojies, bet `gamesPlayed < minGames` (rāda "vēl nav ranžēts");
 *  - `ranked` — ir globālā vieta (rāda "mana vieta" paneli, ja ārpus top N).
 *
 * `ranked` nes tikai `entry` (rangs ir `entry.rank` — bez dublēšanas). `minGames`
 * slieksnis ir atbildes top-level (`LeaderboardResponse.minGames`), NE šeit.
 */
export type LeaderboardSelf =
  | { readonly status: "anonymous" }
  | { readonly status: "unranked"; readonly gamesPlayed: number }
  | { readonly status: "ranked"; readonly entry: LeaderboardEntry };

/**
 * Leaderboard HTTP atbilde: top N + izsaucēja paša stāvoklis + `minGames` slieksnis
 * (lai klients var rādīt "?" skaidrojumu un "vēl nav ranžēts (vajag N)" jebkuram
 * skatītājam — viens avots, NE dublēts `unranked` zarā).
 */
export interface LeaderboardResponse {
  readonly entries: readonly LeaderboardEntry[];
  readonly me: LeaderboardSelf;
  readonly minGames: number;
}
