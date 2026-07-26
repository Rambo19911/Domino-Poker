import { describe, expect, it } from "vitest";

import {
  CELL_TICKETS,
  generateColumn,
  generateGrid,
  type RandomSource
} from "../../src/slots/index";

function sourceOf(values: number[]): RandomSource {
  let index = 0;
  return {
    nextUint32() {
      if (index >= values.length) throw new Error("source exhausted");
      return values[index++] as number;
    }
  };
}

describe("generateColumn", () => {
  it("column token below 4 produces a stacked full wild", () => {
    for (const token of [0, 1, 2, 3]) {
      const column = generateColumn(sourceOf([token]));
      expect(column.map((c) => c.symbol)).toEqual(["WILD_FULL", "WILD_FULL", "WILD_FULL"]);
      expect(column.every((c) => c.fromFullWildColumn)).toBe(true);
    }
  });

  it("column token 4 or above draws three independent cells", () => {
    const column = generateColumn(sourceOf([4, 0, 60, 123]));
    expect(column[0].symbol).toBe(CELL_TICKETS[0]);
    expect(column[1].symbol).toBe(CELL_TICKETS[60]);
    expect(column[2].symbol).toBe(CELL_TICKETS[123]);
    expect(column.every((c) => !c.fromFullWildColumn)).toBe(true);
  });
});

describe("generateGrid", () => {
  it("builds 3 rows by 5 independent columns", () => {
    const values = [
      0, // column 0: full wild
      4,
      0,
      1,
      2, // column 1
      4,
      3,
      4,
      5, // column 2
      4,
      6,
      7,
      8, // column 3
      4,
      9,
      10,
      11 // column 4
    ];
    const grid = generateGrid(sourceOf(values));
    expect(grid).toHaveLength(3);
    for (const row of grid) expect(row).toHaveLength(5);
    expect(grid[0][0].symbol).toBe("WILD_FULL");
    expect(grid[1][0].symbol).toBe("WILD_FULL");
    expect(grid[2][0].symbol).toBe("WILD_FULL");
    expect(grid[0][1].symbol).toBe(CELL_TICKETS[0]);
    expect(grid[1][1].symbol).toBe(CELL_TICKETS[1]);
    expect(grid[2][1].symbol).toBe(CELL_TICKETS[2]);
  });
});
