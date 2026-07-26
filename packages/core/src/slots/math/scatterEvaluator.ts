import { scatterPayHundredths } from "../config/paytable";
import type { Coins } from "../domain/money";
import { multiplyByHundredths } from "../domain/money";
import type { Grid } from "../domain/outcomes";

/** Jackpot scatters anywhere in the 3x5 grid; Wild is never counted. */
export function countJackpots(grid: Grid): number {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell.symbol === "JACKPOT") count += 1;
    }
  }
  return count;
}

export function evaluateScatter(jackpotCount: number, totalBet: Coins): Coins {
  return multiplyByHundredths(totalBet, scatterPayHundredths(jackpotCount));
}
