import { describe, expect, it } from "vitest";

import {
  applyCommand,
  assertInvariants,
  legalBids,
  legalMoves,
  type MultiplayerGameState
} from "../../src/multiplayer";

interface GameResultSummary {
  readonly phase: string;
  readonly currentRound: number;
  readonly eventSeq: number;
  readonly lastRoundWinnerIndex?: number | undefined;
  readonly players: readonly {
    readonly id: string;
    readonly bid: number;
    readonly tricksWon: number;
    readonly totalScore: number;
  }[];
  readonly trickWinners: readonly number[];
}

function createGame(seed = "phase-flow-seed"): MultiplayerGameState {
  const result = applyCommand(undefined, {
    type: "CREATE_GAME",
    gameId: "game-1",
    requestId: "request-create",
    seed,
    numberOfRounds: 1
  });

  if (!result.nextState) {
    throw new Error("Expected multiplayer game to be created.");
  }

  return result.nextState;
}

function playOneRoundGame(seed = "phase-flow-seed"): {
  readonly finalState: MultiplayerGameState;
  readonly observedPhases: readonly string[];
} {
  let state = createGame(seed);
  const observedPhases = [state.coreState.phase];

  for (let bidIndex = 0; bidIndex < state.coreState.players.length; bidIndex += 1) {
    state = submitBid(state, bidIndex);
    observedPhases.push(state.coreState.phase);
  }

  for (let moveIndex = 0; state.coreState.phase === "playing"; moveIndex += 1) {
    state = submitMove(state, 100 + moveIndex);
    if (moveIndex > 28) {
      throw new Error("Expected one round to finish within 28 moves.");
    }
  }

  observedPhases.push(state.coreState.phase);

  const gameEndResult = applyCommand(state, {
    type: "START_NEXT_ROUND",
    gameId: state.gameId,
    requestId: "request-game-end"
  });

  if (!gameEndResult.nextState) {
    throw new Error("Expected gameEnd transition to succeed.");
  }

  observedPhases.push(gameEndResult.nextState.coreState.phase);
  assertInvariants(gameEndResult.nextState);

  return {
    finalState: gameEndResult.nextState,
    observedPhases
  };
}

function summarizeResult(state: MultiplayerGameState): GameResultSummary {
  return {
    phase: state.coreState.phase,
    currentRound: state.coreState.currentRound,
    eventSeq: state.eventSeq,
    lastRoundWinnerIndex: state.coreState.lastRoundWinnerIndex,
    players: state.coreState.players.map((player) => ({
      id: player.id,
      bid: player.bid,
      tricksWon: player.tricksWon,
      totalScore: player.totalScore
    })),
    trickWinners: state.coreState.trickWinners
  };
}

function startTurn(
  state: MultiplayerGameState,
  action: "SUBMIT_BID" | "SUBMIT_MOVE",
  sequence: number
): MultiplayerGameState {
  const result = applyCommand(state, {
    type: "START_TURN",
    gameId: state.gameId,
    requestId: `request-start-${sequence}`,
    turnId: `turn-${sequence}`,
    now: sequence
  });

  if (!result.nextState) {
    throw new Error(`Expected ${action} turn to start.`);
  }

  return result.nextState;
}

function submitBid(state: MultiplayerGameState, sequence: number): MultiplayerGameState {
  const stateWithTurn = startTurn(state, "SUBMIT_BID", sequence);
  const currentPlayer =
    stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
  const bid = legalBids(stateWithTurn, currentPlayer.id)[0];
  if (bid === undefined) {
    throw new Error("Expected a legal bid.");
  }

  const result = applyCommand(stateWithTurn, {
    type: "SUBMIT_BID",
    gameId: state.gameId,
    requestId: `request-bid-${sequence}`,
    playerId: currentPlayer.id,
    turnId: `turn-${sequence}`,
    now: sequence,
    bid
  });

  if (!result.nextState) {
    throw new Error("Expected bid to be accepted.");
  }

  assertInvariants(result.nextState);
  return result.nextState;
}

function submitMove(state: MultiplayerGameState, sequence: number): MultiplayerGameState {
  const stateWithTurn = startTurn(state, "SUBMIT_MOVE", sequence);
  const currentPlayer =
    stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
  const move = legalMoves(stateWithTurn, currentPlayer.id)[0];
  if (!move) {
    throw new Error("Expected a legal move.");
  }

  const result = applyCommand(stateWithTurn, {
    type: "SUBMIT_MOVE",
    gameId: state.gameId,
    requestId: `request-move-${sequence}`,
    playerId: currentPlayer.id,
    turnId: `turn-${sequence}`,
    now: sequence,
    tile: move.tile,
    ...(move.declaredNumber !== undefined
      ? { declaredNumber: move.declaredNumber }
      : {})
  });

  if (!result.nextState) {
    throw new Error("Expected move to be accepted.");
  }

  assertInvariants(result.nextState);
  return result.nextState;
}

describe("multiplayer phase flow", () => {
  it("progresses through bidding, playing, roundEnd, and gameEnd via applyCommand", () => {
    const { observedPhases } = playOneRoundGame();

    expect(observedPhases).toContain("bidding");
    expect(observedPhases).toContain("playing");
    expect(observedPhases).toContain("roundEnd");
    expect(observedPhases).toContain("gameEnd");
    expect(observedPhases.indexOf("bidding")).toBeLessThan(
      observedPhases.indexOf("playing")
    );
    expect(observedPhases.indexOf("playing")).toBeLessThan(
      observedPhases.indexOf("roundEnd")
    );
    expect(observedPhases.indexOf("roundEnd")).toBeLessThan(
      observedPhases.indexOf("gameEnd")
    );
  });

  it("produces a deterministic result for a fixed seed", () => {
    const first = playOneRoundGame("fixed-result-seed");
    const second = playOneRoundGame("fixed-result-seed");

    expect(summarizeResult(first.finalState)).toEqual(
      summarizeResult(second.finalState)
    );
  });
});

