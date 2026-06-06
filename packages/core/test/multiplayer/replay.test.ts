import { describe, expect, it } from "vitest";

import {
  applyCommand,
  legalBids,
  legalMoves,
  replayEvents,
  type MultiplayerEvent,
  type MultiplayerGameState
} from "../../src/multiplayer";

const seed = "replay-seed";

function createGame(): MultiplayerGameState {
  const result = applyCommand(undefined, {
    type: "CREATE_GAME",
    gameId: "game-1",
    requestId: "request-create",
    seed
  });

  if (!result.nextState) {
    throw new Error("Expected multiplayer game to be created.");
  }

  return result.nextState;
}

function startTurn(
  state: MultiplayerGameState,
  turnId: string,
  now: number
): {
  readonly state: MultiplayerGameState;
  readonly events: readonly MultiplayerEvent[];
} {
  const result = applyCommand(state, {
    type: "START_TURN",
    gameId: state.gameId,
    requestId: `request-start-${turnId}`,
    turnId,
    now
  });

  if (!result.nextState) {
    throw new Error("Expected turn to start.");
  }

  return { state: result.nextState, events: result.events };
}

function submitBid(
  state: MultiplayerGameState,
  sequence: number
): {
  readonly state: MultiplayerGameState;
  readonly events: readonly MultiplayerEvent[];
} {
  const turnId = `bid-turn-${sequence}`;
  const started = startTurn(state, turnId, sequence);
  const currentPlayer =
    started.state.coreState.players[started.state.coreState.currentPlayerIndex]!;
  const bid = legalBids(started.state, currentPlayer.id)[0];
  if (bid === undefined) {
    throw new Error("Expected a legal bid.");
  }

  const result = applyCommand(started.state, {
    type: "SUBMIT_BID",
    gameId: started.state.gameId,
    requestId: `request-bid-${sequence}`,
    playerId: currentPlayer.id,
    turnId,
    now: sequence,
    bid
  });

  if (!result.nextState) {
    throw new Error("Expected bid to be accepted.");
  }

  return {
    state: result.nextState,
    events: [...started.events, ...result.events]
  };
}

function submitMove(
  state: MultiplayerGameState,
  sequence: number
): {
  readonly state: MultiplayerGameState;
  readonly events: readonly MultiplayerEvent[];
} {
  const turnId = `move-turn-${sequence}`;
  const started = startTurn(state, turnId, sequence);
  const currentPlayer =
    started.state.coreState.players[started.state.coreState.currentPlayerIndex]!;
  const move = legalMoves(started.state, currentPlayer.id)[0];
  if (!move) {
    throw new Error("Expected a legal move.");
  }

  const result = applyCommand(started.state, {
    type: "SUBMIT_MOVE",
    gameId: started.state.gameId,
    requestId: `request-move-${sequence}`,
    playerId: currentPlayer.id,
    turnId,
    now: sequence,
    tile: move.tile,
    ...(move.declaredNumber !== undefined
      ? { declaredNumber: move.declaredNumber }
      : {})
  });

  if (!result.nextState) {
    throw new Error("Expected move to be accepted.");
  }

  return {
    state: result.nextState,
    events: [...started.events, ...result.events]
  };
}

function collectReplayFixture(): {
  readonly finalState: MultiplayerGameState;
  readonly events: readonly MultiplayerEvent[];
} {
  let state = createGame();
  const events: MultiplayerEvent[] = [];

  for (let bidIndex = 0; bidIndex < state.coreState.players.length; bidIndex += 1) {
    const result = submitBid(state, bidIndex + 1);
    state = result.state;
    events.push(...result.events);
  }

  for (let moveIndex = 0; moveIndex < state.coreState.players.length; moveIndex += 1) {
    const result = submitMove(state, 100 + moveIndex);
    state = result.state;
    events.push(...result.events);
  }

  return { finalState: state, events };
}

describe("multiplayer replay", () => {
  it("replays an event stream to an identical core state for the same seed", () => {
    const { finalState, events } = collectReplayFixture();

    expect(replayEvents(events, seed)).toEqual(finalState.coreState);
  });

  it("threads a non-default numberOfRounds into the replayed setup (m1)", () => {
    // Bez `numberOfRounds` replay lieto noklusējuma 7 kārtas (diverģē ne-noklusējuma
    // spēlēm). Ar argumentu `totalRounds` sakrīt ar oriģinālo spēli.
    expect(replayEvents([], seed).totalRounds).toBe(7);
    expect(replayEvents([], seed, 3).totalRounds).toBe(3);
  });

  it("rejects event streams with non-consecutive eventSeq values", () => {
    const { events } = collectReplayFixture();
    const event = events[1];
    if (!event) {
      throw new Error("Expected replay fixture to include multiple events.");
    }
    const brokenEvents = [
      events[0]!,
      {
        ...event,
        eventSeq: event.eventSeq + 1
      }
    ];

    expect(() => replayEvents(brokenEvents, seed)).toThrow(
      "Replay expected eventSeq 2"
    );
  });
});
