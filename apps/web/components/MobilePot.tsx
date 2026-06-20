import type { AppStrings } from "../lib/i18n";
import { MP_MOBILE_POS, centerPoint } from "../lib/mp/mobileLayout";
import { CoinIcon } from "./CoinIcon";

/**
 * Zelta monētu pods mobilajā MP galdā (Fāze 4) — labajā ailē, simetriski pretī
 * raundu skaitlim, vienā līmenī ar kopsavilkuma tabulu. Rāda TIKAI maksas istabās
 * (`pot > 0`). Krāsa token-only (`--coin`). `key={pot}` retrigger `potBump`, ja pods
 * mainās (spēlē tas ir iesaldēts; animācija paredzēta vispārējai poda atjaunināšanai).
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
      <CoinIcon className="mpmPotIcon" />
      <span className="mpmPotValue" key={pot}>
        {pot}
      </span>
    </div>
  );
}
