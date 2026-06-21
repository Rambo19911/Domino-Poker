import { describe, expect, it } from "vitest";

import { chestForPot } from "../lib/mp/potChest";

describe("chestForPot", () => {
  it("maps each threshold to the expected chest (base + ceiling)", () => {
    expect(chestForPot(0)).toContain("suitcase0");
    expect(chestForPot(19_999)).toContain("suitcase0");
    expect(chestForPot(20_000)).toContain("suitcase1");
    expect(chestForPot(29_999)).toContain("suitcase1");
    expect(chestForPot(30_000)).toContain("suitcase2");
    expect(chestForPot(40_000)).toContain("chest1");
    expect(chestForPot(49_999)).toContain("chest1");
    expect(chestForPot(50_000)).toContain("chest2");
  });

  it("caps very large pots at the top chest", () => {
    expect(chestForPot(1_000_000_000)).toContain("chest2");
  });

  it("always returns a valid asset path", () => {
    for (const pot of [1, 100, 25_000, 45_000, 999_999]) {
      expect(chestForPot(pot)).toMatch(/^\/assets\/chests\/.+\.png$/);
    }
  });
});
