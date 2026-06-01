import { describe, expect, it } from "vitest";

import {
  applyCommand,
  legalBids,
  type MultiplayerGameState
} from "../../src/multiplayer";

function createGame(): MultiplayerGameState {
  const result = applyCommand(undefined, {
    type: "CREATE_GAME",
    gameId: "game-1",
    requestId: "request-1",
    seed: "legal-bids-seed"
  });

  if (!result.nextState) {
    throw new Error("Expected test game state to be created.");
  }

  return result.nextState;
}

describe("legalBids", () => {
  it("returns all core-accepted bids for the current bidding player", () => {
    const state = createGame();
    const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex]!;

    expect(legalBids(state, currentPlayer.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns no bids for a non-current player", () => {
    const state = createGame();
    const nonCurrentPlayer = state.coreState.players.find(
      (_, index) => index !== state.coreState.currentPlayerIndex
    )!;

    expect(legalBids(state, nonCurrentPlayer.id)).toEqual([]);
  });

  it("returns no bids outside the bidding phase", () => {
    const state = createGame();
    const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex]!;

    expect(
      legalBids(
        {
          ...state,
          coreState: {
            ...state.coreState,
            phase: "playing"
          }
        },
        currentPlayer.id
      )
    ).toEqual([]);
  });
});
