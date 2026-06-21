import { z } from "zod";

import type {
  MultiplayerEvent,
  PlayerSnapshot
} from "@domino-poker/core/multiplayer";

import { errorCodeSchema, type ErrorPayload } from "./errors.js";
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
  /**
   * Opcionālā autentifikācija (aditīva, atpakaļsaderīga): aizpildīti tikai, ja
   * `HELLO` nesa derīgu `authToken`. Anonīmam šie ir `undefined` un `displayId`
   * paliek `#?????`. Ielogotam `displayId` jau ir `username` (serveris pārraksta).
   */
  readonly userId?: string;
  readonly username?: string;
  readonly avatar?: string;
  readonly isRegistered?: boolean;
  /**
   * Zelta monētu bilance (Fāze 0; aditīvs, atpakaļsaderīgs). Aizpildīts tikai
   * ielogotam lietotājam, ja serverim ir maks. Anonīmam `undefined`.
   */
  readonly goldBalance?: number;
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

/**
 * Zelta monētu bilances atjauninājums (Fāze 3): serveris to sūta KONKRĒTAM
 * spēlētājam pēc jebkuras maksas darbības (dalības maksas debets, refund, poda
 * izmaksa), lai UI atjaunina bilanci bez lapas pārlādes. Aditīvs/atpakaļsaderīgs —
 * vecs klients to ignorē (reducer izlaiž nezināmus tipus).
 */
export interface WalletUpdatedEvent {
  readonly type: "WALLET_UPDATED";
  readonly balance: number;
  /**
   * Tikai poda IZMAKSĀ (Fāze 6): šajā darbībā nopelnītās monētas (>0), lai spēles
   * beigu summary var parādīt "+N". Debetam/refundam nav klāt (atpakaļsaderīgs).
   */
  readonly coinsWon?: number;
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
  | PongEvent
  | WalletUpdatedEvent;

export type ServerEventType = ServerEvent["type"];

/**
 * Cross-instance fanout ziņojums (transporta līgums). Dzīvo `shared`, jo tas ietin
 * `ServerEvent` un to lieto gan WS gateway, gan Postgres event bus.
 */
export type ServerEventFanoutMessage =
  | { readonly kind: "broadcast"; readonly event: ServerEvent }
  | { readonly kind: "player"; readonly playerId: string; readonly event: ServerEvent }
  | { readonly kind: "supersede"; readonly playerId: string };

// ---- Runtime validācija servera → klients eventiem (boundary aizsardzība) ----
// Validējam ENVELOPE (diskriminantu + skalāros laukus), bet NE core-atvasinātos
// ligzdotos payload (`snapshot`, `event`) un shared kompozītus (`room`, `rooms`,
// `messages`) — tos ražo uzticamais serveris. Dziļa to pārvalidācija šeit atkārtoti
// sasaistītu `shared` ar `core` iekšējo struktūru (audita 7. punkts). Reālais risks,
// ko sedzam, ir versiju neatbilstība / proxy bojājums / nogriezts kadrs — tos noķer
// diskriminanta + skalāru tipu pārbaude. Klienta reducer jau ignorē nezināmus tipus.
const passthrough = z.unknown();

/** Servera → klients eventa runtime shēma (envelope līmenī). */
export const serverEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("WELCOME"),
    sessionId: z.string(),
    playerId: z.string(),
    displayId: z.string(),
    reconnectToken: z.string(),
    serverNow: z.number(),
    userId: z.string().optional(),
    username: z.string().optional(),
    avatar: z.string().optional(),
    isRegistered: z.boolean().optional()
  }),
  z.object({ type: z.literal("ROOM_LIST"), rooms: z.array(passthrough) }),
  z.object({ type: z.literal("ROOM_CREATED"), room: passthrough }),
  z.object({ type: z.literal("ROOM_JOINED"), room: passthrough }),
  z.object({ type: z.literal("ROOM_VIEW"), room: passthrough }),
  z.object({ type: z.literal("ROOM_LEFT"), roomId: z.string() }),
  z.object({
    type: z.literal("LOBBY_STATE"),
    rooms: z.array(passthrough),
    onlineCount: z.number()
  }),
  z.object({
    type: z.literal("GAME_STARTING"),
    roomId: z.string(),
    startsAt: z.number(),
    serverNow: z.number()
  }),
  z.object({
    type: z.literal("STATE_SNAPSHOT"),
    roomId: z.string(),
    seq: z.number(),
    snapshot: passthrough,
    serverNow: z.number()
  }),
  z.object({
    type: z.literal("GAME_EVENT"),
    roomId: z.string(),
    seq: z.number(),
    event: passthrough,
    serverNow: z.number()
  }),
  z.object({
    type: z.literal("CHAT_MESSAGE"),
    id: z.string(),
    authorDisplayId: z.string(),
    text: z.string(),
    serverNow: z.number()
  }),
  z.object({ type: z.literal("CHAT_HISTORY"), messages: z.array(passthrough) }),
  z.object({
    type: z.literal("ERROR"),
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string().optional()
  }),
  z.object({ type: z.literal("PONG"), clientTime: z.number(), serverNow: z.number() }),
  z.object({
    type: z.literal("WALLET_UPDATED"),
    balance: z.number(),
    coinsWon: z.number().int().nonnegative().optional()
  })
]);

/**
 * Validē neuzticamu (tīkls/DB) vērtību kā `ServerEvent`. Veiksmes gadījumā atgriež
 * ORIĢINĀLO objektu (necaurojam ligzdotos payload), lai core dati paliek neskarti.
 */
export function parseServerEvent(
  value: unknown
): { readonly success: true; readonly event: ServerEvent } | { readonly success: false } {
  const result = serverEventSchema.safeParse(value);
  return result.success ? { success: true, event: value as ServerEvent } : { success: false };
}

/** Cross-instance fanout ziņojuma runtime shēma (ietverto eventu validē rekursīvi). */
export const serverEventFanoutSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("broadcast"), event: serverEventSchema }),
  z.object({ kind: z.literal("player"), playerId: z.string(), event: serverEventSchema }),
  z.object({ kind: z.literal("supersede"), playerId: z.string() })
]);

/** Validē neuzticamu fanout payload; veiksmē atgriež oriģinālo ziņojumu. */
export function parseServerEventFanout(
  value: unknown
):
  | { readonly success: true; readonly message: ServerEventFanoutMessage }
  | { readonly success: false } {
  const result = serverEventFanoutSchema.safeParse(value);
  return result.success
    ? { success: true, message: value as ServerEventFanoutMessage }
    : { success: false };
}
