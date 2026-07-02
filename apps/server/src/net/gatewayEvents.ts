import type { ErrorEvent, ProtocolErrorCode } from "@domino-poker/shared";

/**
 * WebSocket aizvēršanas kodi (lietojuma diapazons 4000–4999). Pagaidām tikai
 * protokola nesakritība; turpmākās fāzes var pievienot citus iemeslus.
 */
export const GATEWAY_CLOSE = {
  protocolMismatch: 4001,
  heartbeatTimeout: 4002,
  /** Vecais socket aizvērts, jo jauns savienojums to aizstāja (viens aktīvs socket). */
  superseded: 4003,
  /** Reconnect noraidīts — `reconnectToken` nesakrīt ar zināmo `clientId`. */
  sessionRejected: 4004,
  /**
   * Konta profils (username) mainījās — sesija klusi jāpārhandshake'o, lai WELCOME/
   * profila kešs nes jauno vārdu. Klients šo kodu neapstrādā īpaši → auto-reconnect.
   */
  profileRefresh: 4005
} as const;

/** Veido drošu `ERROR` eventu (tikai kods + ziņojums + neobligāts `requestId`). */
export function errorEvent(
  code: ProtocolErrorCode,
  message: string,
  requestId?: string
): ErrorEvent {
  return requestId === undefined
    ? { type: "ERROR", code, message }
    : { type: "ERROR", code, message, requestId };
}
