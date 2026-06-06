import type { AppStrings } from "../lib/i18n";
import { MP_MOBILE_POS, centerPoint } from "../lib/mp/mobileLayout";

/**
 * Atlikušo raundu skaitlis mobilajā galdā (SP + MP) — liels skaitlis kreisajā ailē,
 * vertikāli vienā līmenī ar kopsavilkuma tabulu. Sarūk, kad sākas nākamais raunds
 * (vienlaikus ar kauliņu izdalīšanu, jo izriet no `currentRound`).
 *
 * Krāsa: zelta akcents; viegli sarkana, kad atlikuši ≤50% no raundiem; izteikti
 * sarkana, kad atlikuši ≤20%.
 */
export function MobileRoundCount({
  labels: t,
  currentRound,
  totalRounds
}: {
  readonly labels: AppStrings;
  readonly currentRound: number;
  readonly totalRounds: number;
}) {
  // Lielais skaitlis = atlikušie raundi, ieskaitot tekošo: raunds 1/7 → 7, 7/7 → 1.
  const remaining = Math.max(0, totalRounds - currentRound + 1);
  // Krāsa pēc spēles PROGRESA (tekošais raunds skaitās "aizvadīts"): ≥50% izspēlēts
  // → viegli sarkans; ≥80% izspēlēts (atlikuši ≤20%) → izteikti sarkans.
  // Piem. 3 raundiem: r1 zelts, r2 viegli sarkans (67%), r3 izteikti sarkans (100%).
  const progress = totalRounds > 0 ? currentRound / totalRounds : 0;
  const state = progress >= 0.8 ? "danger" : progress >= 0.5 ? "warn" : "";

  return (
    <div
      className={`mpmRoundCount ${state}`}
      style={centerPoint(MP_MOBILE_POS.roundCount)}
      aria-label={`${t.roundLabel} ${currentRound}/${totalRounds}`}
    >
      {remaining}
    </div>
  );
}
