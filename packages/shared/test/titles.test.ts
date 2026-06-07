import { describe, expect, it } from "vitest";

import { isLoser, titleForWins, winRatePercent } from "../src/titles.js";

describe("MP titles", () => {
  it("maps wins to the highest reached title tier", () => {
    expect(titleForWins(0)).toBe("mushroom");
    expect(titleForWins(1)).toBe("student");
    expect(titleForWins(9)).toBe("student");
    expect(titleForWins(10)).toBe("amateur");
    expect(titleForWins(24)).toBe("amateur");
    expect(titleForWins(25)).toBe("strategist");
    expect(titleForWins(50)).toBe("champion");
    expect(titleForWins(100)).toBe("king");
    expect(titleForWins(249)).toBe("king");
    expect(titleForWins(250)).toBe("universeGod");
    expect(titleForWins(1000)).toBe("universeGod");
  });

  it("computes win rate as a rounded percentage; 0 with no games", () => {
    expect(winRatePercent(0, 0)).toBe(0);
    expect(winRatePercent(7, 3)).toBe(70);
    expect(winRatePercent(1, 2)).toBe(33);
    expect(winRatePercent(5, 0)).toBe(100);
  });

  it("flags Lūzers only at >=20 games and <25% win rate", () => {
    expect(isLoser(2, 8)).toBe(false); // 20% bet tikai 10 spēles
    expect(isLoser(4, 16)).toBe(true); // 20 spēles, 20% < 25%
    expect(isLoser(5, 15)).toBe(false); // 20 spēles, tieši 25% — nav < 25
    expect(isLoser(10, 30)).toBe(false); // 40 spēles, 25%
    expect(isLoser(3, 22)).toBe(true); // 25 spēles, 12%
    expect(isLoser(0, 0)).toBe(false);
  });
});
