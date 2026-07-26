import { PAYLINES } from '@domino-poker/core/slots';
import type { Coins } from '@domino-poker/core/slots';
import type { ColumnIndex, RowIndex } from '@domino-poker/core/slots';
import type { SpinResult } from '@domino-poker/core/slots';

/**
 * Pure win-presentation planning (UI/UX sections 9.4 and 12). No PixiJS
 * imports so the sequencing rules stay unit-testable in Node.
 */

export interface LineHighlight {
  /** Index into PAYLINES. */
  readonly lineIndex: number;
  /** Column where the winning run starts (math v3: runs float). */
  readonly startColumn: ColumnIndex;
  /** Winning run length; the gold line covers exactly these cells. */
  readonly length: 3 | 4 | 5;
}

export interface RunCell {
  readonly row: RowIndex;
  readonly column: ColumnIndex;
}

/** The cells of a winning run, one per covered column, from PAYLINES. */
export function runCells(highlight: LineHighlight): readonly RunCell[] {
  const pattern = PAYLINES[highlight.lineIndex];
  if (pattern === undefined) throw new Error(`Unknown payline index: ${highlight.lineIndex}`);
  const cells: RunCell[] = [];
  for (let c = highlight.startColumn; c < highlight.startColumn + highlight.length; c++) {
    cells.push({ row: pattern[c] as RowIndex, column: c as ColumnIndex });
  }
  return cells;
}

export interface ScatterCell {
  readonly row: RowIndex;
  readonly column: ColumnIndex;
}

export type PresentationPhase =
  | { readonly kind: 'idle-pause'; readonly durationMs: number }
  | {
      readonly kind: 'scatter';
      readonly cells: readonly ScatterCell[];
      readonly amount: Coins;
      readonly durationMs: number;
    }
  | {
      readonly kind: 'line';
      readonly line: LineHighlight;
      readonly durationMs: number;
      /** Outer glow only when the total win reaches the total bet (UI/UX 9.4). */
      readonly glow: boolean;
    }
  | {
      readonly kind: 'all-lines';
      readonly lines: readonly LineHighlight[];
      readonly durationMs: number;
      readonly glow: boolean;
    }
  | {
      readonly kind: 'panel';
      readonly panel: 'huge' | 'mega';
      readonly amount: Coins;
      readonly durationMs: number;
    };

export const PRESENTATION_TIMINGS = {
  /** Zero win: back to IDLE 250 ms after the last reel stop (UI/UX 9.4). */
  zeroWinPauseMs: 250,
  /** Each winning line alone, top to bottom (UI/UX 12.2). */
  singleLineMs: 500,
  /** All winning lines together (UI/UX 12.2). */
  allLinesMs: 700,
  /** HUGE WIN overlay at >= 10x total bet (UI/UX 9.4). */
  hugeWinPanelMs: 1200,
  /** MEGA WIN overlay at >= 100x total bet (UI/UX 9.4). */
  megaWinPanelMs: 1800,
  /** JACKPOT scatter phase incl. its panel (UI/UX 12.3). */
  scatterMs: 1800,
} as const;

/**
 * Gold line geometry (UI/UX 12.1, math v3): a polyline through the centres of
 * the winning run's cells, extended half a cell on both ends.
 */
export function winLinePoints(
  highlight: LineHighlight,
): readonly { readonly x: number; readonly y: number }[] {
  const cells = runCells(highlight);
  const centerOf = (cell: RunCell): { x: number; y: number } => ({
    x: 423 + cell.column * 215 + 107.5,
    y: 255 + cell.row * 215 + 107.5,
  });
  const centers = cells.map(centerOf);
  const first = centers[0] as { x: number; y: number };
  const last = centers[centers.length - 1] as { x: number; y: number };
  return [{ x: first.x - 107.5, y: first.y }, ...centers, { x: last.x + 107.5, y: last.y }];
}

/** Jackpot scatter cell positions; Wild never counts (docs/01). */
export function scatterCells(result: SpinResult): readonly ScatterCell[] {
  const cells: ScatterCell[] = [];
  result.grid.forEach((gridRow, row) => {
    gridRow.forEach((cell, column) => {
      if (cell.symbol === 'JACKPOT') {
        cells.push({ row: row as RowIndex, column: column as ColumnIndex });
      }
    });
  });
  return cells;
}

/**
 * Full presentation sequence for one settled result:
 * scatter phase first (12.3), then each winning line top-down, then all lines
 * together (12.2), then the HUGE/MEGA overlay when the total qualifies (9.4;
 * MEGA wins over HUGE).
 */
export function planPresentation(result: SpinResult): readonly PresentationPhase[] {
  if (result.totalWin === 0n) {
    return [{ kind: 'idle-pause', durationMs: PRESENTATION_TIMINGS.zeroWinPauseMs }];
  }

  const phases: PresentationPhase[] = [];

  if (result.scatterWin > 0n) {
    phases.push({
      kind: 'scatter',
      cells: scatterCells(result),
      amount: result.scatterWin,
      durationMs: PRESENTATION_TIMINGS.scatterMs,
    });
  }

  const lines: LineHighlight[] = result.lines
    .filter((line) => line.winCoins > 0n && line.length !== 0)
    .map((line) => ({
      lineIndex: line.lineIndex,
      startColumn: line.startColumn,
      length: line.length as 3 | 4 | 5,
    }))
    .sort((a, b) => a.lineIndex - b.lineIndex);
  const glow = result.totalWin >= result.totalBet;
  for (const line of lines) {
    phases.push({ kind: 'line', line, durationMs: PRESENTATION_TIMINGS.singleLineMs, glow });
  }
  if (lines.length > 0) {
    phases.push({ kind: 'all-lines', lines, durationMs: PRESENTATION_TIMINGS.allLinesMs, glow });
  }

  const mega = result.totalWin >= result.totalBet * 100n;
  const huge = result.totalWin >= result.totalBet * 10n;
  if (mega) {
    phases.push({
      kind: 'panel',
      panel: 'mega',
      amount: result.totalWin,
      durationMs: PRESENTATION_TIMINGS.megaWinPanelMs,
    });
  } else if (huge) {
    phases.push({
      kind: 'panel',
      panel: 'huge',
      amount: result.totalWin,
      durationMs: PRESENTATION_TIMINGS.hugeWinPanelMs,
    });
  }

  return phases;
}

/**
 * Win count-up duration (UI/UX 9.3 / 19.3: 300..800 ms by amount).
 * Zero wins never count up; the bet deduction uses its own 150 ms transition.
 */
export function countUpDurationMs(totalWin: Coins, totalBet: Coins): number {
  if (totalWin === 0n) return 0;
  if (totalWin < totalBet) return 300;
  if (totalWin < totalBet * 10n) return 550;
  return 800;
}

/** Balance transition when the bet is deducted at spin start (UI/UX 9.3). */
export const BET_DEDUCTION_TRANSITION_MS = 150;

/** Bet-change texts swap with a 120 ms fade (UI/UX 9.2). */
export const BET_CHANGE_FADE_MS = 120;
