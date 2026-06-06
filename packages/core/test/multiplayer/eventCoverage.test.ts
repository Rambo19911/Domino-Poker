import { describe, expect, it } from "vitest";

import { canPlayTile, highestTrumpPriorityInTrick, isTrump, type DominoTile } from "../../src";
import {
  applyCommand,
  type MultiplayerApplyResult,
  type MultiplayerCommand,
  type MultiplayerGameState
} from "../../src/multiplayer";

function createGame(options: { readonly numberOfRounds?: number } = {}): MultiplayerGameState {
  const result = applyCommand(undefined, {
    type: "CREATE_GAME",
    gameId: "game-1",
    requestId: "request-create",
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

function startTurn(state: MultiplayerGameState, turnId: string): MultiplayerGameState {
  const result = applyCommand(state, {
    type: "START_TURN",
    gameId: state.gameId,
    requestId: `request-start-${turnId}`,
    turnId,
    now: 1000
  });

  if (!result.nextState) {
    throw new Error("Expected test turn to start.");
  }

  return result.nextState;
}

function bidForCurrentPlayer(
  state: MultiplayerGameState,
  bid: number,
  turnId: string
): MultiplayerGameState {
  const stateWithTurn = startTurn(state, turnId);
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
    throw new Error("Expected test bid to be accepted.");
  }

  return result.nextState;
}

function createPlayingGame(): MultiplayerGameState {
  let state = createGame();
  for (let index = 0; index < 4; index += 1) {
    state = bidForCurrentPlayer(state, 0, `bid-turn-${index}`);
  }
  return state;
}

function createRoundEndGame(): MultiplayerGameState {
  const state = createGame({ numberOfRounds: 2 });
  const players = state.coreState.players.map((player, index) => ({
    ...player,
    hand: [],
    bid: index,
    tricksWon: index === 2 ? 2 : 0
  }));

  return {
    ...state,
    eventSeq: 7,
    coreState: {
      ...state.coreState,
      players,
      phase: "roundEnd",
      currentRound: 1,
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

function expectConsecutiveStateUpdateEvents(
  stateBefore: MultiplayerGameState,
  result: MultiplayerApplyResult
): void {
  expect(result.errors).toEqual([]);
  expect(result.invariantViolations).toEqual([]);
  expect(result.nextState).toBeDefined();
  expect(result.events.length).toBeGreaterThan(0);

  result.events.forEach((event, index) => {
    expect(event.gameId).toBe(stateBefore.gameId);
    expect(event.eventSeq).toBe(stateBefore.eventSeq + index + 1);
  });
  expect(result.nextState?.eventSeq).toBe(
    result.events[result.events.length - 1]?.eventSeq
  );
}

describe("applyCommand event coverage", () => {
  it("emits consecutive events for each implemented state-changing command", () => {
    const startTurnState = createGame();
    const startTurnCommand = {
      type: "START_TURN",
      gameId: startTurnState.gameId,
      requestId: "request-audit-start-turn",
      turnId: "audit-start-turn",
      now: 1000
    } satisfies MultiplayerCommand;

    const submitBidState = startTurn(createGame(), "audit-bid-turn");
    const biddingPlayer =
      submitBidState.coreState.players[submitBidState.coreState.currentPlayerIndex]!;
    const submitBidCommand = {
      type: "SUBMIT_BID",
      gameId: submitBidState.gameId,
      requestId: "request-audit-submit-bid",
      playerId: biddingPlayer.id,
      turnId: "audit-bid-turn",
      now: 1000,
      bid: 0
    } satisfies MultiplayerCommand;

    const submitMoveState = startTurn(createPlayingGame(), "audit-move-turn");
    const movingPlayer =
      submitMoveState.coreState.players[submitMoveState.coreState.currentPlayerIndex]!;
    const tile = findPlayableTile(submitMoveState);
    const declaredNumber = declaredNumberForLead(tile);
    const submitMoveCommand = {
      type: "SUBMIT_MOVE",
      gameId: submitMoveState.gameId,
      requestId: "request-audit-submit-move",
      playerId: movingPlayer.id,
      turnId: "audit-move-turn",
      now: 1000,
      tile,
      ...(declaredNumber !== undefined ? { declaredNumber } : {})
    } satisfies MultiplayerCommand;

    const timeoutState = startTurn(createGame(), "audit-timeout-turn");
    const timeoutCommand = {
      type: "TURN_TIMEOUT",
      gameId: timeoutState.gameId,
      requestId: "request-audit-timeout",
      turnId: "audit-timeout-turn",
      now: 11001
    } satisfies MultiplayerCommand;

    const disableAutoPlayBaseState = createGame();
    const disableAutoPlayState = {
      ...disableAutoPlayBaseState,
      players: disableAutoPlayBaseState.players.map((player) =>
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
    const disableAutoPlayCommand = {
      type: "DISABLE_AUTO_PLAY",
      gameId: disableAutoPlayState.gameId,
      requestId: "request-audit-disable-auto-play",
      playerId: "1"
    } satisfies MultiplayerCommand;

    const playerResumeBaseState = createGame();
    const playerResumeState = {
      ...playerResumeBaseState,
      players: playerResumeBaseState.players.map((player) =>
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
    const playerResumeCommand = {
      type: "PLAYER_RESUME",
      gameId: playerResumeState.gameId,
      requestId: "request-audit-player-resume",
      playerId: "1"
    } satisfies MultiplayerCommand;

    const startNextRoundState = createRoundEndGame();
    const startNextRoundCommand = {
      type: "START_NEXT_ROUND",
      gameId: startNextRoundState.gameId,
      requestId: "request-audit-next-round"
    } satisfies MultiplayerCommand;

    const cases = [
      { state: startTurnState, command: startTurnCommand },
      { state: submitBidState, command: submitBidCommand },
      { state: submitMoveState, command: submitMoveCommand },
      { state: timeoutState, command: timeoutCommand },
      { state: disableAutoPlayState, command: disableAutoPlayCommand },
      { state: playerResumeState, command: playerResumeCommand },
      { state: startNextRoundState, command: startNextRoundCommand }
    ];

    for (const entry of cases) {
      expectConsecutiveStateUpdateEvents(
        entry.state,
        applyCommand(entry.state, entry.command)
      );
    }
  });

  it("keeps non-mutating and rejected commands eventless", () => {
    const state = createGame();

    const snapshotResult = applyCommand(state, {
      type: "REQUEST_SNAPSHOT",
      gameId: state.gameId,
      requestId: "request-audit-snapshot",
      playerId: "1"
    });
    expect(snapshotResult.nextState).toBe(state);
    expect(snapshotResult.events).toEqual([]);

    const unsupportedResult = applyCommand(state, {
      type: "ENABLE_AUTO_PLAY",
      gameId: state.gameId,
      requestId: "request-audit-unsupported-auto-play",
      playerId: "1"
    });
    expect(unsupportedResult.nextState).toBe(state);
    expect(unsupportedResult.events).toEqual([]);
    expect(unsupportedResult.errors).toHaveLength(1);

    const rejectedResult = applyCommand(state, {
      type: "START_TURN",
      gameId: "other-game",
      requestId: "request-audit-wrong-game",
      turnId: "wrong-game-turn",
      now: 1000
    });
    expect(rejectedResult.nextState).toBe(state);
    expect(rejectedResult.events).toEqual([]);
    expect(rejectedResult.errors).toHaveLength(1);
  });
});
