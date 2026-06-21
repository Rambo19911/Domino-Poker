import type { AppStrings } from "../../lib/i18n";
import { CoinGif } from "../CoinGif";

/**
 * Maksas istabas nozīme istabu sarakstā (Fāze 4): monētas ikona + dalības maksa.
 * Renderē TIKAI, ja `entryFee > 0` (bezmaksas istabas paliek nemainīgas). Krāsa
 * token-only (`--coin`). Lietots gan web-view, gan mobile-view sarakstos.
 */
export function RoomFeeChip({
  entryFee,
  labels: t,
  className
}: {
  readonly entryFee: number;
  readonly labels: AppStrings;
  readonly className?: string;
}) {
  if (entryFee <= 0) return null;
  return (
    <span
      className={`mpRoomFee${className ? ` ${className}` : ""}`}
      aria-label={`${t.mpEntryFee}: ${entryFee}`}
    >
      <CoinGif className="mpRoomFeeIcon" />
      {entryFee}
    </span>
  );
}
