import {
  parseServerEvent,
  PROTOCOL_VERSION,
  type ClientMessage,
  type RoomVisibility,
  type ServerEvent
} from "@domino-poker/shared";

import {
  initialClientView,
  reduceServerEvent,
  type ClientView,
  type GameSnapshot
} from "./clientView";

type TimerHandle = ReturnType<typeof setTimeout>;

/** Transporta-agnostisks socket; reālo `WebSocket` ietin `webSocketAdapter`. */
export interface ClientSocket {
  send(data: string): void;
  close(): void;
}

export interface ClientSocketHandlers {
  readonly onOpen: () => void;
  readonly onMessage: (data: string) => void;
  /** `code` ir WS aizvēršanas kods (ja transports to nodod); lieto superseded detekcijai. */
  readonly onClose: (code?: number) => void;
}

/** Serveris aizvēra šo socketu, jo cits savienojums (cits tabs) pārņēma `clientId`. */
const CLOSE_SUPERSEDED = 4003;

export type ClientSocketFactory = (url: string, handlers: ClientSocketHandlers) => ClientSocket;

/** Gājiena nodoms (UI to nodod; klients pievieno roomId/turnId/requestId). */
export type MoveIntent = Extract<ClientMessage, { type: "SUBMIT_MOVE" }>["move"];
export interface CreateRoomOptions {
  readonly visibility?: RoomVisibility;
  readonly numberOfRounds?: number;
  readonly fillWithBots?: boolean;
}

export interface MultiplayerClientOptions {
  readonly url: string;
  readonly clientId: string;
  readonly clientBuild: string;
  readonly socketFactory: ClientSocketFactory;
  readonly onView: (view: ClientView) => void;
  /** Saglabātais reconnectToken (Fāze 9); atgriež `undefined`, ja vēl nav. */
  readonly getReconnectToken?: () => string | undefined;
  readonly onReconnectToken?: (token: string) => void;
  /**
   * Opcionālais auth tokens (ielogots lietotājs); atgriež `undefined`, ja anonīms.
   * Tiek sūtīts HELLO; serveris atrisina lietotāju un pārraksta publisko displayId.
   */
  readonly getAuthToken?: () => string | undefined;
  readonly now?: () => number;
  readonly setTimeoutFn?: (run: () => void, delayMs: number) => TimerHandle;
  readonly clearTimeoutFn?: (handle: TimerHandle) => void;
  readonly reconnectDelaysMs?: readonly number[];
  readonly pingIntervalMs?: number;
}

const DEFAULT_RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000];
const DEFAULT_PING_INTERVAL_MS = 15_000;

/**
 * MP WebSocket klients (Fāze 8.1). Pārvalda savienojuma dzīves ciklu (HELLO
 * handshake, automātisks reconnect ar backoff, periodisks PING), reducē
 * ienākošos `ServerEvent` uz `ClientView` un sūta izejošos `ClientMessage`.
 *
 * Zelta noteikums: klients **nesatur** spēles noteikumu loģiku — tikai sūta
 * nodomu un renderē servera snapshot. Transporta-agnostisks (`ClientSocket` +
 * injicējami timeri), tāpēc reconnect/handshake ir deterministiski testējami.
 */
export class MultiplayerClient {
  private readonly options: MultiplayerClientOptions;
  private readonly setTimeoutFn: (run: () => void, delayMs: number) => TimerHandle;
  private readonly clearTimeoutFn: (handle: TimerHandle) => void;
  private readonly now: () => number;

  private view: ClientView = initialClientView;
  private socket: ClientSocket | undefined;
  private socketOpen = false;
  private closedByUser = false;
  private welcomed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: TimerHandle | undefined;
  private pingTimer: TimerHandle | undefined;
  private requestSeq = 0;
  private socketGeneration = 0;
  private snapshotRequest:
    | {
        readonly roomId: string;
        readonly lastSeq: number;
      }
    | undefined;

  constructor(options: MultiplayerClientOptions) {
    this.options = options;
    this.setTimeoutFn = options.setTimeoutFn ?? ((run, delayMs) => setTimeout(run, delayMs));
    this.clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
    this.now = options.now ?? (() => Date.now());
  }

  getView(): ClientView {
    return this.view;
  }

  /** Atver savienojumu (un sāk reconnect ciklu, ja tas pārtrūkst). */
  connect(): void {
    this.closedByUser = false;
    this.openSocket();
  }

  /** Aizver pēc lietotāja gribas — bez reconnect. */
  close(): void {
    this.closedByUser = true;
    this.socketGeneration += 1;
    this.clearTimers();
    this.socket?.close();
    this.socket = undefined;
    this.socketOpen = false;
    this.snapshotRequest = undefined;
  }

  // ---- izejošie ziņojumi ----

  listRooms(): void {
    this.send({ type: "LIST_ROOMS" });
  }

  createRoom(options: CreateRoomOptions = {}): void {
    this.send({
      type: "CREATE_ROOM",
      ...(options.visibility ? { visibility: options.visibility } : {}),
      ...(options.numberOfRounds !== undefined ? { numberOfRounds: options.numberOfRounds } : {}),
      ...(options.fillWithBots !== undefined ? { fillWithBots: options.fillWithBots } : {})
    });
  }

  viewRoom(roomId: string | undefined, code?: string): void {
    const normalizedCode = code?.trim().toUpperCase();
    if (normalizedCode) {
      this.send({ type: "VIEW_ROOM", code: normalizedCode });
      return;
    }
    if (roomId) {
      this.send({ type: "VIEW_ROOM", roomId });
    }
  }

  joinRoom(roomId: string | undefined, code: string | undefined, seatIndex: number): void {
    const normalizedCode = code?.trim().toUpperCase();
    if (normalizedCode) {
      this.send({ type: "JOIN_ROOM", code: normalizedCode, seatIndex });
      return;
    }
    if (roomId) {
      this.send({ type: "JOIN_ROOM", roomId, seatIndex });
    }
  }

  leaveRoom(): void {
    this.send({ type: "LEAVE_ROOM" });
  }

  /**
   * Lokāla atgriešanās lobby pēc partijas beigām (GAME_OVER). Serveris pie GAME_OVER
   * jau iznīcina istabu un izņem spēlētāju (`RoomManager.destroyFinishedRoom`), tāpēc
   * `LEAVE_ROOM` sūtīšana atbildētu ar "is not in a room". Notīram istabas/spēles
   * skatu lokāli, lai UI atgriežas lobby. Mid-game iziešana (forfeit) paliek `leaveRoom`.
   */
  returnToLobby(): void {
    this.view = {
      ...this.view,
      room: undefined,
      game: initialClientView.game,
      lastError: undefined
    };
    this.options.onView(this.view);
  }

  /** Host dzēš savu GAIDOŠO istabu (serveris atgriež visus dalībniekus lobby). */
  deleteRoom(): void {
    this.send({ type: "DELETE_ROOM" });
  }

  fillSeatsWithBots(): void {
    this.send({ type: "FILL_SEATS_WITH_BOTS" });
  }

  startGame(): void {
    this.send({ type: "START_GAME" });
  }

  sendChat(text: string): void {
    this.send({ type: "SEND_CHAT", requestId: this.nextRequestId(), text });
  }

  /** Sūta solījumu pašreizējam aktīvajam turnam (no view). No-op, ja nav turna. */
  submitBid(bid: number): void {
    const roomId = this.view.room?.id;
    const turnId = this.view.game.turnId;
    if (roomId === undefined || turnId === undefined) return;
    this.send({ type: "SUBMIT_BID", requestId: this.nextRequestId(), roomId, turnId, bid });
  }

  submitMove(move: MoveIntent): void {
    const roomId = this.view.room?.id;
    const turnId = this.view.game.turnId;
    if (roomId === undefined || turnId === undefined) return;
    this.send({ type: "SUBMIT_MOVE", requestId: this.nextRequestId(), roomId, turnId, move });
  }

  // ---- iekšējais ----

  private send(message: ClientMessage): void {
    if (!this.socket || !this.socketOpen) return;
    this.socket.send(JSON.stringify(message));
  }

  private openSocket(): void {
    this.welcomed = false;
    const generation = (this.socketGeneration += 1);
    this.socket = this.options.socketFactory(this.options.url, {
      onOpen: () => {
        if (this.isCurrentSocket(generation)) this.handleOpen();
      },
      onMessage: (data) => {
        if (this.isCurrentSocket(generation)) this.handleMessage(data);
      },
      onClose: (code) => {
        if (generation === this.socketGeneration) this.handleClose(code);
      }
    });
  }

  private isCurrentSocket(generation: number): boolean {
    return generation === this.socketGeneration && !this.closedByUser;
  }

  private handleOpen(): void {
    this.socketOpen = true;
    const reconnectToken = this.options.getReconnectToken?.();
    const authToken = this.options.getAuthToken?.();
    const hello: Extract<ClientMessage, { type: "HELLO" }> = {
      type: "HELLO",
      protocolVersion: PROTOCOL_VERSION,
      clientBuild: this.options.clientBuild,
      clientId: this.options.clientId,
      ...(reconnectToken !== undefined ? { reconnectToken } : {}),
      ...(authToken !== undefined ? { authToken } : {})
    };
    this.send(hello);
    this.startPing();
  }

  private handleMessage(data: string): void {
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    // Runtime validācija servera boundary: vecs/bojāts/nesaderīgs events nedrīkst
    // salauzt klienta state. Nederīgu nometam ar warning (klients atgūstas caur
    // REQUEST_SNAPSHOT seq-robu), nevis padodam to reducer kā ServerEvent.
    const parsed = parseServerEvent(json);
    if (!parsed.success) {
      console.warn("[mp] dropped invalid server event");
      // Ja bijām snapshot atgūšanas vidū, nomestais events varēja būt tieši gaidītais
      // recovery events — citādi `snapshotRequest` paliktu iestrēdzis un `requestSnapshot`
      // mūžīgi early-return. Atbloķējam un pieprasām snapshot no pēdējā labā seq.
      if (this.snapshotRequest !== undefined) {
        this.snapshotRequest = undefined;
        this.requestSnapshot(this.view.game.seq);
      }
      return;
    }
    this.applyEvent(parsed.event);
  }

  private applyEvent(event: ServerEvent): void {
    // seq-pārrāvuma detekcija PIRMS reducēšanas (reduce pārraksta seq).
    const lastGoodSeq = this.view.game.seq;
    const hasGap =
      event.type === "GAME_EVENT" && lastGoodSeq > 0 && event.seq > lastGoodSeq + 1;
    this.trackSnapshotRecovery(event);

    if (event.type === "ERROR" && event.code === "PROTOCOL_VERSION_MISMATCH") {
      // Neatkārtojam savienojumu nesaderīgas versijas gadījumā.
      this.closedByUser = true;
      this.clearTimers();
    }

    this.view = reduceServerEvent(this.view, event);

    if (event.type === "WELCOME") {
      this.reconnectAttempt = 0;
      this.options.onReconnectToken?.(event.reconnectToken);
      if (!this.welcomed) {
        this.welcomed = true;
        this.resyncAfterWelcome();
      }
    } else if (event.type === "ERROR" && event.code === "PROTOCOL_VERSION_MISMATCH") {
      this.view = { ...this.view, connection: "error" };
    } else if (hasGap) {
      this.requestSnapshot(lastGoodSeq);
    }

    this.options.onView(this.view);
  }

  /** Pēc (atkārtota) WELCOME: ja bijām istabā, pieprasām trūkstošo state. */
  private resyncAfterWelcome(): void {
    const roomId = this.view.room?.id;
    if (roomId !== undefined) {
      this.requestSnapshot(this.view.game.seq);
    }
  }

  private requestSnapshot(lastSeq: number): void {
    const roomId = this.view.room?.id;
    if (roomId === undefined) return;
    if (this.snapshotRequest !== undefined) return;
    this.snapshotRequest = { roomId, lastSeq };
    this.send({ type: "REQUEST_SNAPSHOT", roomId, lastSeq });
  }

  private trackSnapshotRecovery(event: ServerEvent): void {
    const request = this.snapshotRequest;
    if (request === undefined) return;

    if (
      (event.type === "STATE_SNAPSHOT" && event.roomId === request.roomId) ||
      (event.type === "GAME_EVENT" &&
        event.roomId === request.roomId &&
        event.seq === request.lastSeq + 1) ||
      (event.type === "ROOM_LEFT" && event.roomId === request.roomId) ||
      event.type === "ERROR"
    ) {
      this.snapshotRequest = undefined;
    }
  }

  private handleClose(code?: number): void {
    this.socketGeneration += 1;
    this.socketOpen = false;
    this.socket = undefined;
    this.snapshotRequest = undefined;
    this.stopPing();
    if (this.closedByUser) return;
    if (code === CLOSE_SUPERSEDED) {
      // Cits savienojums (cits tabs) pārņēma šo clientId — NEatkārtojam savienojumu,
      // lai nerastos bezgalīga ping-pong cīņa starp diviem tabiem.
      this.closedByUser = true;
      this.clearTimers();
      this.view = { ...this.view, connection: "error" };
      this.options.onView(this.view);
      return;
    }
    this.view = { ...this.view, connection: "reconnecting" };
    this.options.onView(this.view);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delays = this.options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS;
    const delay = delays[Math.min(this.reconnectAttempt, delays.length - 1)] ?? 1_000;
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = undefined;
      this.openSocket();
    }, delay);
  }

  private startPing(): void {
    this.stopPing();
    const interval = this.options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS;
    const tick = (): void => {
      this.send({ type: "PING", clientTime: this.now() });
      this.pingTimer = this.setTimeoutFn(tick, interval);
    };
    this.pingTimer = this.setTimeoutFn(tick, interval);
  }

  private stopPing(): void {
    if (this.pingTimer !== undefined) {
      this.clearTimeoutFn(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  private clearTimers(): void {
    this.stopPing();
    if (this.reconnectTimer !== undefined) {
      this.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private nextRequestId(): string {
    this.requestSeq += 1;
    return `req-${this.requestSeq}`;
  }
}

export type { ClientView, GameSnapshot };
