import { describe, expect, it } from "vitest";

import {
  CELL_SYMBOL_WEIGHTS,
  CELL_TICKETS,
  CELL_TICKET_TOTAL,
  COLUMN_TOKEN_TOTAL,
  DOMINO_CELL_WEIGHT,
  DOMINO_IDS,
  FULL_WILD_WEIGHT,
  MATH_CONFIG_VALID
} from "../../src/slots/index";

describe("math config", () => {
  it("is valid at module load", () => {
    expect(MATH_CONFIG_VALID).toBe(true);
  });

  it("cell weights sum to 124 and full wild is 4 of 128", () => {
    const sum = [...CELL_SYMBOL_WEIGHTS.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBe(CELL_TICKET_TOTAL);
    expect(CELL_TICKET_TOTAL).toBe(124);
    expect(FULL_WILD_WEIGHT).toBe(4);
    expect(COLUMN_TOKEN_TOTAL).toBe(128);
  });

  it("every domino appears exactly once with weight 3", () => {
    for (const id of DOMINO_IDS) {
      expect(CELL_SYMBOL_WEIGHTS.get(id)).toBe(DOMINO_CELL_WEIGHT);
    }
    expect(CELL_TICKETS.filter((s) => s === DOMINO_IDS[0])).toHaveLength(3);
  });

  it("special weights match docs/01 section 4.1", () => {
    expect(CELL_SYMBOL_WEIGHTS.get("VASE")).toBe(9);
    expect(CELL_SYMBOL_WEIGHTS.get("SCROLL")).toBe(8);
    expect(CELL_SYMBOL_WEIGHTS.get("BOOK")).toBe(7);
    expect(CELL_SYMBOL_WEIGHTS.get("SCARAB")).toBe(6);
    expect(CELL_SYMBOL_WEIGHTS.get("WILD")).toBe(7);
    expect(CELL_SYMBOL_WEIGHTS.get("JACKPOT")).toBe(3);
    expect(CELL_TICKETS).toHaveLength(124);
  });
});
