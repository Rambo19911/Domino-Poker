import { PAYLINES, SLOT_MATH_CONFIG } from "../config/gameConfig";
import type { Coins } from "../domain/money";
import type { Grid, LineBet, LineOutcome } from "../domain/outcomes";
import { evaluateLine, type Line } from "./lineEvaluator";
import { countJackpots, evaluateScatter } from "./scatterEvaluator";

export interface SpinEvaluation {
  readonly grid: Grid;
  readonly lineBet: LineBet;
  readonly totalBet: Coins;
  readonly lines: readonly LineOutcome[];
  readonly jackpotCount: number;
  readonly scatterWin: Coins;
  readonly totalWin: Coins;
}

/** Cells a payline crosses: one per column, rows from its pattern. */
export function lineOfPattern(grid: Grid, lineIndex: number): Line {
  const pattern = PAYLINES[lineIndex];
  if (pattern === undefined) throw new Error(`Unknown payline index: ${lineIndex}`);
  return [
    grid[pattern[0] as 0 | 1 | 2][0].symbol,
    grid[pattern[1] as 0 | 1 | 2][1].symbol,
    grid[pattern[2] as 0 | 1 | 2][2].symbol,
    grid[pattern[3] as 0 | 1 | 2][3].symbol,
    grid[pattern[4] as 0 | 1 | 2][4].symbol
  ] as const;
}

export function evaluateSpin(grid: Grid, lineBet: LineBet): SpinEvaluation {
  const totalBet = BigInt(lineBet) * BigInt(SLOT_MATH_CONFIG.activeLines);
  const lines = PAYLINES.map((_, lineIndex) =>
    evaluateLine(lineOfPattern(grid, lineIndex), lineIndex, lineBet)
  );
  const jackpotCount = countJackpots(grid);
  const scatterWin = evaluateScatter(jackpotCount, totalBet);
  const totalWin = lines.reduce((sum, line) => sum + line.winCoins, scatterWin);
  return { grid, lineBet, totalBet, lines, jackpotCount, scatterWin, totalWin };
}
