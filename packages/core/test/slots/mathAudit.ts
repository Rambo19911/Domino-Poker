/**
 * Exact math audit, math v3 (docs/01 section 9, docs/02 section 19.2).
 *
 * Enumerates the complete weighted single-line outcome space with the
 * PRODUCTION line evaluator — no Monte Carlo for the RTP. Because every one of
 * the 11 paylines takes exactly one cell per column and columns are
 * independent, all paylines share the same joint cell distribution, so
 *
 *   totalRtp = E[line multiplier] + scatterRtp
 *
 * holds exactly with totalBet = activeLines x lineBet. Spin-level hit/push
 * rates depend on the joint behaviour of the 11 overlapping lines and are
 * estimated with a seeded, deterministic Monte Carlo run over the production
 * grid generator (sanity metrics, not RTP sources).
 *
 * Test-only helper: it is never imported from src/, so it does not ship in the
 * package's dist output. Consumed by exactAudit.math.test.ts.
 */
import {
  CELL_SYMBOL_WEIGHTS,
  CELL_TICKET_TOTAL,
  COLUMN_TOKEN_TOTAL,
  DOMINO_IDS,
  FULL_WILD_WEIGHT,
  SLOT_MATH_CONFIG,
  evaluateLineWin,
  evaluateSpin,
  generateGrid,
  getDominoTier,
  scatterPayHundredths,
  type Line,
  type RandomSource,
  type SymbolId
} from "../../src/slots/index";

const DOMINO_TIER_BY_ID = new Map<SymbolId, string>(
  DOMINO_IDS.map((id) => [id as SymbolId, getDominoTier(id)])
);

export interface ExactAuditResult {
  /** Probability per outcome family for a single line, keys like 'exact:ace'. */
  readonly lineFamilies: ReadonlyMap<string, number>;
  /** Per-family expected line-bet multiplier (RTP contribution per line). */
  readonly lineFamilyRtp: ReadonlyMap<string, number>;
  readonly lineHitRate: number;
  readonly lineRtp: number;
  /** Highest boosted single-line pay, in line-bet multiples. */
  readonly maxLineWinLineBetMultiple: number;
  /** P(jackpot count = k) for k in 0..15 across the full grid. */
  readonly jackpotDistribution: readonly number[];
  readonly jackpotTriggerRate: number;
  readonly scatterRtp: number;
  readonly totalRtp: number;
  readonly houseEdge: number;
  /** Seeded Monte Carlo estimates over the production generator. */
  readonly mcSpins: number;
  readonly mcHitRate: number;
  readonly mcProfitRate: number;
  readonly mcPushRate: number;
  readonly mcRtp: number;
}

const LINE_SYMBOLS: readonly SymbolId[] = [
  ...DOMINO_IDS,
  "VASE",
  "SCROLL",
  "BOOK",
  "SCARAB",
  "WILD",
  "JACKPOT"
];

function familyOf(line: Line): { family: string; hundredths: number } {
  const win = evaluateLineWin(line);
  if (win === null) return { family: "nowin", hundredths: 0 };
  switch (win.category) {
    case "ALL_WILD":
      return { family: "allwild", hundredths: win.multiplierHundredths };
    case "TRUMP_COMBO":
      return { family: "trumpcombo", hundredths: win.multiplierHundredths };
    case "ACE_COMBO":
      return { family: "acecombo", hundredths: win.multiplierHundredths };
    case "LOW_REGULAR_COMBO":
      return { family: "tiercombo:low-regular", hundredths: win.multiplierHundredths };
    case "MID_REGULAR_COMBO":
      return { family: "tiercombo:mid-regular", hundredths: win.multiplierHundredths };
    case "HIGH_REGULAR_COMBO":
      return { family: "tiercombo:high-regular", hundredths: win.multiplierHundredths };
    case "EXACT": {
      const target = win.targetSymbol as SymbolId;
      return {
        family: `exact:${DOMINO_TIER_BY_ID.get(target)}`,
        hundredths: win.multiplierHundredths
      };
    }
  }
}

/** Marginal per-position weights out of 128: WILD absorbs the full-wild mass. */
function marginalWeights(): number[] {
  return LINE_SYMBOLS.map((symbol) => {
    const weight = CELL_SYMBOL_WEIGHTS.get(symbol);
    if (weight === undefined) throw new Error(`Missing weight for ${symbol}`);
    return symbol === "WILD" ? weight + FULL_WILD_WEIGHT : weight;
  });
}

/** Deterministic xorshift128 source for the Monte Carlo sanity metrics. */
export function createSeededSource(seed: number): RandomSource {
  let x = seed >>> 0 || 0x9e3779b9;
  let y = 0x243f6a88;
  let z = 0xb7e15162;
  let w = 0xdeadbeef;
  return {
    nextUint32(): number {
      const t = x ^ ((x << 11) >>> 0);
      x = y;
      y = z;
      z = w;
      w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
      return w;
    }
  };
}

export function runExactAudit(mcSpins = 1_000_000): ExactAuditResult {
  const symbolCount = LINE_SYMBOLS.length;

  // --- Single-line distribution over the exact 128^5 weighted space ---
  const margins = marginalWeights();
  const marginTotal = margins.reduce((a, b) => a + b, 0);
  if (marginTotal !== COLUMN_TOKEN_TOTAL) {
    throw new Error(`Marginal weights must sum to ${COLUMN_TOKEN_TOTAL}, got ${marginTotal}`);
  }
  const lineSpace = COLUMN_TOKEN_TOTAL ** 5;
  const families = new Map<string, number>();
  const familyPay = new Map<string, number>();
  let linePayExpectation = 0;
  let maxLinePay = 0;
  const line: SymbolId[] = new Array<SymbolId>(5);

  const enumerateLine = (depth: number, weight: number): void => {
    if (depth === 5) {
      const { family, hundredths } = familyOf(line as unknown as Line);
      families.set(family, (families.get(family) ?? 0) + weight);
      familyPay.set(family, (familyPay.get(family) ?? 0) + weight * hundredths);
      linePayExpectation += weight * hundredths;
      if (hundredths > maxLinePay) maxLinePay = hundredths;
      return;
    }
    for (let s = 0; s < symbolCount; s++) {
      line[depth] = LINE_SYMBOLS[s] as SymbolId;
      enumerateLine(depth + 1, weight * (margins[s] as number));
    }
  };
  enumerateLine(0, 1);

  const lineFamilies = new Map<string, number>();
  for (const [family, weight] of families) lineFamilies.set(family, weight / lineSpace);
  const lineFamilyRtp = new Map<string, number>();
  for (const [family, pay] of familyPay) lineFamilyRtp.set(family, pay / lineSpace / 100);
  const lineHitRate = 1 - (lineFamilies.get("nowin") ?? 0);
  const lineRtp = linePayExpectation / lineSpace / 100;

  // --- Exact jackpot-count distribution via per-column convolution ---
  // A full-wild column has no jackpot cells; otherwise the 3 cells are i.i.d.
  // with P(jackpot) = weight/124. Columns are independent.
  const pJackpotCell = (CELL_SYMBOL_WEIGHTS.get("JACKPOT") ?? 0) / CELL_TICKET_TOTAL;
  const pFree = CELL_TICKET_TOTAL / COLUMN_TOKEN_TOTAL;
  const pWildColumn = FULL_WILD_WEIGHT / COLUMN_TOKEN_TOTAL;
  const columnDist: number[] = [0, 0, 0, 0];
  for (let k = 0; k <= 3; k++) {
    const binom = [1, 3, 3, 1][k] as number;
    columnDist[k] =
      pFree * binom * pJackpotCell ** k * (1 - pJackpotCell) ** (3 - k) +
      (k === 0 ? pWildColumn : 0);
  }
  let jackpotDistribution: number[] = [1];
  for (let c = 0; c < 5; c++) {
    const next = new Array<number>(jackpotDistribution.length + 3).fill(0);
    jackpotDistribution.forEach((p, k) => {
      columnDist.forEach((q, j) => {
        next[k + j] = (next[k + j] as number) + p * q;
      });
    });
    jackpotDistribution = next;
  }
  while (jackpotDistribution.length < 16) jackpotDistribution.push(0);

  const jackpotTriggerRate = jackpotDistribution.slice(3).reduce((a, b) => a + b, 0);
  // Scatter pays in total-bet multiples, so its RTP contribution is direct.
  const scatterRtp = jackpotDistribution.reduce(
    (sum, p, count) => sum + (p * scatterPayHundredths(count)) / 100,
    0
  );

  // totalBet = activeLines x lineBet, so the line part contributes exactly
  // activeLines x lineRtp x lineBet / totalBet = lineRtp.
  const totalRtp = lineRtp + scatterRtp;

  // --- Seeded Monte Carlo sanity estimates for spin-level metrics ---
  // Line bet 100 matches the standalone game's audit run so the committed
  // expectations stay comparable after the 5x bet rescale (RTP is a ratio and
  // does not depend on the bet).
  const source = createSeededSource(0x5eed_c0de);
  const lineBet = 100n;
  const totalBet = lineBet * BigInt(SLOT_MATH_CONFIG.activeLines);
  let mcHits = 0;
  let mcProfits = 0;
  let mcPushes = 0;
  let mcPaid = 0n;
  for (let i = 0; i < mcSpins; i++) {
    const evaluation = evaluateSpin(generateGrid(source), 100);
    if (evaluation.totalWin > 0n) mcHits += 1;
    if (evaluation.totalWin > totalBet) mcProfits += 1;
    if (evaluation.totalWin === totalBet) mcPushes += 1;
    mcPaid += evaluation.totalWin;
  }

  return {
    lineFamilies,
    lineFamilyRtp,
    lineHitRate,
    lineRtp,
    maxLineWinLineBetMultiple: maxLinePay / 100,
    jackpotDistribution,
    jackpotTriggerRate,
    scatterRtp,
    totalRtp,
    houseEdge: 1 - totalRtp,
    mcSpins,
    mcHitRate: mcHits / mcSpins,
    mcProfitRate: mcProfits / mcSpins,
    mcPushRate: mcPushes / mcSpins,
    mcRtp: Number(mcPaid) / (Number(totalBet) * mcSpins)
  };
}
