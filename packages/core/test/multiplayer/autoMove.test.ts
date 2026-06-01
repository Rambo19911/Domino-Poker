import { describe, expect, it } from "vitest";

import {
  createTile,
  selectAITile,
  selectNumber,
  tileEquals,
  type DominoTile,
  type Player
} from "../../src";
import {
  applyCommand,
  autoMove,
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
    seed: "auto-move-seed",
    dealerIndex: 0
  });
  const players = setup.state.players.map((player, index): Player => ({
    ...player,
    hand: hands[index] ?? [],
    bid: 0,
    tricksWon: 0
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

function createPlayingGame(seed = "auto-move-full-game-seed"): MultiplayerGameState {
  let state = createGame(seed);
  for (let bidIndex = 0; bidIndex < state.coreState.players.length; bidIndex += 1) {
    const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex]!;
    const turnResult = applyCommand(state, {
      type: "START_TURN",
      gameId: state.gameId,
      requestId: `request-start-bid-${seed}-${bidIndex}`,
      turnId: `bid-turn-${bidIndex}`,
      now: 1000 + bidIndex
    });
    if (!turnResult.nextState) {
      throw new Error("Expected bid turn to start.");
    }

    const bidResult = applyCommand(turnResult.nextState, {
      type: "SUBMIT_BID",
      gameId: state.gameId,
      requestId: `request-submit-bid-${seed}-${bidIndex}`,
      playerId: currentPlayer.id,
      turnId: `bid-turn-${bidIndex}`,
      now: 1000 + bidIndex,
      bid: 0
    });
    if (!bidResult.nextState) {
      throw new Error("Expected bid to be accepted.");
    }
    state = bidResult.nextState;
  }

  return state;
}

function createGame(seed: string): MultiplayerGameState {
  const result = applyCommand(undefined, {
    type: "CREATE_GAME",
    gameId: "game-1",
    requestId: `request-create-${seed}`,
    seed
  });

  if (!result.nextState) {
    throw new Error("Expected multiplayer game to be created.");
  }

  return result.nextState;
}

function currentPlayer(state: MultiplayerGameState) {
  return state.coreState.players[state.coreState.currentPlayerIndex]!;
}

describe("autoMove", () => {
  it("returns a legal move selected by the AI tile heuristic for the current player", () => {
    const state = createPlayingGame();
    const player = currentPlayer(state);
    const result = autoMove(state, player.id);

    expect(result).toBeDefined();
    expect(result?.playerId).toBe(player.id);
    expect(legalMoves(state, player.id)).toContainEqual({
      tile: result!.tile,
      ...(result!.declaredNumber !== undefined
        ? { declaredNumber: result!.declaredNumber }
        : {})
    });
    expect(tileEquals(result!.tile, selectAITile(player, state.coreState))).toBe(true);
  });

  it("uses the deterministic AI number declaration when the selected lead tile has two legal declarations", () => {
    const state = createStateWithHands([
      [tile(2, 5), tile(0, 0), tile(6, 6)],
      [],
      [],
      []
    ]);
    const player = currentPlayer(state);
    const result = autoMove(state, player.id);

    expect(result).toEqual({
      playerId: player.id,
      tile: tile(2, 5),
      declaredNumber: selectNumber(tile(2, 5), player)
    });
  });

  it("returns undefined for a non-current player", () => {
    const state = createStateWithHands([[tile(2, 5)], [tile(2, 4)], [], []]);

    expect(autoMove(state, "2")).toBeUndefined();
  });

  it("returns undefined outside playing phase", () => {
    const state = createStateWithHands([[tile(2, 5)], [], [], []]);
    const player = currentPlayer(state);

    expect(
      autoMove(
        {
          ...state,
          coreState: {
            ...state.coreState,
            phase: "bidding"
          }
        },
        player.id
      )
    ).toBeUndefined();
  });

  it("does not let hidden opponent hands change the selected auto move", () => {
    const visibleState = createStateWithHands([
      [tile(2, 5), tile(0, 0), tile(6, 6)],
      [tile(2, 4)],
      [tile(3, 4)],
      [tile(4, 5)]
    ]);
    const changedOpponentHands = createStateWithHands([
      [tile(2, 5), tile(0, 0), tile(6, 6)],
      [tile(0, 1), tile(1, 1), tile(1, 2)],
      [tile(1, 3), tile(1, 4), tile(1, 5)],
      [tile(1, 6), tile(2, 2), tile(3, 3)]
    ]);
    const player = currentPlayer(visibleState);

    expect(autoMove(visibleState, player.id)).toEqual(
      autoMove(changedOpponentHands, player.id)
    );
  });

  it("returns the same move for the same seed and state", () => {
    const state = createPlayingGame("stable-auto-move-seed");
    const repeat = createPlayingGame("stable-auto-move-seed");
    const player = currentPlayer(state);
    const repeatPlayer = currentPlayer(repeat);

    expect(autoMove(state, player.id)).toEqual(autoMove(repeat, repeatPlayer.id));
  });
});
