/**
 * MP sasniegumu tituli (Fāze 4). Tituls ir **atvasināms no statistikas** (uzvaru
 * skaita), bez atsevišķas tabulas. Publiskais tituls = augstākais sasniegtais
 * līmenis. `Lūzers` ir ATSEVIŠĶS badge (ne win-tier vietā), atvasināts no uzvaru %.
 *
 * Helperis atgriež stabilu `TitleId` (atslēgu); lokalizēto nosaukumu izvēlas klients
 * (sk. `apps/web/lib/locales`), tāpēc šeit NAV teksta — tikai sliekšņi un id.
 */

export type TitleId =
  | "mushroom"
  | "student"
  | "amateur"
  | "strategist"
  | "champion"
  | "king"
  | "universeGod";

/** Titulu kāpnes: minimālais uzvaru skaits katram līmenim (augošā secībā). */
export const TITLE_TIERS: readonly { readonly id: TitleId; readonly minWins: number }[] = [
  { id: "mushroom", minWins: 0 },
  { id: "student", minWins: 1 },
  { id: "amateur", minWins: 10 },
  { id: "strategist", minWins: 25 },
  { id: "champion", minWins: 50 },
  { id: "king", minWins: 100 },
  { id: "universeGod", minWins: 250 }
];

/** Lūzers slieksnis: vismaz tik spēļu un zem uzvaru% (sk. `isLoser`). */
export const LOSER_MIN_GAMES = 20;
export const LOSER_MAX_WIN_RATE = 25;

/** Uzvaru % = wins / games × 100 (noapaļots); 0, ja vēl nav spēļu. */
export function winRatePercent(wins: number, losses: number): number {
  const games = wins + losses;
  if (games <= 0) return 0;
  return Math.round((wins / games) * 100);
}

/** Publiskais tituls (augstākais sasniegtais līmenis) pēc uzvaru skaita. */
export function titleForWins(wins: number): TitleId {
  let result: TitleId = "mushroom";
  for (const tier of TITLE_TIERS) {
    if (wins >= tier.minWins) {
      result = tier.id;
    }
  }
  return result;
}

/** Vai pienākas `Lūzers` badge: ≥ `LOSER_MIN_GAMES` spēles un uzvaru% < `LOSER_MAX_WIN_RATE`. */
export function isLoser(wins: number, losses: number): boolean {
  const games = wins + losses;
  return games >= LOSER_MIN_GAMES && winRatePercent(wins, losses) < LOSER_MAX_WIN_RATE;
}
