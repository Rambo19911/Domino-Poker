import { z } from "zod";

import {
  maxRoomNumberOfRounds,
  minRoomNumberOfRounds
} from "./roomTypes.js";

// ---- Atkārtoti lietotie primitīvi ----
const nonEmpty = z.string().min(1);
const pip = z.number().int().min(0).max(6);

export const tileSchema = z.object({
  side1: pip,
  side2: pip
});

export const moveSchema = z.object({
  tile: tileSchema,
  declaredNumber: pip.optional()
});

export const visibilitySchema = z.enum(["public", "private"]);

// ---- Klienta → serveris ziņojumi ----
export const helloSchema = z.object({
  type: z.literal("HELLO"),
  protocolVersion: nonEmpty,
  clientBuild: z.string(),
  clientId: nonEmpty,
  reconnectToken: z.string().optional()
});

export const listRoomsSchema = z.object({ type: z.literal("LIST_ROOMS") });

export const createRoomSchema = z.object({
  type: z.literal("CREATE_ROOM"),
  visibility: visibilitySchema.optional(),
  numberOfRounds: z.number().int().min(minRoomNumberOfRounds).max(maxRoomNumberOfRounds).optional(),
  fillWithBots: z.boolean().optional()
});

export const viewRoomSchema = z.object({
  type: z.literal("VIEW_ROOM"),
  roomId: nonEmpty.optional(),
  code: nonEmpty.optional()
}).refine((message) => message.roomId !== undefined || message.code !== undefined, {
  message: "VIEW_ROOM requires roomId or code."
});

export const joinRoomSchema = z.object({
  type: z.literal("JOIN_ROOM"),
  roomId: nonEmpty.optional(),
  code: nonEmpty.optional(),
  seatIndex: z.number().int().min(0).max(3)
}).refine((message) => message.roomId !== undefined || message.code !== undefined, {
  message: "JOIN_ROOM requires roomId or code."
});

export const leaveRoomSchema = z.object({ type: z.literal("LEAVE_ROOM") });

export const fillSeatsWithBotsSchema = z.object({ type: z.literal("FILL_SEATS_WITH_BOTS") });

export const startGameSchema = z.object({ type: z.literal("START_GAME") });

export const submitBidSchema = z.object({
  type: z.literal("SUBMIT_BID"),
  requestId: nonEmpty,
  roomId: nonEmpty,
  turnId: nonEmpty,
  bid: z.number().int().min(0).max(7)
});

export const submitMoveSchema = z.object({
  type: z.literal("SUBMIT_MOVE"),
  requestId: nonEmpty,
  roomId: nonEmpty,
  turnId: nonEmpty,
  move: moveSchema
});

export const playerResumeSchema = z.object({
  type: z.literal("PLAYER_RESUME"),
  roomId: nonEmpty,
  reconnectToken: z.string().optional()
});

export const requestSnapshotSchema = z.object({
  type: z.literal("REQUEST_SNAPSHOT"),
  roomId: nonEmpty,
  lastSeq: z.number().int().min(0).optional()
});

export const sendChatSchema = z.object({
  type: z.literal("SEND_CHAT"),
  requestId: nonEmpty,
  text: z.string()
});

export const pingSchema = z.object({
  type: z.literal("PING"),
  clientTime: z.number()
});

/** Visu klienta ziņojumu diskriminētā union (pēc `type`). */
export const clientMessageSchema = z.union([
  helloSchema,
  listRoomsSchema,
  createRoomSchema,
  viewRoomSchema,
  joinRoomSchema,
  leaveRoomSchema,
  fillSeatsWithBotsSchema,
  startGameSchema,
  submitBidSchema,
  submitMoveSchema,
  playerResumeSchema,
  requestSnapshotSchema,
  sendChatSchema,
  pingSchema
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientMessageType = ClientMessage["type"];

export type Tile = z.infer<typeof tileSchema>;
export type Move = z.infer<typeof moveSchema>;

/**
 * Drošs ienākošā ziņojuma parsēšanas rezultāts. Gateway izmanto šo, lai
 * atgrieztu `INVALID_MESSAGE`, ja `success === false`.
 */
export function parseClientMessage(
  value: unknown
): { readonly success: true; readonly message: ClientMessage } | { readonly success: false; readonly error: string } {
  const result = clientMessageSchema.safeParse(value);
  if (result.success) {
    return { success: true, message: result.data };
  }
  return { success: false, error: result.error.message };
}
