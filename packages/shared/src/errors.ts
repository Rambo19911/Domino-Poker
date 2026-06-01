import { z } from "zod";

/**
 * Protokola kļūdu kodi. Apvieno transporta/validācijas kodus ar lobby/istabu
 * kodiem (sakrīt ar servera `LobbyErrorCode`) un gājienu kodiem.
 */
export const protocolErrorCodes = [
  // Transports / validācija
  "PROTOCOL_VERSION_MISMATCH",
  "INVALID_MESSAGE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  // Lobby / istabas
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "GAME_ALREADY_STARTED",
  "NOT_HOST",
  "ALREADY_IN_ROOM",
  "FORBIDDEN",
  // Gājieni / kārta
  "NOT_YOUR_TURN",
  "ACTION_TOO_LATE",
  "MOVE_REJECTED"
] as const;

export type ProtocolErrorCode = (typeof protocolErrorCodes)[number];

export const errorCodeSchema = z.enum(protocolErrorCodes);

/**
 * Drošs kļūdas payload klientam — tikai kods + cilvēklasāms ziņojums un
 * neobligāts `requestId` korelācijai. Nekādu iekšēju detaļu/steku.
 */
export const errorPayloadSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  requestId: z.string().optional()
});

export type ErrorPayload = z.infer<typeof errorPayloadSchema>;
