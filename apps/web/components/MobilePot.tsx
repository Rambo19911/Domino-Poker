import type { AppStrings } from "../lib/i18n";
import { chestForPot } from "../lib/mp/potChest";
import { MP_MOBILE_POS, centerPoint } from "../lib/mp/mobileLayout";

/**
 * Zelta monētu pods mobilajā MP galdā — labajā ailē, simetriski pretī raundu
 * skaitlim, vienā līmenī ar kopsavilkuma tabulu. Rāda TIKAI maksas istabās
 * (`pot > 0`). Lādes attēls mainās pēc poda lieluma (`chestForPot`), izkārtojums
 * vertikāls: lāde augšā, summa apakšā. Aizņem līdzīgu laukumu kā raundu skaitlis,
 * lai pods būtu labi saskatāms (agrāk mazā ikona bija gandrīz neredzama).
 * `key={pot}` retrigger `potBump`, kad pods mainās.
 */
export function MobilePot({
  labels: t,
  pot
}: {
  readonly labels: AppStrings;
  readonly pot: number;
}) {
  if (pot <= 0) return null;
  return (
    <div
      className="mpmPot"
      style={centerPoint(MP_MOBILE_POS.pot)}
      aria-label={`${t.mpPotLabel}: ${pot}`}
    >
      <img className="mpmPotChest" src={chestForPot(pot)} alt="" aria-hidden="true" draggable={false} />
      <span className="mpmPotValue" key={pot}>
        {pot.toLocaleString()}
      </span>
    </div>
  );
}
