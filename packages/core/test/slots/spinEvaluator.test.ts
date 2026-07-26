import { describe, expect, it } from "vitest";

import {
  ACE_COMBO_PAY,
  ALL_WILD_PAY,
  EXACT_PAY_HUNDREDTHS,
  MAJOR_BOOST_HUNDREDTHS,
  PAYLINES,
  SLOT_MATH_CONFIG,
  TIER_COMBO_PAY,
  TRUMP_COMBO_PAY,
  createDominoId,
  evaluateSpin,
  lineOfPattern,
  multiplyByHundredths,
  type Grid,
  type GridCell,
  type GridRow,
  type LineBet,
  type SymbolId
} from "../../src/slots/index";

const cell = (symbol: SymbolId, fromFullWildColumn = false): GridCell => ({
  symbol,
  fromFullWildColumn
});

function gridOf(rows: SymbolId[][]): Grid {
  return rows.map((row) => row.map((s) => cell(s)) as unknown as GridRow) as unknown as Grid;
}

const D = createDominoId;
const LINES = BigInt(SLOT_MATH_CONFIG.activeLines);

describe("evaluateSpin (math v3: 11 lines)", () => {
  it("evaluates one outcome per payline", () => {
    const grid = gridOf([
      ["VASE", "VASE", "VASE", "VASE", "VASE"],
      ["VASE", "VASE", "VASE", "VASE", "VASE"],
      ["VASE", "VASE", "VASE", "VASE", "VASE"]
    ]);
    const spin = evaluateSpin(grid, 100);
    expect(spin.lines).toHaveLength(PAYLINES.length);
    expect(spin.totalBet).toBe(100n * LINES);
    expect(spin.totalWin).toBe(0n);
    spin.lines.forEach((line, index) => expect(line.lineIndex).toBe(index));
  });

  it("five full wild columns pay the top all wild on every line", () => {
    const wildRow: SymbolId[] = ["WILD_FULL", "WILD_FULL", "WILD_FULL", "WILD_FULL", "WILD_FULL"];
    const spin = evaluateSpin(gridOf([wildRow, wildRow, wildRow]), 100);
    for (const line of spin.lines) {
      expect(line.multiplierHundredths).toBe(ALL_WILD_PAY[2]);
      expect(line.winCoins).toBe(multiplyByHundredths(100n, ALL_WILD_PAY[2]));
    }
    expect(spin.jackpotCount).toBe(0);
    expect(spin.scatterWin).toBe(0n);
    expect(spin.totalWin).toBe(multiplyByHundredths(100n, ALL_WILD_PAY[2]) * LINES);
  });

  it("scatter win adds to line wins", () => {
    const grid = gridOf([
      ["JACKPOT", "VASE", "VASE", "JACKPOT", "VASE"],
      ["VASE", "VASE", "VASE", "VASE", "VASE"],
      ["VASE", "VASE", "VASE", "VASE", "JACKPOT"]
    ]);
    const spin = evaluateSpin(grid, 100);
    expect(spin.jackpotCount).toBe(3);
    expect(spin.scatterWin).toBe(5n * 100n * LINES); // 5x total bet
    expect(spin.lines.every((line) => line.winCoins === 0n)).toBe(true);
    expect(spin.totalWin).toBe(spin.scatterWin);
  });

  it("a middle-row floating run wins on the middle payline", () => {
    const grid = gridOf([
      ["VASE", "VASE", "VASE", "VASE", "VASE"],
      ["JACKPOT", D(1, 6), D(1, 5), D(1, 4), "JACKPOT"],
      ["VASE", "VASE", "VASE", "VASE", "VASE"]
    ]);
    const spin = evaluateSpin(grid, 100);
    const middle = spin.lines[1]!;
    expect(middle).toMatchObject({
      lineIndex: 1,
      category: "TRUMP_COMBO",
      startColumn: 1,
      length: 3
    });
    expect(middle.winCoins).toBe(multiplyByHundredths(100n, TRUMP_COMBO_PAY[0]));
  });

  it("lineOfPattern reads the cells of a bending payline", () => {
    const grid = gridOf([
      [D(0, 1), "VASE", "WILD", "SCROLL", D(0, 2)],
      ["BOOK", D(2, 3), "JACKPOT", D(2, 4), "SCARAB"],
      ["WILD", "VASE", D(5, 5), "BOOK", "WILD"]
    ]);
    // Payline 3 is the V pattern [0,1,2,1,0].
    expect(lineOfPattern(grid, 3)).toEqual([D(0, 1), D(2, 3), D(5, 5), D(2, 4), D(0, 2)]);
  });

  it("scales the total bet with the configured line bet", () => {
    const wildRow: SymbolId[] = ["WILD_FULL", "WILD_FULL", "WILD_FULL", "WILD_FULL", "WILD_FULL"];
    for (const bet of SLOT_MATH_CONFIG.lineBetSteps) {
      const spin = evaluateSpin(gridOf([wildRow, wildRow, wildRow]), bet);
      expect(spin.totalBet).toBe(BigInt(bet) * LINES);
      expect(spin.totalWin).toBe(multiplyByHundredths(BigInt(bet), ALL_WILD_PAY[2]) * LINES);
    }
  });
});

describe("money integrality (docs/01 invariants, math v3)", () => {
  it("every base pay boosted by any major sum stays a whole coin amount", () => {
    const triplets = [
      ...Object.values(EXACT_PAY_HUNDREDTHS),
      ...Object.values(TIER_COMBO_PAY),
      ACE_COMBO_PAY,
      TRUMP_COMBO_PAY,
      ALL_WILD_PAY
    ];
    const boosts = Object.values(MAJOR_BOOST_HUNDREDTHS);
    // Every subset sum of up to 4 boosters (with repetition) is a multiple of
    // 50, so sweeping 0..sum(max)x50 in 50-steps covers all reachable sums.
    const maxBoost = 4 * Math.max(...boosts);
    for (const bet of SLOT_MATH_CONFIG.lineBetSteps as readonly LineBet[]) {
      for (const triplet of triplets) {
        for (const hundredths of triplet) {
          for (let boost = 0; boost <= maxBoost; boost += 50) {
            const boosted = (hundredths * (100 + boost)) / 100;
            expect(Number.isInteger(boosted)).toBe(true);
            expect(() => multiplyByHundredths(BigInt(bet), boosted)).not.toThrow();
          }
        }
      }
    }
  });

  it("rejects a multiplier that does not divide into whole coins", () => {
    expect(() => multiplyByHundredths(101n, 133)).toThrow();
  });
});
