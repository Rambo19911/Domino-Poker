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
 * (F3 Zod `z.enum(GAME_LANGUAGES)`). DB `CHECK (language IN ('en','lv'))`
 * (`schema.ts` `user_preferences`) jātur sinhroni ar šo sarakstu.
 */
export const GAME_LANGUAGES = ["en", "lv"] as const;

/** Atbalstītā spēles valoda (protokola vērtība; atvasināta no `GAME_LANGUAGES`). */
export type GameLanguage = (typeof GAME_LANGUAGES)[number];

/**
 * Rangam piesaistītā badge identifikators = asset bāzes nosaukums mapē
 * `apps/web/public/assets/Badges/` (viens patiesības avots; web atrisina ceļu ar
 * `badgeAssetPath`). NULL nav badge (rangs 71+ vai nederīgs rangs).
 */
export type RankBadgeId =
  | "Trophy-11"
  | "Trophy-10"
  | "Trophy-9"
  | "Trophy-8"
  | "Trophy-7"
  | "badge-level-1"
  | "badge-level-2"
  | "badge-level-3"
  | "badge-level-4"
  | "badge-level-5"
  | "badge-level-6";

/**
 * Globālā ranga (1-bāzēts) → badge kartēšana pēc lietotāja specifikācijas:
 * 1→Trophy-11, 2→Trophy-10, 3→Trophy-9, 4–5→Trophy-8, 6–10→Trophy-7,
 * 11–20→badge-level-1 … 61–70→badge-level-6. Rangs 71+ (vai nederīgs / <1 /
 * ne-vesels) → `null` (badge netiek piešķirts).
 */
export function rankToBadge(rank: number): RankBadgeId | null {
  if (!Number.isInteger(rank) || rank < 1) {
    return null;
  }
  if (rank === 1) return "Trophy-11";
  if (rank === 2) return "Trophy-10";
  if (rank === 3) return "Trophy-9";
  if (rank <= 5) return "Trophy-8"; //   4–5
  if (rank <= 10) return "Trophy-7"; //  6–10
  if (rank <= 20) return "badge-level-1"; // 11–20
  if (rank <= 30) return "badge-level-2"; // 21–30
  if (rank <= 40) return "badge-level-3"; // 31–40
  if (rank <= 50) return "badge-level-4"; // 41–50
  if (rank <= 60) return "badge-level-5"; // 51–60
  if (rank <= 70) return "badge-level-6"; // 61–70
  return null; // 71+
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
 * `ranked` nes tikai `entry` (rangs ir `entry.rank` — bez dublēšanas).
 */
export type LeaderboardSelf =
  | { readonly status: "anonymous" }
  | { readonly status: "unranked"; readonly minGames: number; readonly gamesPlayed: number }
  | { readonly status: "ranked"; readonly entry: LeaderboardEntry };

/** Leaderboard HTTP atbilde: top N + izsaucēja paša stāvoklis. */
export interface LeaderboardResponse {
  readonly entries: readonly LeaderboardEntry[];
  readonly me: LeaderboardSelf;
}
