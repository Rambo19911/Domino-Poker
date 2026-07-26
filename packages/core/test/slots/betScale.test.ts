import { describe, expect, it } from "vitest";

import {
  ACE_COMBO_PAY,
  ALL_WILD_PAY,
  EXACT_PAY_HUNDREDTHS,
  MAJOR_BOOST_HUNDREDTHS,
  PAYTABLE_VALID,
  SLOT_MATH_CONFIG,
  TIER_COMBO_PAY,
  TRUMP_COMBO_PAY,
  evaluateLine,
  multiplyByHundredths,
  type Line,
  type LineBet,
  type PayTriplet,
  type SymbolId
} from "../../src/slots/index";

/**
 * The integer-coin gate (integration plan T1.2).
 *
 * A payout is `lineBet * H / 100` where `H = base * (100 + boostSum) / 100`.
 * Bases are multiples of 10 and boosts multiples of 50, so H is always a
 * multiple of 5 but not always of 10 — base 30 with one VASE gives H = 45.
 * That makes 20, not 10, the tight lower bound on the line bet granularity,
 * which is why the scaled-down steps are 20/40/60/100/200 rather than the
 * naive 10x 10/20/30/50/100.
 *
 * These tests prove the bound behaviourally, through the real evaluator and
 * the real multiplyByHundredths guard, so they fail loudly if anyone rescales
 * the bets or edits the paytable in a way that reintroduces fractional coins.
 */

/** A line whose single winning window is a length-3 low-regular exact + VASE. */
const BASE30_PLUS_VASE: Line = ["0-2", "0-2", "VASE", "JACKPOT", "JACKPOT"] as unknown as Line;

/** Distinct boost sums reachable with up to `maxMajors` majors (repeats allowed). */
function reachableBoostSums(maxMajors: number): readonly number[] {
  const boosts = Object.values(MAJOR_BOOST_HUNDREDTHS);
  let current = new Set<number>([0]);
  const all = new Set<number>([0]);
  for (let n = 1; n <= maxMajors; n++) {
    const next = new Set<number>();
    for (const sum of current) for (const boost of boosts) next.add(sum + boost);
    for (const sum of next) all.add(sum);
    current = next;
  }
  return [...all];
}

/** Every paytable base paired with the minimum real dominoes its group needs. */
const PAY_GROUPS: readonly (readonly [PayTriplet, number])[] = [
  ...Object.values(EXACT_PAY_HUNDREDTHS).map((t): readonly [PayTriplet, number] => [t, 2]),
  ...Object.values(TIER_COMBO_PAY).map((t): readonly [PayTriplet, number] => [t, 3]),
  [ACE_COMBO_PAY, 3],
  [TRUMP_COMBO_PAY, 3],
  [ALL_WILD_PAY, 5]
];

/** True when every reachable payout at this line bet is a whole coin. */
function everyPayoutIsWholeCoins(lineBet: number): boolean {
  for (const [triplet, minDominoes] of PAY_GROUPS) {
    for (const index of [0, 1, 2] as const) {
      const length = index + 3;
      const base = triplet[index];
      for (const boostSum of reachableBoostSums(Math.max(0, length - minDominoes))) {
        const scaled = base * (100 + boostSum);
        if (scaled % 100 !== 0) return false;
        if ((lineBet * (scaled / 100)) % 100 !== 0) return false;
      }
    }
  }
  return true;
}

describe("slot bet scale — integer coin invariant", () => {
  it("accepts the configured line bet steps at module load", () => {
    expect(PAYTABLE_VALID).toBe(true);
    expect(SLOT_MATH_CONFIG.lineBetSteps).toEqual([20, 40, 60, 100, 200]);
  });

  it("pays whole coins for every reachable base and boost at every step", () => {
    for (const bet of SLOT_MATH_CONFIG.lineBetSteps) {
      expect(everyPayoutIsWholeCoins(bet), `line bet ${bet}`).toBe(true);
    }
  });

  it("reaches the fractional-risk case: base 30 boosted by VASE gives H = 45", () => {
    const outcome = evaluateLine(BASE30_PLUS_VASE, 0, 20);
    expect(outcome.category).toBe("EXACT");
    expect(outcome.length).toBe(3);
    expect(outcome.multiplierHundredths).toBe(45);
    // 20 * 45 / 100 = 9 coins exactly.
    expect(outcome.winCoins).toBe(9n);
  });

  it("throws on the naive 10x steps that are not multiples of 20", () => {
    for (const bet of [10, 30, 50]) {
      expect(() => evaluateLine(BASE30_PLUS_VASE, 0, bet as LineBet), `line bet ${bet}`).toThrow(
        /Non-integer coin result/u
      );
    }
  });

  it("confirms 20 is the tight bound, not 10", () => {
    // Every multiple of 20 up to 200 is safe...
    for (let bet = 20; bet <= 200; bet += 20) {
      expect(everyPayoutIsWholeCoins(bet), `multiple of 20: ${bet}`).toBe(true);
    }
    // ...and every multiple of 10 that is not a multiple of 20 is not.
    for (let bet = 10; bet <= 200; bet += 20) {
      expect(everyPayoutIsWholeCoins(bet), `odd multiple of 10: ${bet}`).toBe(false);
    }
  });

  it("keeps scatter payouts whole at every step", () => {
    for (const bet of SLOT_MATH_CONFIG.lineBetSteps) {
      const totalBet = BigInt(bet) * BigInt(SLOT_MATH_CONFIG.activeLines);
      for (const hundredths of [0, 500, 2500, 10000]) {
        expect(() => multiplyByHundredths(totalBet, hundredths)).not.toThrow();
      }
    }
  });
});

describe("slot bet scale — economy fit", () => {
  it("keeps the total bet range inside the DominoPoker coin economy", () => {
    const lines = BigInt(SLOT_MATH_CONFIG.activeLines);
    const steps = SLOT_MATH_CONFIG.lineBetSteps;
    const min = BigInt(steps[0]) * lines;
    const max = BigInt(steps[steps.length - 1] as number) * lines;
    expect(min).toBe(220n);
    expect(max).toBe(2200n);
    // A 5000-coin signup bonus must fund a meaningful number of minimum spins.
    expect(5000n / min).toBeGreaterThanOrEqual(20n);
  });

  it("caps the maximum scatter jackpot near the 200k theme price", () => {
    const maxStep = SLOT_MATH_CONFIG.lineBetSteps[SLOT_MATH_CONFIG.lineBetSteps.length - 1];
    const maxTotalBet = BigInt(maxStep as number) * BigInt(SLOT_MATH_CONFIG.activeLines);
    // 5+ jackpots pay 100x the total bet (scatterPayHundredths = 10000).
    const maxScatter = multiplyByHundredths(maxTotalBet, 10000);
    expect(maxScatter).toBe(220_000n);
  });
});

/** Guards the branded-string cast used to build the fixture line above. */
describe("fixture sanity", () => {
  it("uses real symbols", () => {
    const symbols: readonly SymbolId[] = BASE30_PLUS_VASE;
    expect(symbols).toHaveLength(5);
  });
});
