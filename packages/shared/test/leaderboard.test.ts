import { describe, expect, it } from "vitest";

import { rankToBadge } from "../src/leaderboard.js";

describe("rankToBadge", () => {
  it("maps the exact top ranks to trophy badges", () => {
    expect(rankToBadge(1)).toBe("Trophy-11");
    expect(rankToBadge(2)).toBe("Trophy-10");
    expect(rankToBadge(3)).toBe("Trophy-9");
  });

  it("maps the trophy tiers at their boundaries", () => {
    expect(rankToBadge(4)).toBe("Trophy-8");
    expect(rankToBadge(5)).toBe("Trophy-8");
    expect(rankToBadge(6)).toBe("Trophy-7");
    expect(rankToBadge(10)).toBe("Trophy-7");
  });

  it("maps the level tiers at every 10-rank boundary", () => {
    expect(rankToBadge(11)).toBe("badge-level-1");
    expect(rankToBadge(20)).toBe("badge-level-1");
    expect(rankToBadge(21)).toBe("badge-level-2");
    expect(rankToBadge(30)).toBe("badge-level-2");
    expect(rankToBadge(31)).toBe("badge-level-3");
    expect(rankToBadge(40)).toBe("badge-level-3");
    expect(rankToBadge(41)).toBe("badge-level-4");
    expect(rankToBadge(50)).toBe("badge-level-4");
    expect(rankToBadge(51)).toBe("badge-level-5");
    expect(rankToBadge(60)).toBe("badge-level-5");
    expect(rankToBadge(61)).toBe("badge-level-6");
    expect(rankToBadge(70)).toBe("badge-level-6");
  });

  it("returns null beyond rank 70 (no badge)", () => {
    expect(rankToBadge(71)).toBeNull();
    expect(rankToBadge(100)).toBeNull();
    expect(rankToBadge(10_000)).toBeNull();
  });

  it("returns null for invalid ranks", () => {
    expect(rankToBadge(0)).toBeNull();
    expect(rankToBadge(-1)).toBeNull();
    expect(rankToBadge(1.5)).toBeNull();
    expect(rankToBadge(Number.NaN)).toBeNull();
    expect(rankToBadge(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
