import { describe, expect, it } from "vitest";

import {
  countJackpots,
  createDominoId,
  evaluateScatter,
  type Grid,
  type GridCell,
  type GridRow,
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

describe("countJackpots", () => {
  it("counts scatters anywhere in the grid", () => {
    const grid = gridOf([
      ["JACKPOT", D(0, 1), D(2, 3), "JACKPOT", "VASE"],
      [D(1, 1), "JACKPOT", D(4, 5), D(0, 6), "BOOK"],
      ["SCROLL", D(3, 3), D(5, 6), D(2, 6), "JACKPOT"]
    ]);
    expect(countJackpots(grid)).toBe(4);
  });

  it("wild and full wild are never counted as scatter", () => {
    const grid = gridOf([
      ["WILD_FULL", "WILD", D(2, 3), D(0, 1), "VASE"],
      ["WILD_FULL", "WILD", D(4, 5), D(0, 6), "BOOK"],
      ["WILD_FULL", "WILD", D(5, 6), D(2, 6), "SCROLL"]
    ]);
    expect(countJackpots(grid)).toBe(0);
  });
});

describe("evaluateScatter (docs/01 section 6)", () => {
  it.each([
    [0, 0n],
    [1, 0n],
    [2, 0n],
    [3, 1500n],
    [4, 7500n],
    [5, 30000n],
    [6, 30000n],
    [15, 30000n]
  ])("%i jackpots pay %s at total bet 300", (count, expected) => {
    expect(evaluateScatter(count, 300n)).toBe(expected);
  });

  it("scales with the total bet", () => {
    expect(evaluateScatter(3, 3000n)).toBe(15000n);
    expect(evaluateScatter(5, 3000n)).toBe(300000n);
  });
});
