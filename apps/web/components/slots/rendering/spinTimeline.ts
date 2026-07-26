import type { Grid } from '@domino-poker/core/slots';
import type { SymbolId } from '@domino-poker/core/slots';
import { SPIN_TIMINGS } from '../config/layout';

/**
 * Pure spin-timeline helpers (plan section 14.1). No PixiJS imports so the
 * scheduling and grid mapping stay unit-testable in Node.
 */

export type ColumnPlan =
  | { readonly kind: 'cells'; readonly symbols: readonly [SymbolId, SymbolId, SymbolId] }
  | { readonly kind: 'full-wild' };

/** Maps a SpinResult grid (rows) into the five per-column display plans. */
export function planColumns(grid: Grid): readonly ColumnPlan[] {
  return [0, 1, 2, 3, 4].map((column): ColumnPlan => {
    const top = grid[0][column as 0 | 1 | 2 | 3 | 4];
    if (top.fromFullWildColumn) return { kind: 'full-wild' };
    return {
      kind: 'cells',
      symbols: [
        grid[0][column as 0 | 1 | 2 | 3 | 4].symbol,
        grid[1][column as 0 | 1 | 2 | 3 | 4].symbol,
        grid[2][column as 0 | 1 | 2 | 3 | 4].symbol,
      ],
    };
  });
}

/** Column stop start time: 700, 820, 940, 1060, 1180 ms. */
export function columnStopTimeMs(column: number): number {
  return SPIN_TIMINGS.firstStopMs + column * SPIN_TIMINGS.staggerMs;
}

/** Full spin duration up to the last finished stop transition. */
export function spinDurationMs(): number {
  return columnStopTimeMs(4) + SPIN_TIMINGS.stopTransitionMs;
}

/** Standard back-out easing; overshoot past 1 creates the 6 px bounce. */
export function backOut(t: number, overshoot = 1.70158): number {
  const p = t - 1;
  return 1 + (overshoot + 1) * p * p * p + overshoot * p * p;
}

/** Sawtooth wrap offset for the blur motion: -A..A over one cycle. */
export function motionOffsetPx(elapsedMs: number): number {
  const amplitude = SPIN_TIMINGS.motionAmplitudePx;
  const phase = (elapsedMs % SPIN_TIMINGS.motionCycleMs) / SPIN_TIMINGS.motionCycleMs;
  return phase * 2 * amplitude - amplitude;
}
