import { describe, expect, it } from "vitest";

import {
  canPlayTile,
  highestTrumpPriorityInTrick,
  isTrump,
  type DominoTile
} from "../../src";
import {
  applyCommand,
  autoMove,
  type MultiplayerCommand,
  type MultiplayerGameState
} from "../../src/multiplayer";

function createGame(options: { readonly numberOfRounds?: number } = {}): MultiplayerGameState {
  const result = applyCommand(undefined, {
    type: "CREATE_GAME",
    gameId: "game-1",
    requestId: "request-1",
    seed: "seed-1",
    ...(options.numberOfRounds !== undefined
      ? { numberOfRounds: options.numberOfRounds }
      : {})
  });

  if (!result.nextState) {
    throw new Error("Expected test game state to be created.");
  }

  return result.nextState;
}

function startTurnForCurrentPlayer(
  state: MultiplayerGameState,
  action: "SUBMIT_BID" | "SUBMIT_MOVE",
  turnId: string
): MultiplayerGameState {
  const result = applyCommand(state, {
    type: "START_TURN",
    gameId: state.gameId,
    requestId: `request-start-${turnId}`,
    turnId,
    now: 1000
  });

  if (!result.nextState) {
    throw new Error(`Expected ${action} turn to start.`);
  }

  return result.nextState;
}

function submitBidForCurrentPlayer(
  state: MultiplayerGameState,
  bid: number,
  turnId: string
): MultiplayerGameState {
  const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_BID", turnId);
  const currentPlayer =
    stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
  const result = applyCommand(stateWithTurn, {
    type: "SUBMIT_BID",
    gameId: stateWithTurn.gameId,
    requestId: `request-bid-${turnId}`,
    playerId: currentPlayer.id,
    turnId,
    now: 1000,
    bid
  });

  if (!result.nextState) {
    throw new Error("Expected bid to be accepted.");
  }

  return result.nextState;
}

function createPlayingGame(): MultiplayerGameState {
  let state = createGame();
  for (let index = 0; index < 4; index += 1) {
    state = submitBidForCurrentPlayer(state, 0, `bid-turn-${index}`);
  }
  return state;
}

function createRoundEndGame(numberOfRounds = 2): MultiplayerGameState {
  const state = createGame({ numberOfRounds });
  const players = state.coreState.players.map((player, index) => ({
    ...player,
    hand: [],
    bid: index,
    tricksWon: index === 2 ? 2 : 0,
    totalScore: index * 10
  }));

  return {
    ...state,
    eventSeq: 7,
    currentTurn: {
      turnId: "finished-turn",
      playerId: players[0]!.id,
      startedAt: 1000,
      deadlineAt: 11000,
      allowedActionTypes: ["SUBMIT_MOVE"],
      phase: "playing"
    },
    coreState: {
      ...state.coreState,
      players,
      phase: "roundEnd",
      currentRound: numberOfRounds > 1 ? 1 : numberOfRounds,
      lastRoundWinnerIndex: 2,
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

function declaredNumberForLead(tile: DominoTile): number | undefined {
  return tile.side1 !== tile.side2 && !isTrump(tile) ? tile.side1 : undefined;
}

function findPlayableTile(state: MultiplayerGameState): DominoTile {
  const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex]!;
  const tile = currentPlayer.hand.find((handTile) =>
    canPlayTile(currentPlayer, handTile, {
      leadTile: state.coreState.leadTile,
      requiredNumber: state.coreState.requiredNumber,
      isTrumpLead: state.coreState.isTrumpLead,
      isAceLead: state.coreState.isAceLead,
      highestTrumpPriorityInTrick: highestTrumpPriorityInTrick(state.coreState)
    })
  );

  if (!tile) {
    throw new Error("Expected current player to have a playable tile.");
  }

  return tile;
}

function submitMoveForCurrentPlayer(
  state: MultiplayerGameState,
  turnId: string
): ReturnType<typeof applyCommand> {
  const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_MOVE", turnId);
  const currentPlayer =
    stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
  const tile = findPlayableTile(stateWithTurn);
  const declaredNumber =
    stateWithTurn.coreState.currentTrick.length === 0
      ? declaredNumberForLead(tile)
      : undefined;

  return applyCommand(stateWithTurn, {
    type: "SUBMIT_MOVE",
    gameId: "game-1",
    requestId: `request-move-${turnId}`,
    playerId: currentPlayer.id,
    turnId,
    now: 1000,
    tile,
    ...(declaredNumber !== undefined ? { declaredNumber } : {})
  });
}

describe("applyCommand", () => {
  it("creates a deterministic multiplayer game state", () => {
    const result = applyCommand(undefined, {
      type: "CREATE_GAME",
      gameId: "game-1",
      requestId: "request-1",
      seed: "seed-1"
    });

    expect(result.errors).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.invariantViolations).toEqual([]);
    expect(result.nextState?.gameId).toBe("game-1");
    expect(result.nextState?.seed).toBe("seed-1");
    expect(result.nextState?.eventSeq).toBe(0);
  });

  it("rejects commands that require a game before CREATE_GAME", () => {
    const result = applyCommand(undefined, {
      type: "REQUEST_SNAPSHOT",
      gameId: "game-1",
      requestId: "request-1",
      playerId: "1"
    });

    expect(result.nextState).toBeUndefined();
    expect(result.errors).toEqual([
      {
        code: "game_not_created",
        message: "REQUEST_SNAPSHOT requires an existing game."
      }
    ]);
  });

  it("starts a turn and emits a sequenced event", () => {
    const state = createGame();
    const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex]!;
    const result = applyCommand(state, {
      type: "START_TURN",
      gameId: "game-1",
      requestId: "request-2",
      turnId: "turn-1",
      now: 1000
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.currentTurn?.turnId).toBe("turn-1");
    expect(result.nextState?.eventSeq).toBe(1);
    expect(result.events).toEqual([
      {
        type: "TURN_STARTED",
        gameId: "game-1",
        eventSeq: 1,
        turn: {
          turnId: "turn-1",
          playerId: currentPlayer.id,
          startedAt: 1000,
          deadlineAt: 11000,
          allowedActionTypes: ["SUBMIT_BID"],
          phase: "bidding"
        }
      }
    ]);
  });

  it("rejects START_TURN when a turn is already active", () => {
    const state = createGame();
    const withTurn = startTurnForCurrentPlayer(state, "SUBMIT_BID", "turn-1");
    const result = applyCommand(withTurn, {
      type: "START_TURN",
      gameId: "game-1",
      requestId: "request-double-start",
      turnId: "turn-2",
      now: 2000
    });

    expect(result.nextState).toBe(withTurn);
    expect(result.nextState?.currentTurn?.turnId).toBe("turn-1");
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "turn_already_active",
        message: "START_TURN is not allowed while a turn is already active."
      }
    ]);
  });

  it("keeps state unchanged for REQUEST_SNAPSHOT", () => {
    const state = createGame();
    const result = applyCommand(state, {
      type: "REQUEST_SNAPSHOT",
      gameId: "game-1",
      requestId: "request-2",
      playerId: "1"
    });

    expect(result.nextState).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("disables human auto-play with DISABLE_AUTO_PLAY", () => {
    const baseState = createGame();
    const state = {
      ...baseState,
      eventSeq: 4,
      players: baseState.players.map((player) =>
        player.playerId === "1"
          ? {
              ...player,
              inactiveScore: 3,
              status: "auto_play" as const,
              autoPlayEnabled: true
            }
          : player
      )
    };

    const result = applyCommand(state, {
      type: "DISABLE_AUTO_PLAY",
      gameId: "game-1",
      requestId: "request-disable-auto-play",
      playerId: "1"
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.eventSeq).toBe(5);
    expect(result.nextState?.players.find((player) => player.playerId === "1"))
      .toMatchObject({
        inactiveScore: 3,
        status: "inactive",
        autoPlayEnabled: false
      });
    expect(result.events).toEqual([
      {
        type: "AUTO_PLAY_DISABLED",
        gameId: "game-1",
        eventSeq: 5,
        playerId: "1"
      }
    ]);
  });

  it("resumes a human player with PLAYER_RESUME", () => {
    const baseState = createGame();
    const state = {
      ...baseState,
      eventSeq: 4,
      players: baseState.players.map((player) =>
        player.playerId === "1"
          ? {
              ...player,
              inactiveScore: 3,
              status: "auto_play" as const,
              autoPlayEnabled: true,
              connectionState: "disconnected" as const
            }
          : player
      )
    };

    const result = applyCommand(state, {
      type: "PLAYER_RESUME",
      gameId: "game-1",
      requestId: "request-player-resume",
      playerId: "1"
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.eventSeq).toBe(5);
    expect(result.nextState?.players.find((player) => player.playerId === "1"))
      .toMatchObject({
        inactiveScore: 0,
        status: "active",
        autoPlayEnabled: false,
        connectionState: "connected"
      });
    expect(result.events).toEqual([
      {
        type: "PLAYER_RESUMED",
        gameId: "game-1",
        eventSeq: 5,
        playerId: "1"
      }
    ]);
  });

  it("forfeits a human player with PLAYER_FORFEIT — seat becomes a bot and emits PLAYER_LEFT", () => {
    const state = { ...createGame(), eventSeq: 4 };

    const result = applyCommand(state, {
      type: "PLAYER_FORFEIT",
      gameId: "game-1",
      requestId: "request-player-forfeit",
      playerId: "1"
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.eventSeq).toBe(5);
    // Sēdvieta tagad ir bots → dzinējs to auto-spēlēs.
    expect(result.nextState?.players.find((player) => player.playerId === "1"))
      .toMatchObject({
        status: "bot",
        connectionState: "disconnected",
        autoPlayEnabled: true
      });
    expect(result.events).toEqual([
      {
        type: "PLAYER_LEFT",
        gameId: "game-1",
        eventSeq: 5,
        playerId: "1"
      }
    ]);
  });

  it("rejects PLAYER_FORFEIT for a seat that is already a bot", () => {
    const state = createGame();
    const result = applyCommand(state, {
      type: "PLAYER_FORFEIT",
      gameId: "game-1",
      requestId: "request-forfeit-bot",
      playerId: "2" // sēdvieta 2 ir bots
    });

    expect(result.nextState).toBe(state);
    expect(result.errors).toEqual([{ code: "player_is_bot", message: "PLAYER_FORFEIT is only allowed for human players." }]);
  });

  it("rejects auto-play disable commands for bot seats", () => {
    const state = createGame();
    const result = applyCommand(state, {
      type: "DISABLE_AUTO_PLAY",
      gameId: "game-1",
      requestId: "request-disable-bot-auto-play",
      playerId: "2"
    });

    expect(result.nextState).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "player_is_bot",
        message: "DISABLE_AUTO_PLAY is only allowed for human players."
      }
    ]);
  });

  it("reports unimplemented commands without mutating state", () => {
    const state = createGame();
    const command = {
      type: "ADD_PLAYER",
      gameId: "game-1",
      requestId: "request-2",
      playerId: "1",
      name: "Player 1"
    } satisfies MultiplayerCommand;

    const result = applyCommand(state, command);

    expect(result.nextState).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "command_not_implemented",
        message: "ADD_PLAYER is not implemented yet."
      }
    ]);
  });

  it("delegates SUBMIT_BID to core makeBid when turn validation passes", () => {
    const state = createGame();
    const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex]!;
    const turnResult = applyCommand(state, {
      type: "START_TURN",
      gameId: "game-1",
      requestId: "request-2",
      turnId: "turn-1",
      now: 1000
    });
    const stateWithTurn = turnResult.nextState!;

    const result = applyCommand(stateWithTurn, {
      type: "SUBMIT_BID",
      gameId: "game-1",
      requestId: "request-3",
      playerId: currentPlayer.id,
      turnId: "turn-1",
      now: 1000,
      bid: 3
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.coreState.players[state.coreState.currentPlayerIndex]?.bid).toBe(3);
    expect(result.nextState?.coreState.currentPlayerIndex).not.toBe(
      state.coreState.currentPlayerIndex
    );
    expect(result.nextState?.currentTurn).toBeUndefined();
    expect(result.nextState?.eventSeq).toBe(2);
    expect(result.events).toEqual([
      {
        type: "BID_ACCEPTED",
        gameId: "game-1",
        eventSeq: 2,
        playerId: currentPlayer.id,
        turnId: "turn-1",
        bid: 3
      }
    ]);
  });

  it("reduces inactivity after an on-time SUBMIT_BID", () => {
    const state = createGame();
    const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex]!;
    const turnResult = applyCommand(state, {
      type: "START_TURN",
      gameId: "game-1",
      requestId: "request-2",
      turnId: "turn-1",
      now: 1000
    });
    const stateWithTurn = {
      ...turnResult.nextState!,
      players: turnResult.nextState!.players.map((player) =>
        player.playerId === currentPlayer.id
          ? { ...player, inactiveScore: 1, status: "active_with_warning" as const }
          : player
      )
    };

    const result = applyCommand(stateWithTurn, {
      type: "SUBMIT_BID",
      gameId: "game-1",
      requestId: "request-3",
      playerId: currentPlayer.id,
      turnId: "turn-1",
      now: 1000,
      bid: 3
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.players.find((player) => player.playerId === currentPlayer.id))
      .toMatchObject({
        inactiveScore: 0,
        status: "active"
      });
  });

  it("rejects SUBMIT_BID with a stale turnId", () => {
    const state = createGame();
    const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex]!;
    const turnResult = applyCommand(state, {
      type: "START_TURN",
      gameId: "game-1",
      requestId: "request-2",
      turnId: "turn-1",
      now: 1000
    });

    const result = applyCommand(turnResult.nextState!, {
      type: "SUBMIT_BID",
      gameId: "game-1",
      requestId: "request-3",
      playerId: currentPlayer.id,
      turnId: "stale-turn",
      now: 1000,
      bid: 3
    });

    expect(result.nextState).toBe(turnResult.nextState);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "turn_id_mismatch",
        message: "Command turnId stale-turn does not match current turn."
      }
    ]);
  });

  it("rejects SUBMIT_BID from the wrong player", () => {
    const state = createGame();
    const turnResult = applyCommand(state, {
      type: "START_TURN",
      gameId: "game-1",
      requestId: "request-2",
      turnId: "turn-1",
      now: 1000
    });

    const result = applyCommand(turnResult.nextState!, {
      type: "SUBMIT_BID",
      gameId: "game-1",
      requestId: "request-3",
      playerId: "wrong-player",
      turnId: "turn-1",
      now: 1000,
      bid: 3
    });

    expect(result.nextState).toBe(turnResult.nextState);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "wrong_player",
        message: "Player wrong-player does not own the current turn."
      }
    ]);
  });

  it("rejects SUBMIT_BID when core rules reject the bid", () => {
    const state = createGame();
    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_BID", "turn-1");
    const currentPlayer =
      stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;

    const result = applyCommand(stateWithTurn, {
      type: "SUBMIT_BID",
      gameId: "game-1",
      requestId: "request-invalid-bid",
      playerId: currentPlayer.id,
      turnId: "turn-1",
      now: 1000,
      bid: 8
    });

    expect(result.nextState).toBe(stateWithTurn);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "bid_rejected",
        message: "Bid must be an integer from 0 to 7. Received 8."
      }
    ]);
  });

  it("rejects SUBMIT_BID after the turn deadline", () => {
    const state = createGame();
    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_BID", "turn-1");
    const currentPlayer =
      stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;

    const result = applyCommand(stateWithTurn, {
      type: "SUBMIT_BID",
      gameId: "game-1",
      requestId: "request-late-bid",
      playerId: currentPlayer.id,
      turnId: "turn-1",
      now: 11001,
      bid: 3
    });

    expect(result.nextState).toBe(stateWithTurn);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "ACTION_TOO_LATE",
        message: "bid was submitted after the current turn deadline."
      }
    ]);
  });

  it("forces bid 0 on TURN_TIMEOUT after the bidding deadline", () => {
    const state = createGame();
    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_BID", "turn-1");
    const currentPlayer =
      stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;

    const result = applyCommand(stateWithTurn, {
      type: "TURN_TIMEOUT",
      gameId: "game-1",
      requestId: "request-timeout-bid",
      turnId: "turn-1",
      now: 11001
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.currentTurn).toBeUndefined();
    // Timeout → piespiedu drošais solījums 0 (neatkarīgi no AI izvēles).
    expect(result.nextState?.coreState.players[state.coreState.currentPlayerIndex]?.bid).toBe(0);
    expect(result.nextState?.players.find((player) => player.playerId === currentPlayer.id))
      .toMatchObject({
        inactiveScore: currentPlayer.isAI ? 0 : 1,
        status: currentPlayer.isAI ? "bot" : "active_with_warning",
        autoPlayEnabled: false
      });
    expect(result.events).toEqual([
      {
        type: "TURN_TIMEOUT",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 1,
        turnId: "turn-1",
        playerId: currentPlayer.id
      },
      {
        type: "BID_ACCEPTED",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 2,
        playerId: currentPlayer.id,
        turnId: "turn-1",
        bid: 0
      }
    ]);
  });

  it("emits AUTO_PLAY_ENABLED when a timeout enables human auto-play", () => {
    const state = createGame();
    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_BID", "turn-1");
    const currentPlayer =
      stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
    const stateBeforeAutoPlay = {
      ...stateWithTurn,
      players: stateWithTurn.players.map((player) =>
        player.playerId === currentPlayer.id
          ? { ...player, inactiveScore: 2, status: "inactive" as const }
          : player
      )
    };

    const result = applyCommand(stateBeforeAutoPlay, {
      type: "TURN_TIMEOUT",
      gameId: "game-1",
      requestId: "request-timeout-auto-play",
      turnId: "turn-1",
      now: 11001
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.eventSeq).toBe(stateWithTurn.eventSeq + 3);
    expect(result.nextState?.players.find((player) => player.playerId === currentPlayer.id))
      .toMatchObject({
        inactiveScore: 3,
        status: "auto_play",
        autoPlayEnabled: true
      });
    expect(result.events).toEqual([
      {
        type: "TURN_TIMEOUT",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 1,
        turnId: "turn-1",
        playerId: currentPlayer.id
      },
      {
        type: "AUTO_PLAY_ENABLED",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 2,
        playerId: currentPlayer.id,
        phase: "bidding"
      },
      {
        type: "BID_ACCEPTED",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 3,
        playerId: currentPlayer.id,
        turnId: "turn-1",
        bid: 0
      }
    ]);
  });

  it("rejects TURN_TIMEOUT before the current deadline", () => {
    const state = createGame();
    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_BID", "turn-1");

    const result = applyCommand(stateWithTurn, {
      type: "TURN_TIMEOUT",
      gameId: "game-1",
      requestId: "request-timeout-too-early",
      turnId: "turn-1",
      now: 11000
    });

    expect(result.nextState).toBe(stateWithTurn);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "timeout_not_due",
        message: "TURN_TIMEOUT is only allowed after the current turn deadline."
      }
    ]);
  });

  it("delegates SUBMIT_MOVE to core playTile when turn validation passes", () => {
    const state = createPlayingGame();
    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_MOVE", "move-turn-1");
    const currentPlayer =
      stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
    const tile = currentPlayer.hand[0]!;
    const declaredNumber = declaredNumberForLead(tile);

    const result = applyCommand(stateWithTurn, {
      type: "SUBMIT_MOVE",
      gameId: "game-1",
      requestId: "request-move-1",
      playerId: currentPlayer.id,
      turnId: "move-turn-1",
      now: 1000,
      tile,
      ...(declaredNumber !== undefined ? { declaredNumber } : {})
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.coreState.currentTrick).toHaveLength(1);
    expect(result.nextState?.coreState.currentTrick[0]?.tile).toEqual(tile);
    expect(result.nextState?.currentTurn).toBeUndefined();
    expect(result.events).toEqual([
      {
        type: "MOVE_ACCEPTED",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 1,
        playerId: currentPlayer.id,
        turnId: "move-turn-1",
        tile,
        ...(declaredNumber !== undefined ? { declaredNumber } : {})
      }
    ]);
  });

  it("reduces inactivity after an on-time SUBMIT_MOVE", () => {
    const state = createPlayingGame();
    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_MOVE", "move-turn-1");
    const currentPlayer =
      stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
    const tile = currentPlayer.hand[0]!;
    const declaredNumber = declaredNumberForLead(tile);
    const stateWithInactivity = {
      ...stateWithTurn,
      players: stateWithTurn.players.map((player) =>
        player.playerId === currentPlayer.id
          ? { ...player, inactiveScore: 1, status: "active_with_warning" as const }
          : player
      )
    };

    const result = applyCommand(stateWithInactivity, {
      type: "SUBMIT_MOVE",
      gameId: "game-1",
      requestId: "request-move-1",
      playerId: currentPlayer.id,
      turnId: "move-turn-1",
      now: 1000,
      tile,
      ...(declaredNumber !== undefined ? { declaredNumber } : {})
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.players.find((player) => player.playerId === currentPlayer.id))
      .toMatchObject({
        inactiveScore: 0,
        status: "active"
      });
  });

  it("rejects SUBMIT_MOVE after the turn deadline", () => {
    const state = createPlayingGame();
    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_MOVE", "move-turn-1");
    const currentPlayer =
      stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
    const tile = currentPlayer.hand[0]!;
    const declaredNumber = declaredNumberForLead(tile);

    const result = applyCommand(stateWithTurn, {
      type: "SUBMIT_MOVE",
      gameId: "game-1",
      requestId: "request-late-move",
      playerId: currentPlayer.id,
      turnId: "move-turn-1",
      now: 11001,
      tile,
      ...(declaredNumber !== undefined ? { declaredNumber } : {})
    });

    expect(result.nextState).toBe(stateWithTurn);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "ACTION_TOO_LATE",
        message: "move was submitted after the current turn deadline."
      }
    ]);
  });

  it("applies TURN_TIMEOUT as a legal auto-move after the playing deadline", () => {
    const state = createPlayingGame();
    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_MOVE", "move-turn-1");
    const currentPlayer =
      stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
    const move = autoMove(stateWithTurn, currentPlayer.id);

    const result = applyCommand(stateWithTurn, {
      type: "TURN_TIMEOUT",
      gameId: "game-1",
      requestId: "request-timeout-move",
      turnId: "move-turn-1",
      now: 11001
    });

    expect(move).toBeDefined();
    expect(result.errors).toEqual([]);
    expect(result.nextState?.currentTurn).toBeUndefined();
    expect(result.nextState?.coreState.currentTrick).toHaveLength(1);
    expect(result.nextState?.coreState.currentTrick[0]?.tile).toEqual(move?.tile);
    expect(result.events).toEqual([
      {
        type: "TURN_TIMEOUT",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 1,
        turnId: "move-turn-1",
        playerId: currentPlayer.id
      },
      {
        type: "MOVE_ACCEPTED",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 2,
        playerId: currentPlayer.id,
        turnId: "move-turn-1",
        tile: move!.tile,
        ...(move!.declaredNumber !== undefined
          ? { declaredNumber: move!.declaredNumber }
          : {})
      }
    ]);
  });

  it("uses a defined fallback when TURN_TIMEOUT has no legal auto-move", () => {
    const state = createPlayingGame();
    const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex]!;
    const stateWithoutLegalMoves: MultiplayerGameState = {
      ...state,
      coreState: {
        ...state.coreState,
        players: state.coreState.players.map((player) =>
          player.id === currentPlayer.id ? { ...player, hand: [] } : player
        )
      }
    };
    const stateWithTurn = startTurnForCurrentPlayer(
      stateWithoutLegalMoves,
      "SUBMIT_MOVE",
      "move-turn-1"
    );

    const result = applyCommand(stateWithTurn, {
      type: "TURN_TIMEOUT",
      gameId: "game-1",
      requestId: "request-timeout-move-fallback",
      turnId: "move-turn-1",
      now: 11001
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.currentTurn).toBeUndefined();
    expect(result.nextState?.coreState).toBe(stateWithTurn.coreState);
    expect(result.events).toEqual([
      {
        type: "TURN_TIMEOUT",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 1,
        turnId: "move-turn-1",
        playerId: currentPlayer.id
      },
      {
        type: "AUTO_MOVE_FALLBACK",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 2,
        playerId: currentPlayer.id,
        turnId: "move-turn-1",
        reason: "NO_LEGAL_MOVE"
      }
    ]);
  });

  it("delegates completed tricks to core completeTrick", () => {
    let state = createPlayingGame();

    for (let moveIndex = 0; moveIndex < 3; moveIndex += 1) {
      const result = submitMoveForCurrentPlayer(state, `trick-turn-${moveIndex}`);
      expect(result.errors).toEqual([]);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.type).toBe("MOVE_ACCEPTED");
      expect(result.nextState?.coreState.completedTricks).toHaveLength(0);
      state = result.nextState!;
    }

    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_MOVE", "trick-turn-3");
    const currentPlayer =
      stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
    const tile = findPlayableTile(stateWithTurn);
    const result = applyCommand(stateWithTurn, {
      type: "SUBMIT_MOVE",
      gameId: "game-1",
      requestId: "request-move-trick-turn-3",
      playerId: currentPlayer.id,
      turnId: "trick-turn-3",
      now: 1000,
      tile
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.coreState.currentTrick).toHaveLength(0);
    expect(result.nextState?.coreState.completedTricks).toHaveLength(1);
    expect(result.nextState?.coreState.trickWinners).toHaveLength(1);
    expect(result.nextState?.currentTurn).toBeUndefined();
    expect(result.nextState?.eventSeq).toBe(stateWithTurn.eventSeq + 2);

    const winnerIndex = result.nextState!.coreState.trickWinners[0]!;
    const winner = result.nextState!.coreState.players[winnerIndex]!;
    expect(result.nextState?.coreState.currentPlayerIndex).toBe(winnerIndex);
    expect(result.events).toEqual([
      {
        type: "MOVE_ACCEPTED",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 1,
        playerId: currentPlayer.id,
        turnId: "trick-turn-3",
        tile
      },
      {
        type: "TRICK_COMPLETED",
        gameId: "game-1",
        eventSeq: stateWithTurn.eventSeq + 2,
        winnerPlayerId: winner.id
      }
    ]);
  });

  it("delegates START_NEXT_ROUND to core startNextRound with a deterministic deck", () => {
    const state = createRoundEndGame(2);
    const result = applyCommand(state, {
      type: "START_NEXT_ROUND",
      gameId: "game-1",
      requestId: "request-next-round-1"
    });
    const repeat = applyCommand(state, {
      type: "START_NEXT_ROUND",
      gameId: "game-1",
      requestId: "request-next-round-2"
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.coreState.phase).toBe("bidding");
    expect(result.nextState?.coreState.currentRound).toBe(2);
    expect(result.nextState?.coreState.dealerIndex).toBe(2);
    expect(result.nextState?.coreState.currentPlayerIndex).toBe(3);
    expect(result.nextState?.coreState.players.map((player) => player.hand)).toEqual(
      repeat.nextState?.coreState.players.map((player) => player.hand)
    );
    expect(result.nextState?.coreState.players.map((player) => player.hand.length)).toEqual([
      7,
      7,
      7,
      7
    ]);
    expect(result.nextState?.currentTurn).toBeUndefined();
    expect(result.nextState?.eventSeq).toBe(state.eventSeq + 1);
    expect(result.events).toEqual([
      {
        type: "ROUND_RESULT",
        gameId: "game-1",
        eventSeq: state.eventSeq + 1,
        round: 1,
        // Solījums + paņemtie stiķi UZŅEMTI PIRMS reseta (no `createRoundEndGame`:
        // bid=index, tricksWon=2 tikai 3. spēlētājam). Lieto MP bid-accuracy statistika.
        playerResults: [
          { playerId: state.coreState.players[0]!.id, bid: 0, tricksWon: 0 },
          { playerId: state.coreState.players[1]!.id, bid: 1, tricksWon: 0 },
          { playerId: state.coreState.players[2]!.id, bid: 2, tricksWon: 2 },
          { playerId: state.coreState.players[3]!.id, bid: 3, tricksWon: 0 }
        ],
        winnerPlayerId: state.coreState.players[2]!.id
      }
    ]);
  });

  it("preserves inactivity metadata across START_NEXT_ROUND", () => {
    const roundEndState = createRoundEndGame(2);
    const state = {
      ...roundEndState,
      players: roundEndState.players.map((player) =>
        player.playerId === "1"
          ? {
              ...player,
              inactiveScore: 2,
              status: "inactive" as const,
              autoPlayEnabled: false
            }
          : player
      )
    };

    const result = applyCommand(state, {
      type: "START_NEXT_ROUND",
      gameId: "game-1",
      requestId: "request-next-round-inactivity"
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.players.find((player) => player.playerId === "1"))
      .toMatchObject({
        inactiveScore: 2,
        status: "inactive",
        autoPlayEnabled: false
      });
  });

  it("transitions START_NEXT_ROUND from final roundEnd to gameEnd", () => {
    const state = createRoundEndGame(1);
    const result = applyCommand(state, {
      type: "START_NEXT_ROUND",
      gameId: "game-1",
      requestId: "request-game-over"
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState?.coreState.phase).toBe("gameEnd");
    expect(result.nextState?.eventSeq).toBe(state.eventSeq + 2);
    expect(result.events.map((event) => event.type)).toEqual([
      "ROUND_RESULT",
      "GAME_OVER"
    ]);

    // Pēdējā raunda ROUND_RESULT (tajā pašā partijā ar GAME_OVER) JOPROJĀM nes
    // playerResults ar pirms-reset solījumiem/stiķiem → MP statistika ieskaita arī
    // pēdējo raundu (Codex: "final batch must count the final round").
    const roundResult = result.events.find((event) => event.type === "ROUND_RESULT");
    expect(roundResult?.type).toBe("ROUND_RESULT");
    expect(
      roundResult?.type === "ROUND_RESULT" ? roundResult.playerResults : undefined
    ).toEqual([
      { playerId: state.coreState.players[0]!.id, bid: 0, tricksWon: 0 },
      { playerId: state.coreState.players[1]!.id, bid: 1, tricksWon: 0 },
      { playerId: state.coreState.players[2]!.id, bid: 2, tricksWon: 2 },
      { playerId: state.coreState.players[3]!.id, bid: 3, tricksWon: 0 }
    ]);
  });

  it("rejects START_NEXT_ROUND before roundEnd", () => {
    const state = createGame();
    const result = applyCommand(state, {
      type: "START_NEXT_ROUND",
      gameId: "game-1",
      requestId: "request-next-round-early"
    });

    expect(result.nextState).toBe(state);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "round_not_ready",
        message: "START_NEXT_ROUND requires the current round to be finished."
      }
    ]);
  });

  it("rejects SUBMIT_MOVE with a stale turnId", () => {
    const state = createPlayingGame();
    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_MOVE", "move-turn-1");
    const currentPlayer =
      stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
    const tile = currentPlayer.hand[0]!;

    const result = applyCommand(stateWithTurn, {
      type: "SUBMIT_MOVE",
      gameId: "game-1",
      requestId: "request-move-1",
      playerId: currentPlayer.id,
      turnId: "stale-turn",
      now: 1000,
      tile,
      declaredNumber: tile.side1
    });

    expect(result.nextState).toBe(stateWithTurn);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "turn_id_mismatch",
        message: "Command turnId stale-turn does not match current turn."
      }
    ]);
  });

  it("rejects SUBMIT_MOVE when core rules reject the move", () => {
    const state = createPlayingGame();
    const stateWithTurn = startTurnForCurrentPlayer(state, "SUBMIT_MOVE", "move-turn-1");
    const currentPlayer =
      stateWithTurn.coreState.players[stateWithTurn.coreState.currentPlayerIndex]!;
    const tile = currentPlayer.hand[0]!;

    const result = applyCommand(stateWithTurn, {
      type: "SUBMIT_MOVE",
      gameId: "game-1",
      requestId: "request-move-1",
      playerId: currentPlayer.id,
      turnId: "move-turn-1",
      now: 1000,
      tile: { side1: tile.side1, side2: 99 },
      declaredNumber: tile.side1
    });

    expect(result.nextState).toBe(stateWithTurn);
    expect(result.events).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: "move_rejected",
        message: "Move was rejected by core rules."
      }
    ]);
  });
});

describe("applyCommand CREATE_GAME turnDurationMs (Phase 12.1)", () => {
  function createWithDuration(turnDurationMs?: number): MultiplayerGameState {
    const result = applyCommand(undefined, {
      type: "CREATE_GAME",
      gameId: "game-dur",
      requestId: "req-dur",
      seed: "seed-1",
      ...(turnDurationMs !== undefined ? { turnDurationMs } : {})
    });
    if (!result.nextState) throw new Error("Expected game to be created.");
    return result.nextState;
  }

  function deadlineFor(state: MultiplayerGameState, now: number): number {
    const result = applyCommand(state, {
      type: "START_TURN",
      gameId: state.gameId,
      requestId: "req-start",
      turnId: "turn-1",
      now
    });
    const deadline = result.nextState?.currentTurn?.deadlineAt;
    if (deadline === undefined) throw new Error("Expected a turn with deadline.");
    return deadline;
  }

  it("defaults to a 10000 ms turn when not specified", () => {
    expect(createWithDuration().turnDurationMs).toBe(10_000);
    expect(deadlineFor(createWithDuration(), 1000)).toBe(11_000);
  });

  it("uses the configured turnDurationMs for the deadline", () => {
    const state = createWithDuration(3000);
    expect(state.turnDurationMs).toBe(3000);
    expect(deadlineFor(state, 1000)).toBe(4000);
  });

  it("rejects an out-of-range turnDurationMs (does not create the game)", () => {
    const result = applyCommand(undefined, {
      type: "CREATE_GAME",
      gameId: "game-bad",
      requestId: "req-bad",
      seed: "seed-1",
      turnDurationMs: 50
    });
    expect(result.nextState).toBeUndefined();
    expect(result.errors[0]?.code).toBe("create_game_failed");
  });

  it("does NOT affect the deal (determinism): same seed → same hands regardless of duration", () => {
    const a = createWithDuration(1000);
    const b = createWithDuration(500_00);
    expect(a.coreState.players.map((p) => p.hand)).toEqual(
      b.coreState.players.map((p) => p.hand)
    );
  });
});

