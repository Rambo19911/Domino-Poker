import { describe, expect, it } from "vitest";

import { makeAIBid } from "../../src/aiService";
import {
  applyCommand,
  autoBid,
  legalBids,
  type MultiplayerGameState
} from "../../src/multiplayer";

function createGame(seed = "auto-bid-seed"): MultiplayerGameState {
  const result = applyCommand(undefined, {
    type: "CREATE_GAME",
    gameId: "game-1",
    requestId: `request-${seed}`,
    seed
  });

  if (!result.nextState) {
    throw new Error("Expected test game state to be created.");
  }

  return result.nextState;
}

function currentPlayer(state: MultiplayerGameState) {
  return state.coreState.players[state.coreState.currentPlayerIndex]!;
}

describe("autoBid", () => {
  it("returns the deterministic AI bid when it is legal for the current bidder", () => {
    const state = createGame();
    const player = currentPlayer(state);

    const result = autoBid(state, player.id);

    expect(result).toEqual({
      playerId: player.id,
      bid: makeAIBid(player)
    });
    expect(legalBids(state, player.id)).toContain(result?.bid);
  });

  it("returns undefined for a non-current player", () => {
    const state = createGame();
    const nonCurrentPlayer = state.coreState.players.find(
      (_, index) => index !== state.coreState.currentPlayerIndex
    )!;

    expect(autoBid(state, nonCurrentPlayer.id)).toBeUndefined();
  });

  it("returns undefined outside bidding phase", () => {
    const state = createGame();
    const player = currentPlayer(state);

    expect(
      autoBid(
        {
          ...state,
          coreState: {
            ...state.coreState,
            phase: "playing"
          }
        },
        player.id
      )
    ).toBeUndefined();
  });

  it("returns the same bid for the same seed and state", () => {
    const state = createGame("stable-auto-bid-seed");
    const repeat = createGame("stable-auto-bid-seed");
    const player = currentPlayer(state);
    const repeatPlayer = currentPlayer(repeat);

    expect(autoBid(state, player.id)).toEqual(autoBid(repeat, repeatPlayer.id));
  });
});
