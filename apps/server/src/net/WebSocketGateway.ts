import {
  isProtocolCompatible,
  parseClientMessage,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerEvent
} from "@domino-poker/shared";

import type { DisplayIdRegistry } from "../identity/DisplayIdRegistry.js";
import type { Clock } from "../timers/TurnTimerScheduler.js";
import { errorEvent, GATEWAY_CLOSE } from "./gatewayEvents.js";
import type { ConnectionState, GatewayConnection } from "./GatewayConnection.js";
import type { GatewayHub } from "./GatewayHub.js";
import type { MessageRouter } from "./messageRouter.js";
import type { ServerEventBus } from "./ServerEventBus.js";
import type { DurableSessionStore } from "../sessions/DurableSessionStore.js";
import {
  SessionManager,
  type MaybePromise,
  type RegisterResult,
  type SessionIdentity
} from "../sessions/SessionManager.js";

interface ConnectionContext {
  readonly conn: GatewayConnection;
  state: ConnectionState;
  identity: SessionIdentity | undefined;
  /** Pēdējā ienākošā kadra servera laiks (heartbeat liveness pārbaudei). */
  lastSeenAt: number;
}

/** Cik bieži (ms) klients sūta `PING`; serveris pēc tā mēra klusumu. */
const DEFAULT_PING_INTERVAL_MS = 15_000;
/** Cik intervālus klusuma pieļaut, pirms savienojumu uzskata par mirušu. */
const DEFAULT_MISSED_PONG_THRESHOLD = 2;
/** Izejošā bufera robeža (baiti), virs kuras broadcast sūtījumu klientam izlaiž. */
const DEFAULT_SLOW_CLIENT_BUFFER_CAP = 1024 * 1024; // 1 MB
/** Cik bieži (ms) izslaucīt istabas, kurām beidzies TTL (1h). 60s ir pietiekami. */
const ROOM_SWEEP_INTERVAL_MS = 60_000;

export interface WebSocketGatewayOptions {
  readonly clock: Clock;
  readonly displayIds: DisplayIdRegistry;
  readonly router: MessageRouter;
  readonly createSessionId?: () => string;
  readonly createReconnectToken?: () => string;
  readonly durableSessionStore?: DurableSessionStore;
  readonly eventBus?: ServerEventBus;
  readonly pingIntervalMs?: number;
  readonly missedPongThreshold?: number;
  /** Lēna-klienta backpressure robeža baitos (noklusējums 1 MB). */
  readonly slowClientBufferCap?: number;
}

/**
 * Pieņem klienta savienojumus un ir vienīgais ienākošo ziņojumu ieejas punkts
 * (6.4). Katram kadram piemēro stingru cauruli:
 *
 *   JSON parse → Zod validē → HELLO handshake (+ protokola versija) →
 *   identitāte piesaistīta → deleģē uz `MessageRouter`.
 *
 * Zelta noteikums: gateway **nesatur** spēles noteikumu loģiku. Nederīgs kadrs
 * dod `INVALID_MESSAGE`; nesakritīga protokola versija dod
 * `PROTOCOL_VERSION_MISMATCH` un savienojuma slēgšanu. Transporta detaļas (`ws`)
 * dzīvo `wsTransport.ts`, tāpēc šī klase ir deterministiski testējama.
 */
export class WebSocketGateway implements GatewayHub {
  private readonly contexts = new Map<string, ConnectionContext>();
  private readonly sessions: SessionManager;
  private readonly clock: Clock;
  private readonly router: MessageRouter;
  private readonly pingIntervalMs: number;
  private readonly missedPongThreshold: number;
  private readonly slowClientBufferCap: number;
  private readonly eventBus: ServerEventBus | undefined;

  constructor(options: WebSocketGatewayOptions) {
    this.clock = options.clock;
    this.router = options.router;
    this.pingIntervalMs = options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    this.missedPongThreshold = options.missedPongThreshold ?? DEFAULT_MISSED_PONG_THRESHOLD;
    this.slowClientBufferCap = options.slowClientBufferCap ?? DEFAULT_SLOW_CLIENT_BUFFER_CAP;
    this.eventBus = options.eventBus;
    this.sessions = new SessionManager({
      displayIds: options.displayIds,
      ...(options.createSessionId ? { createSessionId: options.createSessionId } : {}),
      ...(options.createReconnectToken
        ? { createReconnectToken: options.createReconnectToken }
        : {}),
      ...(options.durableSessionStore ? { durableStore: options.durableSessionStore } : {}),
      clock: options.clock
    });
  }

  /** Jauns savienojums (vēl bez identitātes — gaida HELLO). */
  open(conn: GatewayConnection): void {
    this.contexts.set(conn.id, {
      conn,
      state: "connected",
      identity: undefined,
      lastSeenAt: this.clock()
    });
  }

  /** Ienākošs (jau par tekstu dekodēts) kadrs no klienta. */
  message(conn: GatewayConnection, raw: string): void {
    const ctx = this.contexts.get(conn.id);
    if (!ctx || ctx.state === "disconnected") {
      return;
    }
    ctx.lastSeenAt = this.clock(); // jebkurš kadrs apliecina liveness

    const parsed = safeParse(raw);
    if (!parsed.ok) {
      conn.send(
        errorEvent("INVALID_MESSAGE", "Message is not valid JSON or does not match the protocol.")
      );
      return;
    }
    const message = parsed.message;

    if (message.type === "HELLO") {
      this.handleRouterResult(ctx.conn, this.handleHello(ctx, message));
      return;
    }

    if (!ctx.identity) {
      conn.send(
        errorEvent("INVALID_MESSAGE", "HELLO handshake is required before any other message.")
      );
      return;
    }

    this.handleRouterResult(
      conn,
      this.router.route({ identity: ctx.identity, conn, hub: this, serverNow: this.clock() }, message)
    );
  }

  /** Savienojums aizvērts transporta pusē (socket jau slēgts) — notīra identitāti. */
  close(conn: GatewayConnection): void {
    const ctx = this.contexts.get(conn.id);
    if (!ctx) {
      return;
    }
    this.teardown(ctx, { closeSocket: false });
  }

  /**
   * Heartbeat izslaukšana: savienojumi, kas klusē ilgāk par
   * `pingIntervalMs × missedPongThreshold`, tiek uzskatīti par mirušiem un slēgti.
   * Deterministiska (lieto injicēto pulksteni); reālo periodisko izsaukšanu
   * pieslēdz `wsTransport` ar `setInterval`.
   */
  sweepHeartbeats(): void {
    const now = this.clock();
    const silenceLimit = this.pingIntervalMs * this.missedPongThreshold;
    for (const ctx of [...this.contexts.values()]) {
      if (ctx.state === "connected" && now - ctx.lastSeenAt >= silenceLimit) {
        this.teardown(ctx, {
          closeSocket: true,
          code: GATEWAY_CLOSE.heartbeatTimeout,
          reason: "heartbeat timeout"
        });
      }
    }
  }

  /** Cik bieži (ms) palaist `sweepHeartbeats` (transporta `setInterval` vajadzībām). */
  getPingIntervalMs(): number {
    return this.pingIntervalMs;
  }

  /**
   * Istabu TTL izslaukšana: iznīcina istabas, kurām beidzies laiks, un pārraida
   * jauno LOBBY_STATE. Deterministiska (lieto injicēto pulksteni); reālo periodisko
   * izsaukšanu pieslēdz `wsTransport` ar `setInterval`.
   */
  sweepExpiredRooms(): void {
    this.handleLifecycleResult(this.router.sweepExpiredRooms(this, this.clock()));
  }

  /** Cik bieži (ms) palaist `sweepExpiredRooms` (transporta `setInterval` vajadzībām). */
  getRoomSweepIntervalMs(): number {
    return ROOM_SWEEP_INTERVAL_MS;
  }

  /** Aktīvo (handshake pabeigušo) spēlētāju skaits. */
  onlineCount(): number {
    return this.sessions.onlineCount();
  }

  /** Vai spēlētājam (clientId) ir aktīvs savienojums. */
  isOnline(playerId: string): boolean {
    return this.sessions.hasActiveConnection(playerId);
  }

  /**
   * Atbrīvo durable sesiju (reconnectToken + displayId), kad spēlētājs pilnībā
   * atstājis sistēmu. Aizsargāts ar `hasActiveConnection`, lai NEKAD neatbrīvotu
   * tiešsaistes spēlētāja identitāti (token paliek reconnect grace vajadzībām).
   * Idempotents. Risina `tokens`/displayId neierobežotu augšanu (M3).
   */
  releaseSession(playerId: string): MaybePromise<void> {
    if (!this.sessions.hasActiveConnection(playerId)) {
      return this.sessions.release(playerId);
    }
  }

  /**
   * Vienots savienojuma noārdīšanas ceļš (transporta close VAI heartbeat).
   * `closeSocket` true → arī slēdz socketu (heartbeat gadījumā); transporta close
   * to nedara, jo socket jau ir slēgts. Idempotents pret jau noārdītu savienojumu.
   */
  private teardown(
    ctx: ConnectionContext,
    options: {
      readonly closeSocket: boolean;
      readonly code?: number;
      readonly reason?: string;
      readonly suppressDisconnectedIdentity?: boolean;
    }
  ): void {
    if (ctx.state === "disconnected") {
      return;
    }
    const identity = ctx.identity;
    ctx.state = "disconnected";
    this.sessions.unregister(ctx.conn.id);
    this.contexts.delete(ctx.conn.id);
    if (options.closeSocket) {
      ctx.conn.close(options.code, options.reason);
    }
    // Tikai handshake pabeigušie ietekmē onlineCount → tikai tad izsūtām.
    // Ja spēlētājam vēl ir aktīvs socket (šis tika AIZSTĀTS ar jaunāku), tad viņš
    // nav atvienojies — nepadodam `disconnected`, lai neatzīmētu kā offline.
    if (identity !== undefined) {
      const stillOnline = this.sessions.hasActiveConnection(identity.playerId);
      this.handleLifecycleResult(
        this.router.onDisconnected(
          this,
          this.clock(),
          options.suppressDisconnectedIdentity || stillOnline ? undefined : identity
        )
      );
    }
  }

  /**
   * Sūta eventu visiem handshake pabeigušajiem, aktīvajiem savienojumiem.
   * Serializē VIENREIZ un sūta to pašu virkni visiem (izvairās no N× identiska
   * `JSON.stringify` pie liela fanout — galvenā caurlaidspējas optimizācija 1000+
   * klientiem).
   */
  broadcast(event: ServerEvent): void {
    this.broadcastLocal(event);
    this.publishFanout({ kind: "broadcast", event });
  }

  deliverRemoteBroadcast(event: ServerEvent): void {
    this.broadcastLocal(event);
  }

  private broadcastLocal(event: ServerEvent): void {
    const payload = JSON.stringify(event);
    for (const ctx of this.contexts.values()) {
      if (ctx.identity && ctx.state === "connected") {
        this.deliver(ctx, event, payload);
      }
    }
  }

  /** Sūta eventu visiem dotā spēlētāja aktīvajiem savienojumiem (mērķtiecīgi). */
  sendToPlayer(playerId: string, event: ServerEvent): void {
    this.sendToLocalPlayer(playerId, event);
    this.publishFanout({ kind: "player", playerId, event });
  }

  deliverRemoteToPlayer(playerId: string, event: ServerEvent): void {
    this.sendToLocalPlayer(playerId, event);
  }

  closeRemoteSupersededPlayer(playerId: string): void {
    for (const ctx of [...this.contexts.values()]) {
      if (ctx.identity?.playerId === playerId && ctx.state === "connected") {
        this.teardown(ctx, {
          closeSocket: true,
          code: GATEWAY_CLOSE.superseded,
          reason: "superseded by a newer connection on another server instance",
          suppressDisconnectedIdentity: true
        });
      }
    }
  }

  private sendToLocalPlayer(playerId: string, event: ServerEvent): void {
    for (const ctx of this.contexts.values()) {
      if (ctx.identity?.playerId === playerId && ctx.state === "connected") {
        this.deliver(ctx, event);
      }
    }
  }

  private publishFanout(message: Parameters<ServerEventBus["publish"]>[0]): void {
    if (this.eventBus === undefined) {
      return;
    }
    void this.eventBus.publish(message).catch((error: unknown) => {
      console.error("[gateway] cross-instance fanout failed:", error);
    });
  }

  /**
   * Piegādā vienam savienojumam ar lēna-klienta backpressure aizsardzību: ja
   * izejošais buferis pārsniedz robežu (klients nespēj patērēt plūsmu), sūtījumu
   * IZLAIŽAM, lai servera atmiņa neaugtu neierobežoti pie liela broadcast fanout
   * (1000+ klienti). Izlaistu spēles eventu klients atgūst caur `REQUEST_SNAPSHOT`
   * seq-robu; lobby/čata izlaišana ir nekritiska (nākamais broadcast to izlīdzina).
   *
   * `serialized` (ja padots no `broadcast`) ļauj sūtīt iepriekš serializētu virkni;
   * pretējā gadījumā (mērķtiecīga piegāde) serializē `send(event)`.
   */
  private deliver(ctx: ConnectionContext, event: ServerEvent, serialized?: string): void {
    const buffered = ctx.conn.bufferedAmount?.() ?? 0;
    if (buffered > this.slowClientBufferCap) {
      return;
    }
    if (serialized !== undefined && ctx.conn.sendSerialized) {
      ctx.conn.sendSerialized(serialized);
    } else {
      ctx.conn.send(event);
    }
  }

  private handleHello(
    ctx: ConnectionContext,
    message: Extract<ClientMessage, { type: "HELLO" }>
  ): MaybePromise<void> {
    if (!isProtocolCompatible(message.protocolVersion)) {
      ctx.conn.send(
        errorEvent(
          "PROTOCOL_VERSION_MISMATCH",
          `Server speaks protocol version ${PROTOCOL_VERSION}; client sent ${message.protocolVersion}.`
        )
      );
      ctx.state = "disconnected";
      ctx.conn.close(GATEWAY_CLOSE.protocolMismatch, "protocol version mismatch");
      return;
    }

    if (ctx.identity) {
      ctx.conn.send(
        errorEvent("INVALID_MESSAGE", "Handshake already completed for this connection.")
      );
      return;
    }

    const result = this.sessions.registerAsync(ctx.conn.id, message.clientId, message.reconnectToken);
    if (isPromiseLike(result)) {
      return result.then((resolved) => this.completeHello(ctx, resolved));
    }
    this.completeHello(ctx, result);
  }

  private completeHello(ctx: ConnectionContext, result: RegisterResult): void {
    if (!result.ok) {
      // reconnectToken nesakrīt ar zināmo clientId → noraidām (neuzdodas par citu).
      ctx.conn.send(errorEvent("FORBIDDEN", "Reconnect token does not match this client."));
      ctx.state = "disconnected";
      ctx.conn.close(GATEWAY_CLOSE.sessionRejected, "session token mismatch");
      return;
    }

    const identity = result.identity;
    ctx.identity = identity;
    ctx.conn.send({
      type: "WELCOME",
      sessionId: identity.sessionId,
      playerId: identity.playerId,
      displayId: identity.displayId,
      reconnectToken: identity.reconnectToken,
      serverNow: this.clock()
    });
    // Jauns lobby dalībnieks: čata vēsture + onlineCount push pārējiem.
    if (result.isReconnect || result.replacedConnectionId !== undefined) {
      this.publishFanout({ kind: "supersede", playerId: identity.playerId });
    }
    this.handleRouterResult(
      ctx.conn,
      this.router.onConnected({ identity, conn: ctx.conn, hub: this, serverNow: this.clock() })
    );

    // Viens aktīvs socket: aizveram veco savienojumu, ja šis clientId jau bija tiešsaistē.
    if (result.replacedConnectionId !== undefined) {
      const replaced = this.contexts.get(result.replacedConnectionId);
      if (replaced) {
        this.teardown(replaced, {
          closeSocket: true,
          code: GATEWAY_CLOSE.superseded,
          reason: "superseded by a newer connection"
        });
      }
    }
  }

  private handleRouterResult(conn: GatewayConnection, result: void | Promise<void>): void {
    if (!isPromiseLike(result)) {
      return;
    }
    void result.catch((error: unknown) => {
      console.error("[gateway] router failed:", error);
      conn.send(errorEvent("INTERNAL_ERROR", "Server failed to handle the message."));
    });
  }

  private handleLifecycleResult(result: void | Promise<void>): void {
    if (!isPromiseLike(result)) {
      return;
    }
    void result.catch((error: unknown) => {
      console.error("[gateway] lifecycle router hook failed:", error);
    });
  }
}

type ParseResult =
  | { readonly ok: true; readonly message: ClientMessage }
  | { readonly ok: false };

function safeParse(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  const result = parseClientMessage(json);
  return result.success ? { ok: true, message: result.message } : { ok: false };
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as { readonly then?: unknown } | undefined)?.then === "function";
}
