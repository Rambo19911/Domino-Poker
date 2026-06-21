import { completeTrick, getWinner, makeBid, playTile, startNextRound } from "../gameState";
import { autoMove } from "./autoMove";
import { legalBids } from "./legalBids";
import type { MultiplayerCommand } from "./commands";
import type { MultiplayerEvent } from "./events";
import { shuffleMultiplayerDominoSet } from "./determinism";
import { createMultiplayerGameSetup } from "./gameSetup";
import {
  applyDisableAutoPlay,
  applyPlayerActivity,
  applyPlayerDisconnect,
  applyPlayerForfeit,
  applyPlayerResume,
  applyTimeoutInactivity
} from "./inactivity";
import {
  createInitialMultiplayerGameState,
  type MultiplayerActionType,
  type MultiplayerGameState
} from "./types";

export interface MultiplayerApplyError {
  readonly code: string;
  readonly message: string;
}

export interface MultiplayerApplyResult {
  readonly nextState: MultiplayerGameState | undefined;
  readonly events: readonly MultiplayerEvent[];
  readonly errors: readonly MultiplayerApplyError[];
  readonly invariantViolations: readonly string[];
}

export function applyCommand(
  state: MultiplayerGameState | undefined,
  command: MultiplayerCommand
): MultiplayerApplyResult {
  switch (command.type) {
    case "CREATE_GAME":
      return applyCreateGame(state, command);
    case "START_TURN":
      return requireExistingState(state, command, (currentState) =>
        applyStartTurn(currentState, command)
      );
    case "START_NEXT_ROUND":
      return requireExistingState(state, command, (currentState) =>
        applyStartNextRound(currentState)
      );
    case "SUBMIT_BID":
      return requireExistingState(state, command, (currentState) =>
        applySubmitBid(currentState, command)
      );
    case "SUBMIT_MOVE":
      return requireExistingState(state, command, (currentState) =>
        applySubmitMove(currentState, command)
      );
    case "TURN_TIMEOUT":
      return requireExistingState(state, command, (currentState) =>
        applyTurnTimeout(currentState, command)
      );
    case "DISABLE_AUTO_PLAY":
      return requireExistingState(state, command, (currentState) =>
        applyDisableAutoPlayCommand(currentState, command)
      );
    case "PLAYER_DISCONNECT":
      return requireExistingState(state, command, (currentState) =>
        applyPlayerDisconnectCommand(currentState, command)
      );
    case "PLAYER_RESUME":
      return requireExistingState(state, command, (currentState) =>
        applyPlayerResumeCommand(currentState, command)
      );
    case "PLAYER_FORFEIT":
      return requireExistingState(state, command, (currentState) =>
        applyPlayerForfeitCommand(currentState, command)
      );
    case "REQUEST_SNAPSHOT":
      return requireExistingState(state, command, (currentState) =>
        ok(currentState, [])
      );
    default:
      return requireExistingState(state, command, (currentState) =>
        fail(currentState, "command_not_implemented", `${command.type} is not implemented yet.`)
      );
  }
}

function applyPlayerDisconnectCommand(
  state: MultiplayerGameState,
  command: Extract<MultiplayerCommand, { readonly type: "PLAYER_DISCONNECT" }>
): MultiplayerApplyResult {
  const playerError = validateHumanPlayer(state, command.playerId, command.type);
  if (playerError) {
    return fail(state, playerError.code, playerError.message);
  }

  const nextState = applyPlayerDisconnect(state, command.playerId);
  const eventSeq = state.eventSeq + 1;
  return ok(
    {
      ...nextState,
      eventSeq
    },
    [
      {
        type: "PLAYER_DISCONNECTED",
        gameId: state.gameId,
        eventSeq,
        playerId: command.playerId
      }
    ]
  );
}

function applyPlayerForfeitCommand(
  state: MultiplayerGameState,
  command: Extract<MultiplayerCommand, { readonly type: "PLAYER_FORFEIT" }>
): MultiplayerApplyResult {
  const playerError = validateHumanPlayer(state, command.playerId, command.type);
  if (playerError) {
    return fail(state, playerError.code, playerError.message);
  }

  // Spēlētājs neatgriezeniski pamet → sēdvieta kļūst par botu (auto-spēlē).
  const nextState = applyPlayerForfeit(state, command.playerId);
  const eventSeq = state.eventSeq + 1;
  return ok(
    {
      ...nextState,
      eventSeq
    },
    [
      {
        type: "PLAYER_LEFT",
        gameId: state.gameId,
        eventSeq,
        playerId: command.playerId
      }
    ]
  );
}

function applyPlayerResumeCommand(
  state: MultiplayerGameState,
  command: Extract<MultiplayerCommand, { readonly type: "PLAYER_RESUME" }>
): MultiplayerApplyResult {
  const playerError = validateHumanPlayer(state, command.playerId, command.type);
  if (playerError) {
    return fail(state, playerError.code, playerError.message);
  }

  const nextState = applyPlayerResume(state, command.playerId);
  const eventSeq = state.eventSeq + 1;
  return ok(
    {
      ...nextState,
      eventSeq
    },
    [
      {
        type: "PLAYER_RESUMED",
        gameId: state.gameId,
        eventSeq,
        playerId: command.playerId
      }
    ]
  );
}

function applyDisableAutoPlayCommand(
  state: MultiplayerGameState,
  command: Extract<MultiplayerCommand, { readonly type: "DISABLE_AUTO_PLAY" }>
): MultiplayerApplyResult {
  const playerError = validateHumanPlayer(state, command.playerId, command.type);
  if (playerError) {
    return fail(state, playerError.code, playerError.message);
  }

  const nextState = applyDisableAutoPlay(state, command.playerId);
  const eventSeq = state.eventSeq + 1;
  return ok(
    {
      ...nextState,
      eventSeq
    },
    [
      {
        type: "AUTO_PLAY_DISABLED",
        gameId: state.gameId,
        eventSeq,
        playerId: command.playerId
      }
    ]
  );
}

function applyTurnTimeout(
  state: MultiplayerGameState,
  command: Extract<MultiplayerCommand, { readonly type: "TURN_TIMEOUT" }>
): MultiplayerApplyResult {
  const timeoutError = validateTimeoutAction(state, command.turnId, command.now);
  if (timeoutError) {
    return fail(state, timeoutError.code, timeoutError.message);
  }

  const turn = state.currentTurn!;
  const stateWithInactivity = applyTimeoutInactivity(state, turn.playerId);
  const timeoutEvents = createTimeoutEvents(state, stateWithInactivity, turn);

  if (turn.phase === "bidding") {
    // Solījuma timeout → piespiedu drošais solījums (0), lai spēle nekad
    // neiestrēgst, ja spēlētājs apzināti neko neizvēlas. Ja noteikumi 0 neatļauj,
    // izvēlamies mazāko atļauto. (Ja vispār nav atļautu solījumu → kļūda.)
    const bid = forcedTimeoutBid(stateWithInactivity, turn.playerId);
    if (bid === undefined) {
      return fail(state, "auto_bid_unavailable", "No legal bid is available for the timed-out turn.");
    }

    return applyAutoBidAfterTimeout(stateWithInactivity, timeoutEvents, bid);
  }

  if (turn.phase === "playing") {
    const move = autoMove(stateWithInactivity, turn.playerId);
    if (!move) {
      return applyNoLegalAutoMoveFallback(stateWithInactivity, timeoutEvents);
    }

    return applyAutoMoveAfterTimeout(stateWithInactivity, timeoutEvents, move);
  }

  return fail(
    state,
    "turn_phase_not_active",
    `TURN_TIMEOUT is not allowed during ${turn.phase}.`
  );
}

function createTimeoutEvents(
  stateBeforeTimeout: MultiplayerGameState,
  stateAfterTimeout: MultiplayerGameState,
  turn: NonNullable<MultiplayerGameState["currentTurn"]>
): MultiplayerEvent[] {
  const timeoutEventSeq = stateBeforeTimeout.eventSeq + 1;
  const events: MultiplayerEvent[] = [
    {
      type: "TURN_TIMEOUT",
      gameId: stateBeforeTimeout.gameId,
      eventSeq: timeoutEventSeq,
      turnId: turn.turnId,
      playerId: turn.playerId
    }
  ];

  const playerBefore = stateBeforeTimeout.players.find(
    (player) => player.playerId === turn.playerId
  );
  const playerAfter = stateAfterTimeout.players.find(
    (player) => player.playerId === turn.playerId
  );
  if (playerBefore && playerAfter && !playerBefore.autoPlayEnabled && playerAfter.autoPlayEnabled) {
    events.push({
      type: "AUTO_PLAY_ENABLED",
      gameId: stateBeforeTimeout.gameId,
      eventSeq: timeoutEventSeq + 1,
      playerId: turn.playerId,
      phase: turn.phase
    });
  }

  return events;
}

function applyNoLegalAutoMoveFallback(
  state: MultiplayerGameState,
  timeoutEvents: readonly MultiplayerEvent[]
): MultiplayerApplyResult {
  const turn = state.currentTurn!;
  const fallbackEventSeq = lastEventSeq(timeoutEvents) + 1;

  return ok(
    {
      ...state,
      currentTurn: undefined,
      eventSeq: fallbackEventSeq
    },
    [
      ...timeoutEvents,
      {
        type: "AUTO_MOVE_FALLBACK",
        gameId: state.gameId,
        eventSeq: fallbackEventSeq,
        playerId: turn.playerId,
        turnId: turn.turnId,
        reason: "NO_LEGAL_MOVE"
      }
    ]
  );
}

function applyAutoBidAfterTimeout(
  state: MultiplayerGameState,
  timeoutEvents: readonly MultiplayerEvent[],
  bid: number
): MultiplayerApplyResult {
  const turn = state.currentTurn!;

  try {
    const nextCoreState = makeBid(state.coreState, bid);
    const bidEventSeq = lastEventSeq(timeoutEvents) + 1;
    return ok(
      {
        ...state,
        coreState: nextCoreState,
        currentTurn: undefined,
        eventSeq: bidEventSeq
      },
      [
        ...timeoutEvents,
        {
          type: "BID_ACCEPTED",
          gameId: state.gameId,
          eventSeq: bidEventSeq,
          playerId: turn.playerId,
          turnId: turn.turnId,
          bid
        }
      ]
    );
  } catch (error) {
    return fail(state, "auto_bid_rejected", getErrorMessage(error));
  }
}

function applyAutoMoveAfterTimeout(
  state: MultiplayerGameState,
  timeoutEvents: readonly MultiplayerEvent[],
  move: NonNullable<ReturnType<typeof autoMove>>
): MultiplayerApplyResult {
  const turn = state.currentTurn!;

  try {
    const moveResult = playTile(state.coreState, move.tile, move.declaredNumber);
    if (moveResult.state === state.coreState) {
      return fail(state, "auto_move_rejected", "Auto-move was rejected by core rules.");
    }

    const moveEventSeq = lastEventSeq(timeoutEvents) + 1;
    const moveEvent: MultiplayerEvent = {
      type: "MOVE_ACCEPTED",
      gameId: state.gameId,
      eventSeq: moveEventSeq,
      playerId: turn.playerId,
      turnId: turn.turnId,
      tile: move.tile,
      ...(move.declaredNumber !== undefined
        ? { declaredNumber: move.declaredNumber }
        : {})
    };

    if (!moveResult.trickComplete) {
      return ok(
        {
          ...state,
          coreState: moveResult.state,
          currentTurn: undefined,
          eventSeq: moveEventSeq
        },
        [...timeoutEvents, moveEvent]
      );
    }

    const completedTrickState = completeTrick(moveResult.state);
    const winnerIndex =
      completedTrickState.trickWinners[completedTrickState.trickWinners.length - 1];
    const winner = winnerIndex === undefined
      ? undefined
      : completedTrickState.players[winnerIndex];

    if (!winner) {
      return {
        nextState: state,
        events: [],
        errors: [],
        invariantViolations: [
          "completeTrick finished without a resolvable trick winner."
        ]
      };
    }

    const trickEventSeq = moveEventSeq + 1;
    return ok(
      {
        ...state,
        coreState: completedTrickState,
        currentTurn: undefined,
        eventSeq: trickEventSeq
      },
      [
        ...timeoutEvents,
        moveEvent,
        {
          type: "TRICK_COMPLETED",
          gameId: state.gameId,
          eventSeq: trickEventSeq,
          winnerPlayerId: winner.id
        }
      ]
    );
  } catch (error) {
    return fail(state, "auto_move_rejected", getErrorMessage(error));
  }
}

/**
 * Solījuma timeout drošais noklusējums: 0, ja noteikumi to atļauj (parasti vienmēr),
 * citādi mazākais atļautais solījums. `undefined`, ja nav neviena atļauta solījuma.
 */
function forcedTimeoutBid(state: MultiplayerGameState, playerId: string): number | undefined {
  const allowed = legalBids(state, playerId);
  if (allowed.length === 0) return undefined;
  return allowed.includes(0) ? 0 : allowed[0]!;
}

function lastEventSeq(events: readonly MultiplayerEvent[]): number {
  const lastEvent = events[events.length - 1];
  if (!lastEvent) {
    throw new Error("Expected at least one multiplayer event.");
  }
  return lastEvent.eventSeq;
}

function applyStartTurn(
  state: MultiplayerGameState,
  command: Extract<MultiplayerCommand, { readonly type: "START_TURN" }>
): MultiplayerApplyResult {
  const turnId = command.turnId.trim();
  if (turnId === "") {
    return fail(state, "invalid_turn_id", "START_TURN requires a non-empty turnId.");
  }
  if (!Number.isFinite(command.now)) {
    return fail(state, "invalid_now", "START_TURN requires a finite injected now value.");
  }

  // State machine aizsargā savu invariantu: ja turns jau aktīvs, dubults START_TURN
  // pārrakstītu deadline/turnId un palaistu paralēlu taimeri. Atsakām te, nevis
  // paļaujamies uz ārējo routing disciplīnu.
  if (state.currentTurn !== undefined) {
    return fail(
      state,
      "turn_already_active",
      "START_TURN is not allowed while a turn is already active."
    );
  }

  const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex];
  if (!currentPlayer) {
    return fail(state, "wrong_player", "START_TURN requires an existing current player.");
  }

  const allowedActionTypes = getAllowedActionTypesForPhase(state.coreState.phase);
  if (allowedActionTypes.length === 0) {
    return fail(
      state,
      "turn_phase_not_active",
      `START_TURN is not allowed during ${state.coreState.phase}.`
    );
  }

  const turn = {
    turnId,
    playerId: currentPlayer.id,
    startedAt: command.now,
    deadlineAt: command.now + state.turnDurationMs,
    allowedActionTypes,
    phase: state.coreState.phase
  };
  const eventSeq = state.eventSeq + 1;
  return ok(
    {
      ...state,
      currentTurn: turn,
      eventSeq
    },
    [
      {
        type: "TURN_STARTED",
        gameId: state.gameId,
        eventSeq,
        turn
      }
    ]
  );
}

function getAllowedActionTypesForPhase(
  phase: MultiplayerGameState["coreState"]["phase"]
): readonly MultiplayerActionType[] {
  switch (phase) {
    case "bidding":
      return ["SUBMIT_BID"];
    case "playing":
      return ["SUBMIT_MOVE"];
    default:
      return [];
  }
}

function applyStartNextRound(state: MultiplayerGameState): MultiplayerApplyResult {
  if (state.coreState.phase !== "roundEnd") {
    return fail(
      state,
      "round_not_ready",
      "START_NEXT_ROUND requires the current round to be finished."
    );
  }

  const nextRoundDeck =
    state.coreState.currentRound >= state.coreState.totalRounds
      ? []
      : shuffleMultiplayerDominoSet(
          `${state.seed}:round:${state.coreState.currentRound + 1}`
        );
  const nextCoreState = startNextRound(state.coreState, nextRoundDeck);
  if (nextCoreState === state.coreState) {
    return fail(state, "next_round_rejected", "Next round was rejected by core rules.");
  }

  const roundResultEventSeq = state.eventSeq + 1;
  const roundWinnerIndex = state.coreState.lastRoundWinnerIndex;
  const roundWinner =
    roundWinnerIndex === undefined
      ? undefined
      : state.coreState.players[roundWinnerIndex];
  // `state.coreState` ir PIRMS-reset (reset notiek `nextCoreState`), tāpēc šeit
  // `bid`/`tricksWon` joprojām ir šī raunda gala vērtības — uzņemam tās event-faktā.
  const playerResults = state.coreState.players.map((player) => ({
    playerId: player.id,
    bid: player.bid,
    tricksWon: player.tricksWon
  }));
  const events: MultiplayerEvent[] = [
    {
      type: "ROUND_RESULT",
      gameId: state.gameId,
      eventSeq: roundResultEventSeq,
      round: state.coreState.currentRound,
      playerResults,
      ...(roundWinner ? { winnerPlayerId: roundWinner.id } : {})
    }
  ];

  let eventSeq = roundResultEventSeq;
  if (nextCoreState.phase === "gameEnd") {
    eventSeq += 1;
    const winner = getWinner(nextCoreState);
    events.push({
      type: "GAME_OVER",
      gameId: state.gameId,
      eventSeq,
      ...(winner ? { winnerPlayerId: winner.id } : {})
    });
  }

  return ok(
    {
      ...state,
      coreState: nextCoreState,
      currentTurn: undefined,
      eventSeq
    },
    events
  );
}

function applySubmitMove(
  state: MultiplayerGameState,
  command: Extract<MultiplayerCommand, { readonly type: "SUBMIT_MOVE" }>
): MultiplayerApplyResult {
  const turnError = validateTurnAction(
    state,
    command.turnId,
    command.playerId,
    command.now,
    "SUBMIT_MOVE",
    "move"
  );
  if (turnError) {
    return fail(state, turnError.code, turnError.message);
  }

  const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== command.playerId) {
    return fail(
      state,
      "wrong_player",
      `Player ${command.playerId} is not the current moving player.`
    );
  }

  try {
    const moveResult = playTile(state.coreState, command.tile, command.declaredNumber);
    if (moveResult.state === state.coreState) {
      return fail(state, "move_rejected", "Move was rejected by core rules.");
    }

    const moveEventSeq = state.eventSeq + 1;
    const stateWithActivity = applyPlayerActivity(state, command.playerId);
    if (moveResult.trickComplete) {
      const completedTrickState = completeTrick(moveResult.state);
      const winnerIndex =
        completedTrickState.trickWinners[completedTrickState.trickWinners.length - 1];
      const winner = winnerIndex === undefined
        ? undefined
        : completedTrickState.players[winnerIndex];

      if (!winner) {
        return {
          nextState: state,
          events: [],
          errors: [],
          invariantViolations: [
            "completeTrick finished without a resolvable trick winner."
          ]
        };
      }

      const trickEventSeq = moveEventSeq + 1;
      return ok(
        {
          ...stateWithActivity,
          coreState: completedTrickState,
          currentTurn: undefined,
          eventSeq: trickEventSeq
        },
        [
          {
            type: "MOVE_ACCEPTED",
            gameId: state.gameId,
            eventSeq: moveEventSeq,
            playerId: command.playerId,
            turnId: command.turnId,
            tile: command.tile,
            ...(command.declaredNumber !== undefined
              ? { declaredNumber: command.declaredNumber }
              : {})
          },
          {
            type: "TRICK_COMPLETED",
            gameId: state.gameId,
            eventSeq: trickEventSeq,
            winnerPlayerId: winner.id
          }
        ]
      );
    }

    return ok(
      {
        ...stateWithActivity,
        coreState: moveResult.state,
        currentTurn: undefined,
        eventSeq: moveEventSeq
      },
      [
        {
          type: "MOVE_ACCEPTED",
          gameId: state.gameId,
          eventSeq: moveEventSeq,
          playerId: command.playerId,
          turnId: command.turnId,
          tile: command.tile,
          ...(command.declaredNumber !== undefined
            ? { declaredNumber: command.declaredNumber }
            : {})
        }
      ]
    );
  } catch (error) {
    return fail(state, "move_rejected", getErrorMessage(error));
  }
}

function applySubmitBid(
  state: MultiplayerGameState,
  command: Extract<MultiplayerCommand, { readonly type: "SUBMIT_BID" }>
): MultiplayerApplyResult {
  const turnError = validateTurnAction(
    state,
    command.turnId,
    command.playerId,
    command.now,
    "SUBMIT_BID",
    "bid"
  );
  if (turnError) {
    return fail(state, turnError.code, turnError.message);
  }

  const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== command.playerId) {
    return fail(
      state,
      "wrong_player",
      `Player ${command.playerId} is not the current bidding player.`
    );
  }

  try {
    const nextCoreState = makeBid(state.coreState, command.bid);
    const eventSeq = state.eventSeq + 1;
    const stateWithActivity = applyPlayerActivity(state, command.playerId);
    return ok(
      {
        ...stateWithActivity,
        coreState: nextCoreState,
        currentTurn: undefined,
        eventSeq
      },
      [
        {
          type: "BID_ACCEPTED",
          gameId: state.gameId,
          eventSeq,
          playerId: command.playerId,
          turnId: command.turnId,
          bid: command.bid
        }
      ]
    );
  } catch (error) {
    return fail(state, "bid_rejected", getErrorMessage(error));
  }
}

function applyCreateGame(
  state: MultiplayerGameState | undefined,
  command: Extract<MultiplayerCommand, { readonly type: "CREATE_GAME" }>
): MultiplayerApplyResult {
  if (state !== undefined) {
    return fail(state, "game_already_created", "Game has already been created.");
  }

  try {
    const setup = createMultiplayerGameSetup({
      gameId: command.gameId,
      seed: command.seed,
      playerName: command.playerName,
      numberOfRounds: command.numberOfRounds,
      humanSeatIndices: command.humanSeatIndices,
      turnDurationMs: command.turnDurationMs
    });
    return ok(createInitialMultiplayerGameState(setup), []);
  } catch (error) {
    return fail(undefined, "create_game_failed", getErrorMessage(error));
  }
}

function validateTurnAction(
  state: MultiplayerGameState,
  turnId: string,
  playerId: string,
  now: number,
  actionType: "SUBMIT_BID" | "SUBMIT_MOVE" | "TURN_TIMEOUT",
  actionLabel: "bid" | "move" | "timeout"
): MultiplayerApplyError | undefined {
  const turn = state.currentTurn;
  if (!turn) {
    return {
      code: "turn_not_started",
      message: `${actionLabel} requires an active turn.`
    };
  }

  if (turn.turnId !== turnId) {
    return {
      code: "turn_id_mismatch",
      message: `Command turnId ${turnId} does not match current turn.`
    };
  }

  if (!Number.isFinite(now)) {
    return {
      code: "invalid_now",
      message: `${actionLabel} requires a finite injected now value.`
    };
  }

  if (now > turn.deadlineAt) {
    return {
      code: "ACTION_TOO_LATE",
      message: `${actionLabel} was submitted after the current turn deadline.`
    };
  }

  if (turn.playerId !== playerId) {
    return {
      code: "wrong_player",
      message: `Player ${playerId} does not own the current turn.`
    };
  }

  if (!turn.allowedActionTypes.includes(actionType)) {
    return {
      code: "action_not_allowed",
      message: `${actionLabel} is not allowed for the current turn.`
    };
  }

  return undefined;
}

function validateTimeoutAction(
  state: MultiplayerGameState,
  turnId: string,
  now: number
): MultiplayerApplyError | undefined {
  const turn = state.currentTurn;
  if (!turn) {
    return {
      code: "turn_not_started",
      message: "timeout requires an active turn."
    };
  }

  if (turn.turnId !== turnId) {
    return {
      code: "turn_id_mismatch",
      message: `Command turnId ${turnId} does not match current turn.`
    };
  }

  if (!Number.isFinite(now)) {
    return {
      code: "invalid_now",
      message: "timeout requires a finite injected now value."
    };
  }

  if (now <= turn.deadlineAt) {
    return {
      code: "timeout_not_due",
      message: "TURN_TIMEOUT is only allowed after the current turn deadline."
    };
  }

  return undefined;
}

function validateHumanPlayer(
  state: MultiplayerGameState,
  playerId: string,
  commandType: "DISABLE_AUTO_PLAY" | "PLAYER_DISCONNECT" | "PLAYER_RESUME" | "PLAYER_FORFEIT"
): MultiplayerApplyError | undefined {
  const player = state.players.find((candidate) => candidate.playerId === playerId);
  if (!player) {
    return {
      code: "player_not_found",
      message: `${commandType} requires an existing multiplayer player.`
    };
  }

  if (player.status === "bot") {
    return {
      code: "player_is_bot",
      message: `${commandType} is only allowed for human players.`
    };
  }

  return undefined;
}

function requireExistingState(
  state: MultiplayerGameState | undefined,
  command: MultiplayerCommand,
  apply: (state: MultiplayerGameState) => MultiplayerApplyResult
): MultiplayerApplyResult {
  if (state === undefined) {
    return fail(undefined, "game_not_created", `${command.type} requires an existing game.`);
  }

  if (command.gameId !== state.gameId) {
    return fail(state, "game_id_mismatch", `Command gameId ${command.gameId} does not match current game.`);
  }

  return apply(state);
}

function ok(
  nextState: MultiplayerGameState | undefined,
  events: readonly MultiplayerEvent[]
): MultiplayerApplyResult {
  return {
    nextState,
    events,
    errors: [],
    invariantViolations: []
  };
}

function fail(
  nextState: MultiplayerGameState | undefined,
  code: string,
  message: string
): MultiplayerApplyResult {
  return {
    nextState,
    events: [],
    errors: [{ code, message }],
    invariantViolations: []
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown multiplayer command error.";
}
