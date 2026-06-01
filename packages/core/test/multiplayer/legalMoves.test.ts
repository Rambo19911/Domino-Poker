import { describe, expect, it } from "vitest";

import { createTile, type DominoTile, type Player } from "../../src";
import {
  applyCommand,
  createInitialMultiplayerGameState,
  createMultiplayerGameSetup,
  legalMoves,
  type MultiplayerGameState
} from "../../src/multiplayer";

const tile = createTile;

function createStateWithHands(
  hands: readonly (readonly DominoTile[])[]
): MultiplayerGameState {
  const setup = createMultiplayerGameSetup({
    gameId: "game-1",
    seed: "legal-moves-seed",
    dealerIndex: 0
  });
  const players = setup.state.players.map((player, index): Player => ({
    ...player,
    hand: hands[index] ?? [],
    bid: 0
  }));

  return {
    ...createInitialMultiplayerGameState(setup),
    coreState: {
      ...setup.state,
      players,
      phase: "playing",
      currentPlayerIndex: 0,
      currentTrick: [],
      completedTricks: [],
      trickWinners: [],
      trickValidations: [],
      leadTile: undefined,
      requiredNumber: undefined,
      isTrumpLead: false,
      isAceLead: false
    }
  };
}

describe("legalMoves", () => {
  it("returns no moves outside the playing phase", () => {
    const state = createStateWithHands([[tile(2, 3)], [], [], []]);

    expect(
      legalMoves(
        {
          ...state,
          coreState: {
            ...state.coreState,
            phase: "bidding"
          }
        },
        "1"
      )
    ).toEqual([]);
  });

  it("returns no moves for a non-current player", () => {
    const state = createStateWithHands([[tile(2, 3)], [tile(2, 4)], [], []]);

    expect(legalMoves(state, "2")).toEqual([]);
  });

  it("expands lead declarations for non-trump non-double tiles", () => {
    const state = createStateWithHands([[tile(2, 5), tile(0, 0), tile(6, 6)], [], [], []]);

    expect(legalMoves(state, "1")).toEqual([
      { tile: tile(2, 5), declaredNumber: 2 },
      { tile: tile(2, 5), declaredNumber: 5 },
      { tile: tile(0, 0) },
      { tile: tile(6, 6) }
    ]);
  });

  it("returns only moves allowed by the active trick context", () => {
    const state = createStateWithHands([
      [tile(2, 5)],
      [tile(2, 4), tile(3, 4), tile(1, 2)],
      [],
      []
    ]);
    const turnResult = applyCommand(state, {
      type: "START_TURN",
      gameId: state.gameId,
      requestId: "request-start-lead",
      turnId: "lead-turn",
      now: 1000
    });
    const leadResult = applyCommand(turnResult.nextState!, {
      type: "SUBMIT_MOVE",
      gameId: state.gameId,
      requestId: "request-submit-lead",
      playerId: "1",
      turnId: "lead-turn",
      now: 1000,
      tile: tile(2, 5),
      declaredNumber: 2
    });

    expect(leadResult.errors).toEqual([]);
    const stateAfterLead = leadResult.nextState!;

    expect(stateAfterLead.coreState.currentPlayerIndex).toBe(1);
    expect(stateAfterLead.coreState.requiredNumber).toBe(2);

    expect(legalMoves(stateAfterLead, "2")).toEqual([{ tile: tile(2, 4) }]);
  });
});

