// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { GameState } from "@domino-poker/core";

import { GameEndDialog } from "../components/GameDialogs";
import { getAppStrings } from "../lib/i18n";
import type { AudioSettings } from "../lib/useAudioSettings";

afterEach(cleanup);

const t = getAppStrings("en");
const audio = { play: () => undefined } as unknown as AudioSettings;

// Atšķirīgi totalScore → getStandings/getWinner nelieto tiebreakerus, tāpēc minimāls
// GameState ir pietiekams šim UI testam.
const gameState = {
  phase: "gameEnd",
  players: [
    { id: "1", name: "You", isAI: false, totalScore: 30 },
    { id: "2", name: "Bot A", isAI: true, totalScore: 20 },
    { id: "3", name: "Bot B", isAI: true, totalScore: 10 },
    { id: "4", name: "Bot C", isAI: true, totalScore: 5 }
  ]
} as unknown as GameState;

describe("GameEndDialog SP reward banner", () => {
  it("shows the '+N' reward banner when an award was granted", () => {
    const { baseElement } = render(
      <GameEndDialog gameState={gameState} audio={audio} labels={t} spAward={300} onClose={() => {}} />
    );
    const reward = baseElement.querySelector(".gameEndReward");
    expect(reward).not.toBeNull();
    expect(reward?.querySelector(".gameEndRewardValue")?.textContent).toBe("+300");
  });

  it("hides the banner when no award (null)", () => {
    const { baseElement } = render(
      <GameEndDialog gameState={gameState} audio={audio} labels={t} spAward={null} onClose={() => {}} />
    );
    expect(baseElement.querySelector(".gameEndReward")).toBeNull();
  });

  it("hides the banner when the award is zero (capped / too fast / not eligible)", () => {
    const { baseElement } = render(
      <GameEndDialog gameState={gameState} audio={audio} labels={t} spAward={0} onClose={() => {}} />
    );
    expect(baseElement.querySelector(".gameEndReward")).toBeNull();
  });

  it("renders a place-award GIF per row, ranked by score (top row = 1st place)", () => {
    const { baseElement } = render(
      <GameEndDialog gameState={gameState} audio={audio} labels={t} spAward={300} onClose={() => {}} />
    );
    const rows = baseElement.querySelectorAll(".finalScores > div");
    expect(rows).toHaveLength(4);
    // Augstākais totalScore (You, 30) ir 1. rindā ar winner-number-1 GIF.
    expect(rows[0]?.querySelector("dt")?.textContent).toBe("You");
    expect(rows[0]?.querySelector("img.finalScorePlace")?.getAttribute("src")).toContain(
      "winner-number-1"
    );
    expect(rows[3]?.querySelector("img.finalScorePlace")?.getAttribute("src")).toContain(
      "winner-number-4"
    );
  });
});
