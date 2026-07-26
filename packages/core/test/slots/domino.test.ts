import { describe, expect, it } from "vitest";

import {
  DOMINO_IDS,
  createDominoId,
  createDoubleSixSet,
  getDominoRank,
  getDominoTier,
  isAceDomino,
  isDomino,
  isTrumpDomino
} from "../../src/slots/index";

describe("double six set", () => {
  it("contains exactly the 28 canonical ids", () => {
    const ids = createDoubleSixSet();
    expect(ids).toHaveLength(28);
    expect(new Set(ids).size).toBe(28);
    for (const id of ids) {
      const [a, b] = id.split("-").map(Number);
      expect(a).toBeLessThanOrEqual(b as number);
    }
  });

  it("ranks form a 1..28 bijection", () => {
    const ranks = DOMINO_IDS.map(getDominoRank).sort((x, y) => x - y);
    expect(ranks).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  });

  it("matches the fixed strength table from docs/01", () => {
    expect(getDominoRank(createDominoId(0, 0))).toBe(1);
    expect(getDominoRank(createDominoId(1, 1))).toBe(2);
    expect(getDominoRank(createDominoId(1, 6))).toBe(3);
    expect(getDominoRank(createDominoId(0, 1))).toBe(8);
    expect(getDominoRank(createDominoId(6, 6))).toBe(9);
    expect(getDominoRank(createDominoId(0, 6))).toBe(14);
    expect(getDominoRank(createDominoId(5, 6))).toBe(15);
    expect(getDominoRank(createDominoId(0, 2))).toBe(28);
  });

  it("assigns tiers by rank boundaries", () => {
    expect(getDominoTier(createDominoId(0, 0))).toBe("royal-trump");
    expect(getDominoTier(createDominoId(1, 4))).toBe("high-trump");
    expect(getDominoTier(createDominoId(0, 1))).toBe("low-trump");
    expect(getDominoTier(createDominoId(0, 6))).toBe("ace");
    expect(getDominoTier(createDominoId(3, 5))).toBe("high-regular");
    expect(getDominoTier(createDominoId(2, 3))).toBe("mid-regular");
    expect(getDominoTier(createDominoId(0, 2))).toBe("low-regular");
  });

  it("trump and ace groups have 8 and 6 members", () => {
    expect(DOMINO_IDS.filter(isTrumpDomino)).toHaveLength(8);
    expect(DOMINO_IDS.filter(isAceDomino)).toHaveLength(6);
  });
});

describe("createDominoId", () => {
  it("normalises pip order", () => {
    expect(createDominoId(6, 0)).toBe("0-6");
    expect(createDominoId(1, 0)).toBe("0-1");
  });

  it("rejects out-of-range pips", () => {
    expect(() => createDominoId(-1, 3)).toThrow();
    expect(() => createDominoId(0, 7)).toThrow();
    expect(() => createDominoId(1.5, 2)).toThrow();
  });

  it("isDomino distinguishes dominoes from specials", () => {
    expect(isDomino(createDominoId(3, 4))).toBe(true);
    expect(isDomino("WILD")).toBe(false);
    expect(isDomino("JACKPOT")).toBe(false);
  });
});
