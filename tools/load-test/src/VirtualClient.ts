import { WebSocket } from "ws";

import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerEvent
} from "@domino-poker/shared";

import type { LoadMetrics } from "./metrics.js";

export interface VirtualClientIdentity {
  readonly sessionId: string;
  readonly playerId: string;
  readonly displayId: string;
  readonly reconnectToken: string;
}

export interface VirtualClientOptions {
  readonly url: string;
  /** Stabils per-klients id (HELLO; serveris parāda tikai displayId). */
  readonly clientId: string;
  readonly metrics: LoadMetrics;
  readonly connectTimeoutMs?: number;
}

/** Kāpēc tika aizvērts socket — nosaka, kā to uzskaitīt metrikā. */
type CloseIntent = "none" | "close" | "reconnect";

/**
 * Viens virtuāls klients, kas runā ĪSTO WebSocket protokolu (HELLO → lobby/čats →
 * istabas izveide + bot-fill + start → disconnect/reconnect), izmantojot Node `ws`.
 * Tas noslogo reālo servera ceļu (gateway → router → RoomEngine → timeri →
 * persistence), nevis mocko iekšieni.
 *
 * Bot-fill + timeout dizains: klients izveido istabu, aizpilda ar botiem un sāk
 * spēli; cilvēka sēdvietas gājienus auto-izspēlē servera 10s timeout. Tā NEKĀDA
 * spēles noteikumu loģika nav klientā (zelta noteikums #2 — viens noteikumu avots).
 *
 * Klients ir slodzes ģenerators (rīks), nevis MP determinisma ceļš — `Date.now()`
 * un nejaušība šeit ir pieļaujama.
 */
export class VirtualClient {
  private readonly url: string;
  private readonly clientId: string;
  private readonly metrics: LoadMetrics;
  private readonly connectTimeoutMs: number;
  private socket: WebSocket | undefined;
  /** PING clientTime → nosūtīšanas laiks (RTT aprēķinam pēc PONG). */
  private readonly pendingPings = new Map<number, number>();
  private closeIntent: CloseIntent = "none";
  private chatSeq = 0;
  identity: VirtualClientIdentity | undefined;
  roomId: string | undefined;

  constructor(options: VirtualClientOptions) {
    this.url = options.url;
    this.clientId = options.clientId;
    this.metrics = options.metrics;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
  }

  /** Pirmais savienojums: HELLO bez reconnectToken; atrisina pēc WELCOME. */
  connect(): Promise<void> {
    return this.openSocket(false);
  }

  /**
   * Imitē tīkla pārrāvumu: apzināti aizver pašreizējo socket (uzskaitīts kā
   * reconnect, ne dropped) un atver jaunu ar to pašu clientId + reconnectToken.
   * Serveris (SessionManager durable token + restoreRoomOnReconnect) atjauno
   * istabu/spēli — klientam nekas papildus nav jāsūta.
   */
  async reconnect(): Promise<void> {
    if (this.socket) {
      this.closeIntent = "reconnect";
      this.socket.close();
    }
    await this.openSocket(true);
    this.metrics.recordReconnect();
  }

  private openSocket(reconnect: boolean): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const startedAt = Date.now();
      const socket = new WebSocket(this.url);
      this.socket = socket;
      let welcomed = false;

      const timer = setTimeout(() => {
        this.metrics.recordConnectFailure();
        socket.terminate();
        reject(new Error(`connect timeout for ${this.clientId}`));
      }, this.connectTimeoutMs);

      socket.on("open", () => {
        const hello: ClientMessage = {
          type: "HELLO",
          protocolVersion: PROTOCOL_VERSION,
          clientBuild: "load-test",
          clientId: this.clientId,
          ...(reconnect && this.identity ? { reconnectToken: this.identity.reconnectToken } : {})
        };
        this.sendVia(socket, hello);
      });

      socket.on("message", (data: Buffer) => {
        let event: ServerEvent;
        try {
          event = JSON.parse(data.toString()) as ServerEvent;
        } catch {
          return;
        }
        this.metrics.recordReceived();
        if (event.type === "WELCOME" && !welcomed) {
          welcomed = true;
          this.identity = {
            sessionId: event.sessionId,
            playerId: event.playerId,
            displayId: event.displayId,
            reconnectToken: event.reconnectToken
          };
          if (!reconnect) {
            this.metrics.recordConnect(Date.now() - startedAt);
          }
          clearTimeout(timer);
          resolve();
          return;
        }
        this.handleEvent(event);
      });

      socket.on("error", () => {
        // Kļūdu apstrādā `close` (lai nav dubultas uzskaites).
      });

      socket.on("close", () => {
        clearTimeout(timer);
        if (!welcomed) {
          this.metrics.recordConnectFailure();
          reject(new Error(`closed before WELCOME for ${this.clientId}`));
          return;
        }
        // Pēc WELCOME aizvērums: klasificē pēc nodoma.
        switch (this.closeIntent) {
          case "close":
            this.metrics.recordCleanClose();
            break;
          case "reconnect":
            // reconnect uzskaita reconnect() pati; šis vecā socket aizvērums neitrāls.
            break;
          default:
            this.metrics.recordDropped(); // negaidīts (serveris/tīkls mūs nometa)
            break;
        }
        this.closeIntent = "none";
      });
    });
  }

  private handleEvent(event: ServerEvent): void {
    switch (event.type) {
      case "PONG": {
        const sentAt = this.pendingPings.get(event.clientTime);
        if (sentAt !== undefined) {
          this.metrics.recordRtt(Date.now() - sentAt);
          this.pendingPings.delete(event.clientTime);
        }
        break;
      }
      case "ROOM_CREATED":
      case "ROOM_JOINED":
        this.roomId = event.room.id;
        break;
      case "ERROR":
        this.metrics.recordError(event.code);
        break;
      default:
        break;
    }
  }

  /** Latence: PING; RTT tiek izmērīts pēc atbilstošā PONG. */
  ping(): void {
    const clientTime = Date.now();
    this.pendingPings.set(clientTime, clientTime);
    this.send({ type: "PING", clientTime });
  }

  listRooms(): void {
    this.send({ type: "LIST_ROOMS" });
  }

  sendChat(text: string): void {
    this.chatSeq += 1;
    this.send({ type: "SEND_CHAT", requestId: `${this.clientId}-c${this.chatSeq}`, text });
  }

  /** Izveido publisku istabu un uzreiz aizpilda atlikušās vietas ar botiem. */
  createRoomWithBots(): void {
    this.send({ type: "CREATE_ROOM", visibility: "public", fillWithBots: true });
  }

  /** Sāk spēli (prasa pilnu galdu — bot-fill to nodrošina). */
  startGame(): void {
    this.send({ type: "START_GAME" });
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Apzināta aizvēršana (uzskaitīta kā tīra, ne dropped). */
  close(): void {
    this.closeIntent = "close";
    this.socket?.close();
  }

  private send(message: ClientMessage): void {
    this.sendVia(this.socket, message);
  }

  private sendVia(socket: WebSocket | undefined, message: ClientMessage): void {
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
    this.metrics.recordSent();
  }
}
