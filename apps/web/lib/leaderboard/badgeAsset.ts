import type { RankBadgeId } from "@domino-poker/shared";

/**
 * Atrisina rangu badge id → publiskā asset ceļš (web atbildība; rangu→id kartēšana
 * `rankToBadge` paliek shared domēnā). Faili: `apps/web/public/assets/Badges/<id>.svg`.
 * Lieto gan Leaderboard dialoga BADGE kolonna, gan (F6) `AvatarRankBadge` pārklājums.
 */
export function badgeAssetPath(id: RankBadgeId): string {
  return `/assets/Badges/${id}.svg`;
}
