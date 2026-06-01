import type { GamePhase, GameState } from "../types";
import type { MultiplayerGameSetup } from "./gameSetup";

export type MultiplayerPlayerStatus =
  | "active"
  | "active_with_warning"
  | "inactive"
  | "auto_play"
  | "bot";

export type MultiplayerConnectionState = "connected" | "disconnected";

export type MultiplayerActionType = "SUBMIT_BID" | "SUBMIT_MOVE" | "TURN_TIMEOUT";

export interface MultiplayerTurnState {
  readonly turnId: string;
  readonly playerId: string;
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly allowedActionTypes: readonly MultiplayerActionType[];
  readonly phase: GamePhase;
}

export interface MultiplayerPlayerState {
  readonly playerId: string;
  readonly seatIndex: number;
  readonly status: MultiplayerPlayerStatus;
  readonly inactiveScore: number;
  readonly autoPlayEnabled: boolean;
  readonly connectionState: MultiplayerConnectionState;
}

export interface MultiplayerGameState {
  readonly gameId: string;
  readonly seed: string;
  /** Turna ilgums (ms) — no kā `applyStartTurn` rēķina `deadlineAt`. */
  readonly turnDurationMs: number;
  readonly coreState: GameState;
  readonly players: readonly MultiplayerPlayerState[];
  readonly currentTurn?: MultiplayerTurnState | undefined;
  readonly eventSeq: number;
}

export function createInitialMultiplayerGameState(
  setup: MultiplayerGameSetup
): MultiplayerGameState {
  return {
    gameId: setup.metadata.gameId,
    seed: setup.metadata.seed,
    turnDurationMs: setup.metadata.turnDurationMs,
    coreState: setup.state,
    players: setup.state.players.map((player, seatIndex) => ({
      playerId: player.id,
      seatIndex,
      status: player.isAI ? "bot" : "active",
      inactiveScore: 0,
      autoPlayEnabled: false,
      connectionState: player.isAI ? "disconnected" : "connected"
    })),
    eventSeq: 0
  };
}
