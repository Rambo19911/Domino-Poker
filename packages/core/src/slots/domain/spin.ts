import type { Coins } from "./money";
import type { Grid, LineBet, LineOutcome } from "./outcomes";

export interface SpinResult {
  readonly spinId: string;
  readonly mathVersion: "domino-slots-math-v3";
  readonly lineBet: LineBet;
  readonly totalBet: Coins;
  readonly grid: Grid;
  /** One outcome per payline, in PAYLINES order. */
  readonly lines: readonly LineOutcome[];
  readonly jackpotCount: number;
  readonly scatterWin: Coins;
  readonly totalWin: Coins;
  readonly status: "CREATED" | "SETTLED";
}
