/**
 * Slot math configuration (math v3). This is the LOGIC half of the standalone
 * game's GAME_CONFIG — presentation constants (designWidth/designHeight,
 * autoSpinOptions) stay with the renderer, and startingBalance is gone entirely
 * because the DominoPoker server owns the balance.
 *
 * Renamed from GAME_CONFIG to avoid colliding with Domino poker's own config in
 * this monorepo.
 */
export const SLOT_MATH_CONFIG = {
  rows: 3,
  columns: 5,
  activeLines: 11,
  lineBetSteps: [20, 40, 60, 100, 200] as const,
  defaultLineBet: 20,
  mathVersion: "domino-slots-math-v3"
} as const;

/** Row index (0 = top) the payline crosses in each of the 5 columns. */
export type PaylinePattern = readonly [number, number, number, number, number];

/**
 * The 11 always-active paylines (math v3, docs/01 section 4): the 3 straight
 * rows plus 8 intersecting patterns. Every payline takes exactly one cell per
 * column, so all lines share the same per-cell symbol distribution and the
 * exact per-line RTP is identical for every pattern.
 */
export const PAYLINES: readonly PaylinePattern[] = [
  [0, 0, 0, 0, 0], // L1 top row
  [1, 1, 1, 1, 1], // L2 middle row
  [2, 2, 2, 2, 2], // L3 bottom row
  [0, 1, 2, 1, 0], // L4 V
  [2, 1, 0, 1, 2], // L5 inverted V
  [0, 0, 1, 2, 2], // L6 stairs down
  [2, 2, 1, 0, 0], // L7 stairs up
  [1, 0, 0, 0, 1], // L8 crest
  [1, 2, 2, 2, 1], // L9 trough
  [0, 1, 1, 1, 0], // L10 shallow V
  [2, 1, 1, 1, 2] // L11 shallow inverted V
] as const;

if (PAYLINES.length !== SLOT_MATH_CONFIG.activeLines) {
  throw new Error(
    `PAYLINES has ${PAYLINES.length} patterns, expected ${SLOT_MATH_CONFIG.activeLines}`
  );
}
for (const pattern of PAYLINES) {
  for (const row of pattern) {
    if (row !== 0 && row !== 1 && row !== 2) {
      throw new Error(`Invalid payline row index: ${row}`);
    }
  }
}
