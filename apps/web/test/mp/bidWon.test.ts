import { describe, expect, it } from "vitest";

import { bidWonColor } from "../../lib/mp/bidWon";

describe("bidWonColor", () => {
  it("returns matched (green) when tricks won equals the bid", () => {
    expect(bidWonColor(2, 2)).toBe("matched");
    expect(bidWonColor(0, 0)).toBe("matched");
  });

  it("returns over (red) when tricks won exceeds the bid", () => {
    expect(bidWonColor(2, 3)).toBe("over");
    expect(bidWonColor(0, 1)).toBe("over");
  });

  it("returns neutral when under the bid or before bidding", () => {
    expect(bidWonColor(3, 1)).toBe(""); // mazāk par solīto
    expect(bidWonColor(-1, 0)).toBe(""); // vēl nav solīts (bid < 0)
    expect(bidWonColor(-1, 2)).toBe("");
  });
});
