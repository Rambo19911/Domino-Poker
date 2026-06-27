import { describe, expect, it } from "vitest";

import { RANKED_BADGE_LIMIT, rankToBadge } from "../src/leaderboard.js";

describe("rankToBadge", () => {
  it("maps each top rank 1:1 to its own rank icon", () => {
    expect(rankToBadge(1)).toBe("rank_1");
    expect(rankToBadge(2)).toBe("rank_2");
    expect(rankToBadge(3)).toBe("rank_3");
    expect(rankToBadge(10)).toBe("rank_10");
  });

  it("assigns a badge up to (and including) the limit", () => {
    expect(rankToBadge(RANKED_BADGE_LIMIT)).toBe(`rank_${RANKED_BADGE_LIMIT}`);
    expect(rankToBadge(30)).toBe("rank_30");
  });

  it("returns null beyond the badge limit (no badge)", () => {
    expect(rankToBadge(RANKED_BADGE_LIMIT + 1)).toBeNull();
    expect(rankToBadge(31)).toBeNull();
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
