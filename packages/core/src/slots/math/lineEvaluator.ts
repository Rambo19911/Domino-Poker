import {
  ACE_COMBO_PAY,
  ALL_WILD_PAY,
  EXACT_PAY_HUNDREDTHS,
  MAJOR_BOOST_HUNDREDTHS,
  TIER_COMBO_PAY,
  TRUMP_COMBO_PAY,
  type PayTriplet,
  type RegularTier
} from "../config/paytable";
import { getDominoTier, isAceDomino, isTrumpDomino, type DominoTier } from "../domain/domino";
import { multiplyByHundredths } from "../domain/money";
import type { ColumnIndex, LineBet, LineOutcome, OutcomeCategory } from "../domain/outcomes";
import { isDomino, isMajor, isWild, type MajorSymbol, type SymbolId } from "../domain/symbols";

export type Line = readonly [SymbolId, SymbolId, SymbolId, SymbolId, SymbolId];

export interface LineWin {
  readonly category: OutcomeCategory;
  readonly startColumn: ColumnIndex;
  readonly length: 3 | 4 | 5;
  readonly targetSymbol: SymbolId | null;
  /** Base pay boosted by the majors inside the run, in hundredths. */
  readonly multiplierHundredths: number;
}

export type Candidate = LineWin;

const REGULAR_TIERS: readonly RegularTier[] = ["low-regular", "mid-regular", "high-regular"];

const TIER_COMBO_CATEGORY: Readonly<Record<RegularTier, OutcomeCategory>> = {
  "low-regular": "LOW_REGULAR_COMBO",
  "mid-regular": "MID_REGULAR_COMBO",
  "high-regular": "HIGH_REGULAR_COMBO"
};

// Tie-break priority when payout, length and start are equal (docs/01 5.1).
const CATEGORY_PRIORITY: Readonly<Record<OutcomeCategory, number>> = {
  LOW_REGULAR_COMBO: 0,
  MID_REGULAR_COMBO: 0,
  HIGH_REGULAR_COMBO: 0,
  ACE_COMBO: 1,
  TRUMP_COMBO: 2,
  EXACT: 3,
  ALL_WILD: 4
};

interface SymbolProps {
  readonly isWild: boolean;
  readonly isMajor: boolean;
  readonly isJackpot: boolean;
  readonly isDomino: boolean;
  readonly isTrump: boolean;
  readonly isAce: boolean;
  readonly tier: DominoTier | null;
  readonly exactPay: PayTriplet | null;
  readonly boost: number;
}

const propsCache = new Map<SymbolId, SymbolProps>();

function propsOf(symbol: SymbolId): SymbolProps {
  let props = propsCache.get(symbol);
  if (props === undefined) {
    if (isDomino(symbol)) {
      const tier = getDominoTier(symbol);
      props = {
        isWild: false,
        isMajor: false,
        isJackpot: false,
        isDomino: true,
        isTrump: isTrumpDomino(symbol),
        isAce: isAceDomino(symbol),
        tier,
        exactPay: EXACT_PAY_HUNDREDTHS[tier],
        boost: 0
      };
    } else {
      const major = isMajor(symbol);
      props = {
        isWild: isWild(symbol),
        isMajor: major,
        isJackpot: symbol === "JACKPOT",
        isDomino: false,
        isTrump: false,
        isAce: false,
        tier: null,
        exactPay: null,
        boost: major ? MAJOR_BOOST_HUNDREDTHS[symbol as MajorSymbol] : 0
      };
    }
    propsCache.set(symbol, props);
  }
  return props;
}

/** Base pay x (100 + boost) / 100; integer by the paytable validation rules. */
function boostedPay(baseHundredths: number, boostHundredths: number): number {
  return (baseHundredths * (100 + boostHundredths)) / 100;
}

interface WindowWin {
  readonly category: OutcomeCategory;
  readonly targetSymbol: SymbolId | null;
  readonly multiplierHundredths: number;
}

/**
 * Classifies one contiguous window (docs/01 section 5, math v3): dominoes are
 * the combination material, WILD substitutes neutrally, majors substitute AND
 * boost the win, JACKPOT invalidates the window. Returns the window's single
 * best category or null.
 */
function classifyWindow(line: Line, start: number, length: number): WindowWin | null {
  const payIndex = length - 3;
  let dominoCount = 0;
  let majorCount = 0;
  let boost = 0;
  let exactTarget: SymbolId | null = null;
  let exactConflict = false;
  let trumpOnly = true;
  let aceOnly = true;
  let regularTier: RegularTier | null = null;
  let regularTierOnly = true;

  for (let i = start; i < start + length; i++) {
    const symbol = line[i] as SymbolId;
    const props = propsOf(symbol);
    if (props.isJackpot) return null;
    if (props.isMajor) {
      majorCount += 1;
      boost += props.boost;
      continue;
    }
    if (props.isWild) continue;
    dominoCount += 1;
    if (exactTarget === null) exactTarget = symbol;
    else if (exactTarget !== symbol) exactConflict = true;
    if (!props.isTrump) trumpOnly = false;
    if (!props.isAce) aceOnly = false;
    const tier = props.tier;
    if (tier === "low-regular" || tier === "mid-regular" || tier === "high-regular") {
      if (regularTier === null) regularTier = tier;
      else if (regularTier !== tier) regularTierOnly = false;
    } else {
      regularTierOnly = false;
    }
  }

  if (dominoCount === 0) {
    // Pure substitutes: only a run of true Wilds pays; majors need dominoes.
    if (majorCount === 0) {
      return {
        category: "ALL_WILD",
        targetSymbol: "WILD",
        multiplierHundredths: ALL_WILD_PAY[payIndex] as number
      };
    }
    return null;
  }
  // Dominoes are the combination material (math v3): substitutes may extend a
  // combination but never form one — at least 2 real dominoes are required.
  if (dominoCount < 2) return null;

  let best: WindowWin | null = null;
  const consider = (base: number, category: OutcomeCategory, target: SymbolId | null): void => {
    const pay = boostedPay(base, boost);
    if (
      best === null ||
      pay > best.multiplierHundredths ||
      (pay === best.multiplierHundredths &&
        CATEGORY_PRIORITY[category] > CATEGORY_PRIORITY[best.category])
    ) {
      best = { category, targetSymbol: target, multiplierHundredths: pay };
    }
  };

  if (!exactConflict && exactTarget !== null) {
    const exactPay = propsOf(exactTarget).exactPay;
    if (exactPay !== null) consider(exactPay[payIndex] as number, "EXACT", exactTarget);
  }
  // Group combos are made of at least 3 real dominoes of the group; with only
  // 2 dominoes a mixed group is not convincing enough to pay (docs/01 5.5).
  if (dominoCount >= 3) {
    if (trumpOnly) consider(TRUMP_COMBO_PAY[payIndex] as number, "TRUMP_COMBO", null);
    if (aceOnly) consider(ACE_COMBO_PAY[payIndex] as number, "ACE_COMBO", null);
    if (regularTierOnly && regularTier !== null) {
      consider(
        TIER_COMBO_PAY[regularTier][payIndex] as number,
        TIER_COMBO_CATEGORY[regularTier],
        null
      );
    }
  }
  return best;
}

/** All (start, length) windows of 3..5 contiguous cells on a 5-cell line. */
export const LINE_WINDOWS: readonly (readonly [number, 3 | 4 | 5])[] = [
  [0, 5],
  [0, 4],
  [1, 4],
  [0, 3],
  [1, 3],
  [2, 3]
];

function isBetter(candidate: LineWin, best: LineWin | null): boolean {
  if (best === null) return true;
  if (candidate.multiplierHundredths !== best.multiplierHundredths) {
    return candidate.multiplierHundredths > best.multiplierHundredths;
  }
  if (candidate.length !== best.length) return candidate.length > best.length;
  if (candidate.startColumn !== best.startColumn) {
    return candidate.startColumn < best.startColumn;
  }
  return CATEGORY_PRIORITY[candidate.category] > CATEGORY_PRIORITY[best.category];
}

/**
 * Math v3 line evaluation: the winning run may start on ANY column (it floats),
 * as long as it is 3..5 contiguous cells. The single most valuable window wins;
 * ties prefer the longer, then the leftmost, then the stronger category.
 */
export function evaluateLineWin(line: Line): LineWin | null {
  let best: LineWin | null = null;
  for (const [start, length] of LINE_WINDOWS) {
    const win = classifyWindow(line, start, length);
    if (win === null) continue;
    const candidate: LineWin = {
      category: win.category,
      startColumn: start as ColumnIndex,
      length,
      targetSymbol: win.targetSymbol,
      multiplierHundredths: win.multiplierHundredths
    };
    if (isBetter(candidate, best)) best = candidate;
  }
  return best;
}

/** Readable specification: every valid candidate over all 6 windows. */
export function collectCandidates(line: Line): readonly Candidate[] {
  const candidates: Candidate[] = [];
  for (const [start, length] of LINE_WINDOWS) {
    const payIndex = length - 3;
    const window = line.slice(start, start + length);
    if (window.some((s) => s === "JACKPOT")) continue;
    const dominoes = window.filter((s) => isDomino(s));
    const majors = window.filter((s) => isMajor(s));
    const boost = majors.reduce((sum, s) => sum + MAJOR_BOOST_HUNDREDTHS[s as MajorSymbol], 0);
    const push = (category: OutcomeCategory, base: number, target: SymbolId | null): void => {
      candidates.push({
        category,
        startColumn: start as ColumnIndex,
        length,
        targetSymbol: target,
        multiplierHundredths: boostedPay(base, boost)
      });
    };

    if (dominoes.length === 0) {
      if (majors.length === 0) {
        push("ALL_WILD", ALL_WILD_PAY[payIndex] as number, "WILD");
      }
      continue;
    }
    // Substitutes may extend a combination but never form one (math v3).
    if (dominoes.length < 2) continue;
    const first = dominoes[0] as SymbolId;
    if (dominoes.every((s) => s === first) && isDomino(first)) {
      push("EXACT", EXACT_PAY_HUNDREDTHS[getDominoTier(first)][payIndex] as number, first);
    }
    // Group combos need at least 3 real dominoes of the group (docs/01 5.5).
    if (dominoes.length >= 3) {
      if (dominoes.every((s) => isDomino(s) && isTrumpDomino(s))) {
        push("TRUMP_COMBO", TRUMP_COMBO_PAY[payIndex] as number, null);
      }
      if (dominoes.every((s) => isDomino(s) && isAceDomino(s))) {
        push("ACE_COMBO", ACE_COMBO_PAY[payIndex] as number, null);
      }
      for (const tier of REGULAR_TIERS) {
        if (dominoes.every((s) => isDomino(s) && getDominoTier(s) === tier)) {
          push(TIER_COMBO_CATEGORY[tier], TIER_COMBO_PAY[tier][payIndex] as number, null);
        }
      }
    }
  }
  return candidates;
}

/** Winner selection over collectCandidates, used by tests as the reference. */
export function selectWinner(candidates: readonly Candidate[]): Candidate | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (isBetter(candidate, best)) best = candidate;
  }
  return best;
}

export function evaluateLine(line: Line, lineIndex: number, lineBet: LineBet): LineOutcome {
  const win = evaluateLineWin(line);
  if (win === null) {
    return {
      lineIndex,
      category: null,
      startColumn: 0,
      length: 0,
      targetSymbol: null,
      multiplierHundredths: 0,
      winCoins: 0n
    };
  }
  return {
    lineIndex,
    category: win.category,
    startColumn: win.startColumn,
    length: win.length,
    targetSymbol: win.targetSymbol,
    multiplierHundredths: win.multiplierHundredths,
    winCoins: multiplyByHundredths(BigInt(lineBet), win.multiplierHundredths)
  };
}
