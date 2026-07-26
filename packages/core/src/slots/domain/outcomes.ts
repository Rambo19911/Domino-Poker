import type { Coins } from "./money";
import type { SymbolId } from "./symbols";

export type RowIndex = 0 | 1 | 2;
export type ColumnIndex = 0 | 1 | 2 | 3 | 4;

/**
 * Allowed line bets. Scaled 5x down from the standalone game's 100..1000 so the
 * total bet (11 x lineBet = 220..2200) fits the DominoPoker coin economy, where
 * a new account starts with 5000 coins. Every step must stay a multiple of 20 —
 * see paytable.ts validateBetSteps for the derivation.
 */
export type LineBet = 20 | 40 | 60 | 100 | 200;

export type OutcomeCategory =
  | "ALL_WILD"
  | "EXACT"
  | "TRUMP_COMBO"
  | "ACE_COMBO"
  | "HIGH_REGULAR_COMBO"
  | "MID_REGULAR_COMBO"
  | "LOW_REGULAR_COMBO";

export interface GridCell {
  readonly symbol: SymbolId;
  readonly fromFullWildColumn: boolean;
}

export type GridRow = readonly [GridCell, GridCell, GridCell, GridCell, GridCell];
export type Grid = readonly [GridRow, GridRow, GridRow];

export interface LineOutcome {
  /** Index into PAYLINES (0..activeLines-1). */
  readonly lineIndex: number;
  readonly category: OutcomeCategory | null;
  /** Column where the winning run starts (math v3: runs float on the line). */
  readonly startColumn: ColumnIndex;
  readonly length: 0 | 3 | 4 | 5;
  readonly targetSymbol: SymbolId | null;
  /** Boosted multiplier: base x (100 + major boosts) / 100, in hundredths. */
  readonly multiplierHundredths: number;
  readonly winCoins: Coins;
}
