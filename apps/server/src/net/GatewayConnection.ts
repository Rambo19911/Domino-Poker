import type { ServerEvent } from "@domino-poker/shared";

/** Savienojuma dzīvības stāvoklis (6.8 heartbeat pārvietos uz `disconnected`). */
export type ConnectionState = "connected" | "disconnected";

/**
 * Transporta-agnostisks viena klienta savienojums. `ws` adapteris
 * (`wsTransport.ts`) to realizē virs reāla socketa; MP zonas testi izmanto
 * viltus implementāciju, lai pārbaudītu gateway loģiku bez tīkla I/O.
 *
 * Gateway nezina neko par `ws` — tas tikai sūta `ServerEvent` un var aizvērt
 * savienojumu. Tas tur visu protokola loģiku deterministiski testējamu.
 */
export interface GatewayConnection {
  readonly id: string;
  send(event: ServerEvent): void;
  /**
   * Sūta JAU serializētu kadru (broadcast optimizācija): gateway serializē
   * notikumu VIENREIZ un sūta to pašu virkni visiem savienojumiem, izvairoties no
   * N× identiska `JSON.stringify` pie liela fanout (1000+ klienti). Ja transports
   * to neimplementē, gateway atkāpjas uz `send(event)`.
   */
  sendSerialized?(payload: string): void;
  close(code?: number, reason?: string): void;
  /**
   * Izejošā bufera apjoms baitos (ws `bufferedAmount`), ja transports to atbalsta.
   * Gateway to izmanto lēna-klienta backpressure aizsardzībai: ja buferis pārpildīts
   * (klients nespēj patērēt broadcast plūsmu), sūtījumu izlaiž, lai atmiņa neaugtu
   * neierobežoti (OOM aizsardzība pie liela savienojumu skaita). Testu viltus
   * savienojumi to var neimplementēt (uzskata par 0 = vienmēr sūta).
   */
  bufferedAmount?(): number;
}
