/**
 * MP poda lieluma vizualizācija mobilajā galdā: pods → lādes attēls. TIKAI
 * prezentācija (web-only); NAV servera noteikums, tāpēc dzīvo web slānī, nevis
 * `packages/shared/economy.ts`. Tīra funkcija → testējama bez UI.
 *
 * Sliekšņi ir AUGOŠI; izvēlas augstāko slieksni, ko pods sasniedz. Bāze (zem 20k)
 * un griesti (≥50k) sedz visu iespējamo poda diapazonu (maksa: 1..1mljrd).
 */

export type PotChestTier = { readonly min: number; readonly src: string };

/** Lejupejošā secībā pēc `min` (pirmais sakritušais = rezultāts). */
export const POT_CHEST_TIERS: readonly PotChestTier[] = [
  { min: 50_000, src: "/assets/chests/pack05-chest2-64.png" },
  { min: 40_000, src: "/assets/chests/pack05-chest1-64.png" },
  { min: 30_000, src: "/assets/chests/pack04-suitcase2-64.png" },
  { min: 20_000, src: "/assets/chests/pack04-suitcase1-64.png" },
  { min: 0, src: "/assets/chests/pack04-suitcase0-64.png" }
] as const;

/** Bāzes lāde (zem 20k / nederīgs pots) — drošs fallback. */
const BASE_CHEST = "/assets/chests/pack04-suitcase0-64.png";

/** Atgriež lādes attēla ceļu podam (vienmēr derīgs — bāzes līmenis sedz 0..20k). */
export function chestForPot(pot: number): string {
  for (const tier of POT_CHEST_TIERS) {
    if (pot >= tier.min) return tier.src;
  }
  return BASE_CHEST;
}
