import type { ServerEvent } from "@domino-poker/shared";

/**
 * Gateway spējas, ko izmanto gan maršrutētājs (uz ziņojumu), gan servera-iniciēta
 * piegāde (heartbeat, turn timeout). Gateway tur savienojumu sarakstu; patērētāji
 * paliek atsaistīti no transporta detaļām.
 */
export interface GatewayHub {
  /** Sūta eventu visiem handshake pabeigušajiem savienojumiem. */
  broadcast(event: ServerEvent): void;
  /** Sūta eventu visiem dotā spēlētāja aktīvajiem savienojumiem (mērķtiecīgi). */
  sendToPlayer(playerId: string, event: ServerEvent): void;
  /** Pašreizējais tiešsaistes (handshake) spēlētāju skaits. */
  onlineCount(): number;
  /** Vai dotajam spēlētājam (clientId) ir aktīvs savienojums (tiešsaistē). */
  isOnline(playerId: string): boolean;
}
