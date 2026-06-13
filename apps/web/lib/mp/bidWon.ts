export type BidWonState = "" | "matched" | "over";

/**
 * Stiķu (bid/won) krāsas stāvoklis mobilajā skatā — viens avots sēdvietas badge un
 * augšējās summary tabulas krāsošanai (MP + SP):
 *   - "matched" (zaļš): paņemts TIEŠI tik, cik solīts (won === bid);
 *   - "over" (sarkans): pārņemts (won > bid);
 *   - "" (neitrāls): vēl nav solīts (bid < 0) vai paņemts mazāk par solīto.
 */
export function bidWonColor(bid: number, tricksWon: number): BidWonState {
  if (bid < 0) return "";
  if (tricksWon === bid) return "matched";
  if (tricksWon > bid) return "over";
  return "";
}
