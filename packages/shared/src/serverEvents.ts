import type {
  MultiplayerEvent,
  PlayerSnapshot
} from "@domino-poker/core/multiplayer";

import type { ErrorPayload } from "./errors.js";
import type { RoomSummary, RoomView } from "./roomTypes.js";

/** Viena čata ziņa (autors = servera `displayId`; nekādu state/kauliņu). */
export interface ChatMessage {
  readonly id: string;
  readonly authorDisplayId: string;
  readonly text: string;
  readonly serverNow: number;
}

// ---- Serveris → klients eventi ----
export interface WelcomeEvent {
  readonly type: "WELCOME";
  readonly sessionId: string;
  readonly playerId: string;
  readonly displayId: string;
  readonly reconnectToken: string;
  readonly serverNow: number;
}

export interface RoomListEvent {
  readonly type: "ROOM_LIST";
  readonly rooms: readonly RoomSummary[];
}

export interface RoomCreatedEvent {
  readonly type: "ROOM_CREATED";
  readonly room: RoomView;
}

export interface RoomJoinedEvent {
  readonly type: "ROOM_JOINED";
  readonly room: RoomView;
}

export interface RoomViewEvent {
  readonly type: "ROOM_VIEW";
  readonly room: RoomView;
}

export interface RoomLeftEvent {
  readonly type: "ROOM_LEFT";
  readonly roomId: string;
}

export interface LobbyStateEvent {
  readonly type: "LOBBY_STATE";
  readonly rooms: readonly RoomSummary[];
  readonly onlineCount: number;
}

/**
 * Pirms-spēles atskaite: pēc `START_GAME` serveris atver galdu, bet pirmais
 * solījumu turns sākas tikai `startsAt` (servera laika autoritāte). Tas dod
 * lēnākiem klientiem laiku ielādēt galdu, pirms sākas solījumi. `serverNow`
 * ļauj klientam saskaņot pulksteni (Fāze 9); pagaidām atskaiti rāda lokāli.
 */
export interface GameStartingEvent {
  readonly type: "GAME_STARTING";
  readonly roomId: string;
  readonly startsAt: number;
  readonly serverNow: number;
}

export interface StateSnapshotEvent {
  readonly type: "STATE_SNAPSHOT";
  readonly roomId: string;
  readonly seq: number;
  readonly snapshot: PlayerSnapshot;
  readonly serverNow: number;
}

export interface GameEventEvent {
  readonly type: "GAME_EVENT";
  readonly roomId: string;
  readonly seq: number;
  readonly event: MultiplayerEvent;
  readonly serverNow: number;
}

export interface ChatMessageEvent extends ChatMessage {
  readonly type: "CHAT_MESSAGE";
}

export interface ChatHistoryEvent {
  readonly type: "CHAT_HISTORY";
  readonly messages: readonly ChatMessage[];
}

export type ErrorEvent = { readonly type: "ERROR" } & ErrorPayload;

export interface PongEvent {
  readonly type: "PONG";
  readonly clientTime: number;
  readonly serverNow: number;
}

/** Visu servera → klients eventu diskriminētā union (pēc `type`). */
export type ServerEvent =
  | WelcomeEvent
  | RoomListEvent
  | RoomCreatedEvent
  | RoomJoinedEvent
  | RoomViewEvent
  | RoomLeftEvent
  | LobbyStateEvent
  | GameStartingEvent
  | StateSnapshotEvent
  | GameEventEvent
  | ChatMessageEvent
  | ChatHistoryEvent
  | ErrorEvent
  | PongEvent;

export type ServerEventType = ServerEvent["type"];
