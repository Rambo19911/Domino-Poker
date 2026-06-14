import { z } from "zod";

import {
  maxRoomNumberOfRounds,
  minRoomNumberOfRounds
} from "./roomTypes.js";

// ---- Atkārtoti lietotie primitīvi ----
/**
 * Identitātes/īso virkņu garuma robeža (M4, F4). Visas klienta-kontrolētās īsās
 * virknes (id, kodi, protokola versija, turnId) kļūst par map atslēgām un log
 * laukiem, tāpēc bez robežas neautentificēts klients varētu sūtīt vairāku megabaitu
 * virkni un pastiprināt atmiņas/žurnālu patēriņu. UUID (faktiskais formāts) ~36 rakstzīmes.
 */
export const maxIdentifierLength = 128;
/**
 * Čata teksta augšējā robeža shēmas līmenī (F4) — rupja DoS aizsardzība pirms
 * validācijas. Autoritatīvais redzamais limits (200 zīmes pēc `trim`) paliek
 * `LobbyChat`; šī robeža ar rezervi to nemaina, tikai bloķē milzu kadrus.
 */
export const maxChatTextLength = 1000;
const nonEmpty = z.string().min(1).max(maxIdentifierLength);
const pip = z.number().int().min(0).max(6);
const clientId = z.string().min(1).max(maxIdentifierLength);
const reconnectToken = z.string().max(maxIdentifierLength);

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
  clientBuild: z.string().max(maxIdentifierLength),
  clientId,
  reconnectToken: reconnectToken.optional(),
  // Opcionālā autentifikācija: ja dots derīgs tokens, serveris atrisina lietotāju
  // un pārraksta publisko displayId ar username. Nederīgs/iztrūkstošs → anonīms.
  authToken: z.string().max(maxIdentifierLength).optional()
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

/**
 * Host dzēš savu istabu, kamēr tā vēl GAIDA (WAITING). Bez payload (kā LEAVE_ROOM):
 * serveris atrod istabu pēc sūtītāja dalības (`requireCurrentRoom`) un neļauj
 * norādīt svešu `roomId`. Atšķiras no LEAVE_ROOM ar to, ka iznīcina visu istabu un
 * atbrīvo arī pievienotos spēlētājus. Serveris paliek autoritatīvs (host + WAITING).
 */
export const deleteRoomSchema = z.object({ type: z.literal("DELETE_ROOM") });

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
  roomId: nonEmpty
  // Piezīme (m5): nav `reconnectToken` — identitāte ir autoritatīva no HELLO
  // handshake (`ctx.identity`), tāpēc resume to nelasa. Klients PLAYER_RESUME ar
  // token nesūta; lauks bija mēms un maldinošs, tāpēc izņemts.
});

export const requestSnapshotSchema = z.object({
  type: z.literal("REQUEST_SNAPSHOT"),
  roomId: nonEmpty,
  lastSeq: z.number().int().min(0).optional()
});

export const sendChatSchema = z.object({
  type: z.literal("SEND_CHAT"),
  requestId: nonEmpty,
  text: z.string().max(maxChatTextLength)
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
  deleteRoomSchema,
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
