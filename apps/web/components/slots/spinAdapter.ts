import type {
  Grid,
  GridCell,
  LineBet,
  LineOutcome,
  OutcomeCategory,
  SpinResult,
  SymbolId
} from "@domino-poker/core/slots";

import type { SlotSpinView } from "../../lib/slots/slotsApi";

/**
 * Servera atbilde -> renderētāja `SpinResult`.
 *
 * Divi iemesli, kāpēc šis slānis eksistē:
 *   1. Nauda kodolā ir `bigint` (veselas monētas, bez peldošā punkta kļūdām), bet
 *      `bigint` neizdzīvo JSON, tāpēc serveris to sūta kā `number`.
 *   2. Renderētājs tika rakstīts pret `SpinResult`; adapteris ļauj to atstāt neskartu,
 *      nevis izplatīt servera DTO pa 2 000 rindām Pixi koda.
 *
 * Iznākums NETIEK pārrēķināts — serveris jau ir izlēmis, un klients tikai animē.
 */
export function toSpinResult(view: SlotSpinView): SpinResult {
  const grid = view.grid.map((row) =>
    row.map(
      (cell): GridCell => ({
        symbol: cell.symbol as SymbolId,
        fromFullWildColumn: cell.fromFullWildColumn
      })
    )
  ) as unknown as Grid;

  const lines = view.lines.map(
    (line): LineOutcome => ({
      lineIndex: line.lineIndex,
      category: line.category as OutcomeCategory | null,
      startColumn: line.startColumn as LineOutcome["startColumn"],
      length: line.length as LineOutcome["length"],
      targetSymbol: line.targetSymbol as SymbolId | null,
      multiplierHundredths: line.multiplierHundredths,
      winCoins: BigInt(line.winCoins)
    })
  );

  return {
    spinId: view.spinId,
    // Servera versija, ne hardkodēta: ja serveris kādreiz atdotu citu math versiju,
    // klusa aizstāšana ar "v3" noslēptu tieši to nesakritību, ko gribam pamanīt.
    mathVersion: view.mathVersion as SpinResult["mathVersion"],
    lineBet: view.lineBet as LineBet,
    totalBet: BigInt(view.totalBet),
    grid,
    lines,
    jackpotCount: view.jackpotCount,
    scatterWin: BigInt(view.scatterWin),
    // Servera IZMAKSĀTĀ summa, nevis pārrēķins no līnijām: pārrēķins varētu atšķirties
    // no tā, kas tiešām tika ieskaitīts, un HUD rādītu citu skaitli nekā bilance.
    totalWin: BigInt(view.payout),
    status: "SETTLED"
  };
}
