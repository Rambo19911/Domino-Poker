import {
  applyCommand,
  assertInvariants,
  legalBids,
  legalMoves,
  type MultiplayerApplyResult,
  type MultiplayerCommand,
  type MultiplayerGameState
} from "@domino-poker/core/multiplayer";

import { createSimulationRng, pick } from "./random.js";

/** Drošības robeža pret bezgalīgu cilpu, ja spēle kaut kā neiestrēgst. */
const MAX_COMMANDS = 20_000;
/** Sintētisks laika solis starp gājieniem (ms); turnam vienmēr pietiek laika. */
const NOW_STEP_MS = 1_000;

export interface RandomGameOptions {
  /** Kārtu skaits partijā (noklusējums seko core noklusējumam). */
  readonly numberOfRounds?: number | undefined;
  /**
   * Varbūtība [0..1], ka turns notimeoutosies, nevis veiks parastu darbību.
   * 0 = nekad (tīrs solījumu/gājienu simulators), 1 = vienmēr (pilnībā AFK
   * partija, ko dzen tikai auto-darbības). Noklusējums 0.
   */
  readonly timeoutProbability?: number | undefined;
  /**
   * Varbūtība [0..1], ka pirms cilvēka spēlētāja turna tiek pārslēgts viņa
   * savienojuma stāvoklis (PLAYER_DISCONNECT ↔ PLAYER_RESUME). Atvienots
   * spēlētājs savu turnu vienmēr atrisina caur TURN_TIMEOUT. Noklusējums 0.
   */
  readonly disconnectProbability?: number | undefined;
}

export interface RandomGameResult {
  readonly seed: string;
  readonly gameId: string;
  readonly reachedTerminal: boolean;
  readonly finalPhase: string;
  readonly rounds: number;
  readonly commandCount: number;
  readonly turnCount: number;
  /** Cik turnu tika atrisināti caur TURN_TIMEOUT (auto-darbība), ne parastu submit. */
  readonly timeoutCount: number;
  /** Cik reižu cilvēka spēlētājs tika atvienots (PLAYER_DISCONNECT). */
  readonly disconnectCount: number;
  /** Cik reižu cilvēka spēlētājs tika atkalpieslēgts (PLAYER_RESUME). */
  readonly reconnectCount: number;
  /** Vēsturiskā secība, kādā tika izsniegti turnId (monotonitātes pārbaudei). */
  readonly turnIds: readonly string[];
  /**
   * Kompakts izvēļu žurnāls (piem. `b:3`, `m:5-6`). Atspoguļo faktisko spēles
   * gaitu, tāpēc dažādas sēklas praktiski vienmēr dod atšķirīgu žurnālu.
   */
  readonly decisions: readonly string[];
}

/**
 * Izspēlē vienu pilnu partiju ar nejaušiem **legāliem** solījumiem un gājieniem
 * caur `applyCommand`. Pēc katras komandas izsauc `assertInvariants`, kā arī
 * verificē, ka nekad nav divu aktīvu turn vienlaikus un ka `turnId` virzās uz
 * priekšu. Determinisms ir pilnīgs: tā pati sēkla → tā pati partija.
 *
 * Ja `timeoutProbability > 0`, daļa turnu (vai visi) tiek atrisināti caur
 * TURN_TIMEOUT, kas iekšēji izsauc deterministisku auto-bid/auto-move. Timeout
 * lēmumiem ir **atsevišķa** RNG straume, tāpēc gājienu izvēļu plūsma paliek
 * nemainīga neatkarīgi no timeout iestatījuma.
 */
export function simulateRandomGame(
  seed: string,
  options: RandomGameOptions = {}
): RandomGameResult {
  const gameId = `sim-${seed}`;
  const rng = createSimulationRng(`${seed}:decisions`);
  const timeoutProbability = normalizeProbability(
    options.timeoutProbability,
    "timeoutProbability"
  );
  const timeoutRng =
    timeoutProbability > 0 ? createSimulationRng(`${seed}:timeouts`) : undefined;
  const disconnectProbability = normalizeProbability(
    options.disconnectProbability,
    "disconnectProbability"
  );
  const disconnectRng =
    disconnectProbability > 0 ? createSimulationRng(`${seed}:disconnect`) : undefined;
  const disconnected = new Set<string>();

  let requestCounter = 0;
  const nextRequestId = (label: string): string => {
    requestCounter += 1;
    return `${seed}:${label}:${requestCounter}`;
  };

  let state = expectState(
    applyCommand(undefined, {
      type: "CREATE_GAME",
      gameId,
      requestId: nextRequestId("create"),
      seed,
      ...(options.numberOfRounds !== undefined
        ? { numberOfRounds: options.numberOfRounds }
        : {})
    }),
    "CREATE_GAME"
  );
  assertInvariants(state);

  let commandCount = 1;
  let turnCounter = 0;
  let timeoutCount = 0;
  let disconnectCount = 0;
  let reconnectCount = 0;
  const turnIds: string[] = [];
  const decisions: string[] = [];
  let now = 0;

  const step = (command: MultiplayerCommand): MultiplayerGameState => {
    const next = expectState(applyCommand(state, command), command.type);
    assertInvariants(next);
    commandCount += 1;
    return next;
  };

  while (state.coreState.phase !== "gameEnd") {
    if (commandCount > MAX_COMMANDS) {
      throw new Error(
        `Simulation ${seed} exceeded ${MAX_COMMANDS} commands without reaching gameEnd.`
      );
    }

    const phase = state.coreState.phase;

    if (phase === "roundEnd") {
      state = step({
        type: "START_NEXT_ROUND",
        gameId,
        requestId: nextRequestId("next-round")
      });
      continue;
    }

    if (phase !== "bidding" && phase !== "playing") {
      throw new Error(`Simulation ${seed} hit an unexpected phase: ${phase}.`);
    }

    // Invariants: pirms jauna turn nedrīkst būt cita aktīva turn.
    if (state.currentTurn) {
      throw new Error(
        `Simulation ${seed} tried to start a turn while one was already active.`
      );
    }

    const actingPlayer = state.coreState.players[state.coreState.currentPlayerIndex];
    if (!actingPlayer) {
      throw new Error(`Simulation ${seed} has no current player to act.`);
    }

    // Savienojuma pārslēgšana notiek starp turniem (bez aktīva turna). Tikai
    // cilvēka spēlētājus var atvienot; boti vienmēr ir "disconnected"/"bot".
    if (
      disconnectRng !== undefined &&
      !actingPlayer.isAI &&
      disconnectRng() < disconnectProbability
    ) {
      if (disconnected.has(actingPlayer.id)) {
        decisions.push(`rc:${actingPlayer.id}`);
        reconnectCount += 1;
        disconnected.delete(actingPlayer.id);
        state = step({
          type: "PLAYER_RESUME",
          gameId,
          requestId: nextRequestId("resume"),
          playerId: actingPlayer.id
        });
      } else {
        decisions.push(`dc:${actingPlayer.id}`);
        disconnectCount += 1;
        disconnected.add(actingPlayer.id);
        state = step({
          type: "PLAYER_DISCONNECT",
          gameId,
          requestId: nextRequestId("disconnect"),
          playerId: actingPlayer.id
        });
      }
    }

    now += NOW_STEP_MS;
    turnCounter += 1;
    const turnId = `turn-${turnCounter}`;
    state = step({
      type: "START_TURN",
      gameId,
      requestId: nextRequestId("start-turn"),
      turnId,
      now
    });

    const activeTurn = state.currentTurn;
    if (!activeTurn || activeTurn.turnId !== turnId) {
      throw new Error(`Simulation ${seed} failed to open turn ${turnId}.`);
    }
    assertTurnMonotonic(turnIds, turnId, seed);
    turnIds.push(turnId);

    const currentPlayer = actingPlayer;

    // Atvienots spēlētājs nevar atbildēt → viņa turns vienmēr notimeoutojas.
    // Pretējā gadījumā lemj parastā timeout varbūtība (atsevišķa straume).
    const useTimeout =
      disconnected.has(currentPlayer.id) ||
      (timeoutRng !== undefined && timeoutRng() < timeoutProbability);

    if (useTimeout) {
      // TURN_TIMEOUT prasa now > deadlineAt; auto-darbība notiek core pusē.
      now = activeTurn.deadlineAt + 1;
      decisions.push(phase === "bidding" ? "to:bid" : "to:move");
      timeoutCount += 1;
      state = step({
        type: "TURN_TIMEOUT",
        gameId,
        requestId: nextRequestId("timeout"),
        turnId,
        now
      });
    } else if (phase === "bidding") {
      const bid = pick(rng, legalBids(state, currentPlayer.id));
      decisions.push(`b:${bid}`);
      state = step({
        type: "SUBMIT_BID",
        gameId,
        requestId: nextRequestId("bid"),
        playerId: currentPlayer.id,
        turnId,
        now,
        bid
      });
    } else {
      const move = pick(rng, legalMoves(state, currentPlayer.id));
      const declaredSuffix =
        move.declaredNumber !== undefined ? `=${move.declaredNumber}` : "";
      decisions.push(`m:${move.tile.side1}-${move.tile.side2}${declaredSuffix}`);
      state = step({
        type: "SUBMIT_MOVE",
        gameId,
        requestId: nextRequestId("move"),
        playerId: currentPlayer.id,
        turnId,
        now,
        tile: move.tile,
        ...(move.declaredNumber !== undefined
          ? { declaredNumber: move.declaredNumber }
          : {})
      });
    }

    // Pēc darbības turnam jābūt aizvērtam — citādi varētu rasties divi aktīvi.
    if (state.currentTurn) {
      throw new Error(
        `Simulation ${seed} left turn ${turnId} active after a submitted action.`
      );
    }
  }

  return {
    seed,
    gameId,
    reachedTerminal: state.coreState.phase === "gameEnd",
    finalPhase: state.coreState.phase,
    rounds: state.coreState.currentRound,
    commandCount,
    turnCount: turnCounter,
    timeoutCount,
    disconnectCount,
    reconnectCount,
    turnIds,
    decisions
  };
}

function normalizeProbability(value: number | undefined, label: string): number {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be within [0, 1], received ${value}.`);
  }
  return value;
}

function assertTurnMonotonic(
  previousTurnIds: readonly string[],
  turnId: string,
  seed: string
): void {
  const previous = previousTurnIds[previousTurnIds.length - 1];
  if (previous === undefined) return;
  if (turnSequence(turnId) <= turnSequence(previous)) {
    throw new Error(
      `Simulation ${seed} turnId did not advance: ${previous} -> ${turnId}.`
    );
  }
}

function turnSequence(turnId: string): number {
  const value = Number.parseInt(turnId.replace(/^turn-/, ""), 10);
  if (!Number.isInteger(value)) {
    throw new Error(`Unexpected turnId format: ${turnId}.`);
  }
  return value;
}

function expectState(
  result: MultiplayerApplyResult,
  commandType: string
): MultiplayerGameState {
  if (result.invariantViolations.length > 0) {
    throw new Error(
      `Command ${commandType} reported invariant violations: ${result.invariantViolations.join("; ")}.`
    );
  }
  if (!result.nextState) {
    const reason = result.errors.map((error) => error.code).join(", ") || "unknown";
    throw new Error(`Command ${commandType} produced no state (errors: ${reason}).`);
  }
  return result.nextState;
}
