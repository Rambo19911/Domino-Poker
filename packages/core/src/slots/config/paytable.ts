import type { DominoTier } from "../domain/domino";
import type { MajorSymbol } from "../domain/symbols";
import { SLOT_MATH_CONFIG } from "./gameConfig";

/** Multipliers in hundredths of the line bet, indexed [len3, len4, len5]. */
export type PayTriplet = readonly [number, number, number];

/**
 * Math v3: only domino combinations pay (docs/01 section 5). Major symbols no
 * longer have exact pays of their own — they substitute into a domino
 * combination and boost its win (MAJOR_BOOST_HUNDREDTHS below).
 */
export type ExactKey = DominoTier;

export const EXACT_PAY_HUNDREDTHS: Readonly<Record<ExactKey, PayTriplet>> = {
  "low-regular": [30, 80, 280],
  "mid-regular": [40, 140, 450],
  "high-regular": [60, 220, 680],
  ace: [80, 340, 1130],
  "low-trump": [100, 450, 1690],
  "high-trump": [160, 670, 2760],
  "royal-trump": [270, 1340, 5350]
};

export type RegularTier = "low-regular" | "mid-regular" | "high-regular";

/**
 * Tier combos (docs/01 section 5.6): a run whose dominoes are all from one
 * regular hierarchy group.
 */
export const TIER_COMBO_PAY: Readonly<Record<RegularTier, PayTriplet>> = {
  "low-regular": [20, 70, 210],
  "mid-regular": [30, 110, 360],
  "high-regular": [50, 180, 550]
};

export const ACE_COMBO_PAY: PayTriplet = [60, 260, 860];
export const TRUMP_COMBO_PAY: PayTriplet = [90, 360, 1260];
export const ALL_WILD_PAY: PayTriplet = [330, 3380, 11260];

/**
 * Major symbols strengthen a winning domino run (math v3): each major inside
 * the run substitutes like a Wild AND adds this bonus, in hundredths, to the
 * run's multiplier (total = base x (100 + sum of bonuses) / 100).
 */
export const MAJOR_BOOST_HUNDREDTHS: Readonly<Record<MajorSymbol, number>> = {
  VASE: 50,
  SCROLL: 100,
  BOOK: 150,
  SCARAB: 200
};

/** Scatter multiplier in hundredths of the total bet. */
export function scatterPayHundredths(jackpotCount: number): number {
  if (jackpotCount >= 5) return 10000;
  if (jackpotCount === 4) return 2500;
  if (jackpotCount === 3) return 500;
  return 0;
}

/**
 * Every distinct boost sum reachable with up to `maxMajors` major symbols in a
 * run (majors may repeat across cells). Size 0 yields the unboosted sum 0.
 */
function reachableBoostSums(maxMajors: number): readonly number[] {
  const boosts = Object.values(MAJOR_BOOST_HUNDREDTHS);
  let sums = new Set<number>([0]);
  const all = new Set<number>([0]);
  for (let n = 1; n <= maxMajors; n++) {
    const next = new Set<number>();
    for (const sum of sums) {
      for (const boost of boosts) {
        next.add(sum + boost);
      }
    }
    for (const sum of next) all.add(sum);
    sums = next;
  }
  return [...all];
}

/**
 * Proves the integer-coin invariant instead of assuming it.
 *
 * A payout is `lineBet * H / 100` where `H = base * (100 + boostSum) / 100`.
 * Because every base is a multiple of 10 and every boost a multiple of 50,
 * `H` is always a multiple of 5 but NOT always of 10 — e.g. base 30 with a
 * single VASE (+50) gives H = 45. That forces `lineBet` to be a multiple of 20,
 * which is why the 5x-scaled steps are 20/40/60/100/200 and why a naive 10x
 * scale (10/20/30/50/100) would make multiplyByHundredths throw at runtime.
 *
 * Rather than encode that conclusion as a modulo rule, this enumerates every
 * reachable (base, boostSum, lineBet) triple so the check keeps holding if the
 * paytable or the bet steps are ever edited.
 */
function validateBetSteps(): void {
  // A window of length L needs >= 2 real dominoes for an exact match and >= 3
  // for a group combo, so majors can occupy at most L - 2 cells (docs/01 5.5).
  const groups: readonly (readonly [PayTriplet, number])[] = [
    ...Object.values(EXACT_PAY_HUNDREDTHS).map((t): readonly [PayTriplet, number] => [t, 2]),
    ...Object.values(TIER_COMBO_PAY).map((t): readonly [PayTriplet, number] => [t, 3]),
    [ACE_COMBO_PAY, 3],
    [TRUMP_COMBO_PAY, 3],
    // All Wild needs zero dominoes AND zero majors (classifyWindow returns null
    // when majors appear without dominoes), so 5 here is a sentinel that drives
    // maxMajors to 0 at every length rather than a real minimum-domino count.
    [ALL_WILD_PAY, 5]
  ];

  for (const bet of SLOT_MATH_CONFIG.lineBetSteps) {
    if (!Number.isSafeInteger(bet) || bet <= 0) {
      throw new Error(`Line bet ${bet} must be a positive integer`);
    }
    for (const [triplet, minDominoes] of groups) {
      for (const index of [0, 1, 2] as const) {
        const length = index + 3;
        const base = triplet[index];
        for (const boostSum of reachableBoostSums(Math.max(0, length - minDominoes))) {
          const scaled = base * (100 + boostSum);
          if (scaled % 100 !== 0) {
            throw new Error(
              `Non-integer multiplier: base ${base} boosted by ${boostSum} at length ${length}`
            );
          }
          if ((bet * (scaled / 100)) % 100 !== 0) {
            throw new Error(
              `Line bet ${bet} yields fractional coins: base ${base} boosted by ${boostSum} ` +
                `at length ${length}. Line bets must be multiples of 20.`
            );
          }
        }
      }
    }
    // Scatter pays off the total bet; its multipliers are multiples of 100, so
    // this can only fail if scatterPayHundredths is edited.
    const totalBet = bet * SLOT_MATH_CONFIG.activeLines;
    for (const count of [0, 3, 4, 5]) {
      if ((totalBet * scatterPayHundredths(count)) % 100 !== 0) {
        throw new Error(`Scatter payout is fractional at ${count} jackpots, line bet ${bet}`);
      }
    }
  }
}

function validatePaytable(): true {
  validateBetSteps();
  const allTriplets: PayTriplet[] = [
    ...Object.values(EXACT_PAY_HUNDREDTHS),
    ...Object.values(TIER_COMBO_PAY),
    ACE_COMBO_PAY,
    TRUMP_COMBO_PAY,
    ALL_WILD_PAY
  ];
  for (const triplet of allTriplets) {
    const [p3, p4, p5] = triplet;
    const integers = triplet.every((value) => Number.isSafeInteger(value));
    if (!(integers && p3 > 0 && p4 > p3 && p5 > p4)) {
      throw new Error(`Paytable triplet is not strictly increasing: ${triplet.join(", ")}`);
    }
    // Boosted wins stay integer coins: base % 10 == 0 and boosts % 50 == 0
    // make base x (100 + boost) always divisible by 100 (docs/01 section 5.8).
    for (const value of triplet) {
      if (value % 10 !== 0) {
        throw new Error(`Paytable value ${value} is not a multiple of 10`);
      }
    }
  }
  for (const boost of Object.values(MAJOR_BOOST_HUNDREDTHS)) {
    if (!(Number.isSafeInteger(boost) && boost > 0 && boost % 50 === 0)) {
      throw new Error(`Major boost ${boost} must be a positive multiple of 50`);
    }
  }
  // Major boosts follow the major hierarchy Vase < Scroll < Book < Scarab.
  const boostChain = [
    MAJOR_BOOST_HUNDREDTHS.VASE,
    MAJOR_BOOST_HUNDREDTHS.SCROLL,
    MAJOR_BOOST_HUNDREDTHS.BOOK,
    MAJOR_BOOST_HUNDREDTHS.SCARAB
  ];
  for (let i = 1; i < boostChain.length; i++) {
    if (!((boostChain[i] as number) > (boostChain[i - 1] as number))) {
      throw new Error("Major boost hierarchy not increasing");
    }
  }

  // Hierarchy monotonicity per run length (docs/01 sections 5-6): group combos
  // rank LOW < MID < HIGH < ACE < TRUMP < ALL_WILD, every group combo pays
  // below its own group's exact match, and All Wild tops all bases.
  for (const index of [0, 1, 2] as const) {
    const chain = [
      TIER_COMBO_PAY["low-regular"][index],
      TIER_COMBO_PAY["mid-regular"][index],
      TIER_COMBO_PAY["high-regular"][index],
      ACE_COMBO_PAY[index],
      TRUMP_COMBO_PAY[index],
      ALL_WILD_PAY[index]
    ];
    for (let i = 1; i < chain.length; i++) {
      if (!((chain[i] as number) > (chain[i - 1] as number))) {
        throw new Error(`Combo hierarchy not increasing at length ${index + 3}`);
      }
    }
    const comboBelowExact: readonly (readonly [number, number])[] = [
      [TIER_COMBO_PAY["low-regular"][index], EXACT_PAY_HUNDREDTHS["low-regular"][index]],
      [TIER_COMBO_PAY["mid-regular"][index], EXACT_PAY_HUNDREDTHS["mid-regular"][index]],
      [TIER_COMBO_PAY["high-regular"][index], EXACT_PAY_HUNDREDTHS["high-regular"][index]],
      [ACE_COMBO_PAY[index], EXACT_PAY_HUNDREDTHS.ace[index]],
      [TRUMP_COMBO_PAY[index], EXACT_PAY_HUNDREDTHS["low-trump"][index]]
    ];
    for (const [combo, exact] of comboBelowExact) {
      if (!(combo < exact)) {
        throw new Error(`Group combo must pay below its exact match at length ${index + 3}`);
      }
    }
    // Exact payouts must follow the domino strength hierarchy at every length.
    const exactChain: readonly ExactKey[] = [
      "low-regular",
      "mid-regular",
      "high-regular",
      "ace",
      "low-trump",
      "high-trump",
      "royal-trump"
    ];
    for (let i = 1; i < exactChain.length; i++) {
      const prev = EXACT_PAY_HUNDREDTHS[exactChain[i - 1] as ExactKey][index];
      const next = EXACT_PAY_HUNDREDTHS[exactChain[i] as ExactKey][index];
      if (!(next > prev)) {
        throw new Error(`Exact hierarchy not increasing at length ${index + 3}`);
      }
    }
    for (const exact of Object.values(EXACT_PAY_HUNDREDTHS)) {
      if (!(ALL_WILD_PAY[index] > exact[index])) {
        throw new Error(`All Wild must exceed every exact payout at length ${index + 3}`);
      }
    }
  }
  return true;
}

export const PAYTABLE_VALID = validatePaytable();
