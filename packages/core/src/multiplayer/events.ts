import type { DominoTile, GamePhase } from "../types";
import type { MultiplayerPlayerState, MultiplayerTurnState } from "./types";

export const multiplayerEventTypes = [
  "TURN_STARTED",
  "BID_ACCEPTED",
  "MOVE_ACCEPTED",
  "TURN_TIMEOUT",
  "TRICK_COMPLETED",
  "ROUND_RESULT",
  "GAME_OVER",
  "PLAYER_JOINED",
  "PLAYER_LEFT",
  "PLAYER_DISCONNECTED",
  "PLAYER_RESUMED",
  "AUTO_PLAY_ENABLED",
  "AUTO_PLAY_DISABLED",
  "AUTO_MOVE_FALLBACK"
] as const;

export type MultiplayerEventType = (typeof multiplayerEventTypes)[number];

interface MultiplayerEventBase<TType extends MultiplayerEventType> {
  readonly type: TType;
  readonly gameId: string;
  readonly eventSeq: number;
}

export interface TurnStartedEvent extends MultiplayerEventBase<"TURN_STARTED"> {
  readonly turn: MultiplayerTurnState;
}

export interface BidAcceptedEvent extends MultiplayerEventBase<"BID_ACCEPTED"> {
  readonly playerId: string;
  readonly turnId: string;
  readonly bid: number;
}

export interface MoveAcceptedEvent extends MultiplayerEventBase<"MOVE_ACCEPTED"> {
  readonly playerId: string;
  readonly turnId: string;
  readonly tile: DominoTile;
  readonly declaredNumber?: number | undefined;
}

export interface TurnTimeoutEvent extends MultiplayerEventBase<"TURN_TIMEOUT"> {
  readonly turnId: string;
  readonly playerId: string;
}

export interface TrickCompletedEvent
  extends MultiplayerEventBase<"TRICK_COMPLETED"> {
  readonly winnerPlayerId: string;
}

export interface RoundResultEvent extends MultiplayerEventBase<"ROUND_RESULT"> {
  readonly round: number;
  readonly winnerPlayerId?: string | undefined;
}

export interface GameOverEvent extends MultiplayerEventBase<"GAME_OVER"> {
  readonly winnerPlayerId?: string | undefined;
}

export interface PlayerJoinedEvent extends MultiplayerEventBase<"PLAYER_JOINED"> {
  readonly player: MultiplayerPlayerState;
}

export interface PlayerLeftEvent extends MultiplayerEventBase<"PLAYER_LEFT"> {
  readonly playerId: string;
}

export interface PlayerDisconnectedEvent
  extends MultiplayerEventBase<"PLAYER_DISCONNECTED"> {
  readonly playerId: string;
}

export interface PlayerResumedEvent
  extends MultiplayerEventBase<"PLAYER_RESUMED"> {
  readonly playerId: string;
}

export interface AutoPlayEnabledEvent
  extends MultiplayerEventBase<"AUTO_PLAY_ENABLED"> {
  readonly playerId: string;
  readonly phase: GamePhase;
}

export interface AutoPlayDisabledEvent
  extends MultiplayerEventBase<"AUTO_PLAY_DISABLED"> {
  readonly playerId: string;
}

export interface AutoMoveFallbackEvent
  extends MultiplayerEventBase<"AUTO_MOVE_FALLBACK"> {
  readonly playerId: string;
  readonly turnId: string;
  readonly reason: "NO_LEGAL_MOVE";
}

export type MultiplayerEvent =
  | TurnStartedEvent
  | BidAcceptedEvent
  | MoveAcceptedEvent
  | TurnTimeoutEvent
  | TrickCompletedEvent
  | RoundResultEvent
  | GameOverEvent
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | PlayerDisconnectedEvent
  | PlayerResumedEvent
  | AutoPlayEnabledEvent
  | AutoPlayDisabledEvent
  | AutoMoveFallbackEvent;
