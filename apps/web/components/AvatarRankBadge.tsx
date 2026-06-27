import type { RankBadgeId } from "@domino-poker/shared";

import { badgeAssetPath } from "../lib/leaderboard/badgeAsset";

/**
 * Globālā ranga badge emblēma uz profila bildes (Leaderboard fāze). Atkārtoti
 * lietojams DEKORATĪVS pārklājums (top vietām 1–30): absolūti pozicionēts avatara
 * augšējā labajā stūrī, pārplūst ārpus apļa. Izmērs ir PROPORCIONĀLS (% no ietinēja
 * = avatara izmēra), tāpēc waiting-room mazais aplis automātiski dod kompaktu badge.
 * `pointer-events:none` — neietekmē klikšķus uz profila/sēdvietas.
 *
 * Vecāks JĀBŪT `position:relative` un NEAPGRIEZTS (badge pārplūst ārpus apļa).
 * Renderē `null`, ja nav badge (`undefined`/`null` — anonīms, bots vai rangs 31+).
 * `badge` jau ir atrisinātais `RankBadgeId` (no `rankToBadge` vai servera `seat.rankBadge`).
 */
export function AvatarRankBadge({ badge }: { readonly badge: RankBadgeId | null | undefined }) {
  if (!badge) {
    return null;
  }
  return (
    <img className="avatarRankBadge" src={badgeAssetPath(badge)} alt="" aria-hidden="true" />
  );
}
