import type { RandomSource } from "./RandomSource";

const UINT32_RANGE = 2 ** 32;

/** Unbiased integer in [0, n) via rejection sampling (docs/01 section 8). */
export function randomInt(source: RandomSource, n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > UINT32_RANGE) {
    throw new Error(`Invalid randomInt bound: ${n}`);
  }
  const limit = Math.floor(UINT32_RANGE / n) * n;
  let value: number;
  do {
    value = source.nextUint32();
  } while (value >= limit);
  return value % n;
}
