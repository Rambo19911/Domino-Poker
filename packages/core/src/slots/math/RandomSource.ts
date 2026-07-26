export interface RandomSource {
  /** Returns a uniformly distributed integer in [0, 2^32). */
  nextUint32(): number;
}
