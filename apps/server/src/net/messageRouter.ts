import type { ClientMessage, ProtocolErrorCode, ServerEvent } from "@domino-poker/shared";

import type { LobbyChat } from "../chat/LobbyChat.js";
import { LobbyError, type LobbyErrorCode } from "../rooms/lobbyErrors.js";
import {
  noopRoomOwnershipGuard,
  type MaybePromise,
  type RoomOwnershipGuard
} from "../rooms/RoomOwnershipGuard.js";
import type { RoomDispatchResult, SequencedRoomEvent } from "../rooms/RoomEngine.js";
import type { RoomManager } from "../rooms/RoomManager.js";
import { publishGameUpdate } from "./gameUpdateDelivery.js";
import { errorEvent } from "./gatewayEvents.js";
import type { GatewayConnection } from "./GatewayConnection.js";
import type { GatewayHub } from "./GatewayHub.js";
import type { SessionIdentity as ConnectionIdentity } from "../sessions/SessionManager.js";

/** Visi klienta ziņojumi pēc handshake (HELLO apstrādā pats gateway). */
export type PostHandshakeMessage = Exclude<ClientMessage, { type: "HELLO" }>;

/**
 * Istabu-izveides rate-limit (M5): token-bucket uz savienojumu, kā čatam. Ļauj
 * cilvēcisku uzliesmojumu (līdz `ROOM_CREATE_BURST` istabām pēc kārtas), tad
 * ierobežo līdz ~1 istabai ik `ROOM_CREATE_REFILL_MS` — pasargā no `create →
 * leave → create` spama, neapgrūtinot normālu lietošanu.
 */
const ROOM_CREATE_BURST = 5;
const ROOM_CREATE_REFILL_MS = 5000;

export type { GatewayHub };

/** Maršrutēšanas konteksts: kas sūta, kur atbildēt, un kā sasniegt pārējos. */
export interface RouteContext {
  readonly identity: ConnectionIdentity;
  readonly conn: GatewayConnection;
  readonly hub: GatewayHub;
  /** Servera laiks šī ziņojuma apstrādes brīdī (serveris ir laika autoritāte). */
  readonly serverNow: number;
}

export interface MessageRouter {
  route(ctx: RouteContext, message: PostHandshakeMessage): MaybePromise<void>;
  /** Pēc handshake: jauns lobby dalībnieks (čata vēsture + onlineCount push). */
  onConnected(ctx: RouteContext): MaybePromise<void>;
  /**
   * Pēc savienojuma aizvēršanas: atjauno onlineCount pārējiem. Ja `disconnected`
   * padots (spēlētājs PILNĪBĀ atvienojies — nav cita aktīva socketa), un viņš sēž
   * spēlē, atzīmē `connectionState = disconnected` (spēle turpinās, sēdvieta paliek).
   */
  onDisconnected(
    hub: GatewayHub,
    serverNow: number,
    disconnected?: ConnectionIdentity
  ): MaybePromise<void>;
  /**
   * Periodiska istabu TTL izslaukšana (net slānis to sauc ar `setInterval`):
   * iznīcina istabas, kurām beidzies laiks, un, ja kāda iznīcināta, pārraida
   * jauno LOBBY_STATE (lai klienti noņem istabu no saraksta).
   */
  sweepExpiredRooms(hub: GatewayHub, now: number): MaybePromise<void>;
}

export interface CoreMessageRouterOptions {
  readonly rooms: RoomManager;
  readonly chat: LobbyChat;
  readonly roomOwnership?: RoomOwnershipGuard;
  /**
   * LOBBY_STATE broadcast koalescēšana (ms). 0 (noklusējums) = izsūta uzreiz
   * (testi paliek sinhroni). Produkcijā (`index.ts`) > 0: vairāki istabu izmaiņu
   * notikumi īsā logā tiek apvienoti VIENĀ broadcast, lai pie liela klientu skaita
   * (1000+) neveidotos fanout pārslodze (O(izmaiņas × klienti) → OOM aizsardzība).
   */
  readonly lobbyStateDebounceMs?: number;
}

/**
 * Maršrutē validētu, autentificētu klienta ziņojumu uz pareizo apstrādātāju.
 * Gateway garantē, ka ziņojums jau ir izgājis JSON + Zod + handshake pārbaudi,
 * tāpēc maršrutētājs nesatur transporta vai protokola validāciju.
 *
 * Fāze 6.5 (lobby): `LIST_ROOMS`, `CREATE_ROOM`, `JOIN_ROOM`, `LEAVE_ROOM`,
 * `FILL_SEATS_WITH_BOTS` deleģē uz `RoomManager`; pieprasītājs saņem tiešo
 * atbildi (ROOM_LIST/ROOM_CREATED/ROOM_JOINED/ROOM_LEFT), un jebkura istabu
 * saraksta izmaiņa izsūta `LOBBY_STATE` visiem. `ALREADY_IN_ROOM` (viena istaba
 * vienlaikus) tiek piespiests caur `RoomManager`.
 *
 * Zelta noteikums: maršrutētājs nesatur spēles noteikumu loģiku — tā paliek
 * `RoomEngine`/`core`. `START_GAME` un spēles/čata ziņojumi (6.6/6.7) vēl nav
 * pieslēgti un saņem godīgu "vēl nav pieejams" atbildi, nevis kluso ignorēšanu.
 */
export class CoreMessageRouter implements MessageRouter {
  private readonly rooms: RoomManager;
  private readonly chat: LobbyChat;
  private readonly roomOwnership: RoomOwnershipGuard;
  private readonly lobbyStateDebounceMs: number;
  /** Gaidošā debounce flush (ja kāda) + pēdējais hub LOBBY_STATE izsūtīšanai. */
  private lobbyFlushTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingLobbyHub: GatewayHub | undefined;
  /** Per-savienojuma istabu-izveides token-bucket (M5: novērš create-spam DoS). */
  private readonly roomCreateBuckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(options: CoreMessageRouterOptions) {
    this.rooms = options.rooms;
    this.chat = options.chat;
    this.roomOwnership = options.roomOwnership ?? noopRoomOwnershipGuard;
    this.lobbyStateDebounceMs = Math.max(0, options.lobbyStateDebounceMs ?? 0);
  }

  route(ctx: RouteContext, message: PostHandshakeMessage): MaybePromise<void> {
    switch (message.type) {
      case "PING":
        ctx.conn.send({ type: "PONG", clientTime: message.clientTime, serverNow: ctx.serverNow });
        return;
      case "LIST_ROOMS":
        ctx.conn.send({ type: "ROOM_LIST", rooms: this.rooms.listRooms() });
        return;
      case "CREATE_ROOM":
        return this.handleCreateRoom(ctx, message);
      case "VIEW_ROOM":
        return this.handleViewRoom(ctx, message);
      case "JOIN_ROOM":
        return this.handleJoinRoom(ctx, message);
      case "LEAVE_ROOM":
        return this.handleLeaveRoom(ctx);
      case "FILL_SEATS_WITH_BOTS":
        return this.handleFillSeats(ctx);
      case "START_GAME":
        return this.handleStartGame(ctx);
      case "SUBMIT_BID":
        return this.handleSubmitBid(ctx, message);
      case "SUBMIT_MOVE":
        return this.handleSubmitMove(ctx, message);
      case "REQUEST_SNAPSHOT":
        return this.handleRequestSnapshot(ctx, message);
      case "PLAYER_RESUME":
        return this.handlePlayerResume(ctx, message);
      case "SEND_CHAT":
        this.handleSendChat(ctx, message);
        return;
      default: {
        // Izsmeļošības pārbaude kompilēšanas laikā: ja pievieno jaunu ziņojuma
        // tipu, šī piešķire `never` neizdosies, kamēr nav pievienots `case`.
        const unexpected: never = message;
        void unexpected;
        ctx.conn.send(errorEvent("INTERNAL_ERROR", "Unsupported message."));
      }
    }
  }

  private handleCreateRoom(
    ctx: RouteContext,
    message: Extract<PostHandshakeMessage, { type: "CREATE_ROOM" }>
  ): MaybePromise<void> {
    return this.guard(ctx, () => {
      // M5: rate-limits istabu izveidi pirms jebkādas state izmaiņas.
      if (!this.consumeRoomCreateToken(ctx.identity.playerId, ctx.serverNow)) {
        ctx.conn.send(errorEvent("RATE_LIMITED", "You are creating rooms too quickly."));
        return;
      }
      const room = this.rooms.createRoom(ctx.identity.playerId, {
        ...(message.visibility ? { visibility: message.visibility } : {}),
        ...(message.numberOfRounds !== undefined
          ? { numberOfRounds: message.numberOfRounds }
          : {})
      });
      return this.withNewRoomLease(ctx, room.id, () => {
        if (message.fillWithBots === true) {
          this.rooms.fillSeatsWithBots(ctx.identity.playerId);
        }
        ctx.conn.send({ type: "ROOM_CREATED", room: this.rooms.getRoomView(room.id) });
        this.pushLobbyState(ctx.hub);
      });
    });
  }

  private handleJoinRoom(
    ctx: RouteContext,
    message: Extract<PostHandshakeMessage, { type: "JOIN_ROOM" }>
  ): MaybePromise<void> {
    return this.guard(ctx, () => {
      const code = message.code?.trim();
      const target = code
        ? this.rooms.viewRoom({ code })
        : message.roomId !== undefined
          ? this.rooms.viewRoom({ roomId: message.roomId })
          : undefined;
      if (target === undefined) {
        throw new LobbyError("ROOM_NOT_FOUND", "JOIN_ROOM requires roomId or code.");
      }
      return this.withOwnedRoom(ctx, target.id, () => {
        const room = code
          ? this.rooms.joinRoom(ctx.identity.playerId, { code, seatIndex: message.seatIndex })
          : this.rooms.joinRoom(ctx.identity.playerId, {
              roomId: target.id,
              seatIndex: message.seatIndex
            });
        this.pushRoomView(ctx.hub, room.id);
        this.pushLobbyState(ctx.hub);
      });
    });
  }

  private handleViewRoom(
    ctx: RouteContext,
    message: Extract<PostHandshakeMessage, { type: "VIEW_ROOM" }>
  ): MaybePromise<void> {
    return this.guard(ctx, () => {
      const code = message.code?.trim();
      const room = code
        ? this.rooms.viewRoom({ code })
        : message.roomId !== undefined
          ? this.rooms.viewRoom({ roomId: message.roomId })
          : undefined;
      if (room === undefined) {
        throw new LobbyError("ROOM_NOT_FOUND", "VIEW_ROOM requires roomId or code.");
      }
      ctx.conn.send({ type: "ROOM_VIEW", room: this.rooms.getRoomView(room.id) });
    });
  }

  private handleLeaveRoom(ctx: RouteContext): MaybePromise<void> {
    return this.guard(ctx, () => {
      const roomId = this.requireCurrentRoom(ctx);
      // Spēles laikā "Exit" = forfeit (sēdvieta → bots / istabu iznīcina); citādi
      // parastā WAITING pamešana.
      return this.withOwnedRoom(ctx, roomId, () => {
        if (this.rooms.findRoom(roomId).status === "IN_GAME") {
          this.handleForfeit(ctx);
          return;
        }
        const room = this.rooms.leaveRoom(ctx.identity.playerId);
        ctx.conn.send({ type: "ROOM_LEFT", roomId: room.id });
        if (room.status !== "DESTROYED") {
          this.pushRoomView(ctx.hub, room.id);
        } else {
          this.releaseRoomLease(room.id);
        }
        this.pushLobbyState(ctx.hub);
      });
    });
  }

  /**
   * Forfeit spēles laikā: pamet spēlētājs neatgriezeniski. Pieprasītājs saņem
   * `ROOM_LEFT` (→ atpakaļ lobby). Ja istaba turpinās → `PLAYER_LEFT` + spēles
   * cilpa (tagad-bots sēdvieta auto-spēlē) + svaigs snapshot + istabas skats
   * pārējiem. Ja iznīcināta (nepalika cilvēku) → tikai lobby state.
   */
  private handleForfeit(ctx: RouteContext): void {
    const { room, events, destroyed } = this.rooms.forfeitInGame(ctx.identity.playerId);
    ctx.conn.send({ type: "ROOM_LEFT", roomId: room.id });
    if (!destroyed) {
      const advanceEvents = this.rooms.advanceGame(room.id);
      this.deliverGameUpdate(ctx, room.id, [...events, ...advanceEvents]);
      this.pushRoomView(ctx.hub, room.id);
      // Ja pēc Exit istabā nepalika neviena tiešsaistes cilvēka (otrs jau atvienojies),
      // ieplāno pamešanas grace → istaba pazūd pēc īsa perioda (konsekventi ar
      // atvienojuma ceļu), nevis paliek līdz TTL / spēles beigām.
      this.maybeScheduleAbandonForRoom(ctx.hub, room.id);
    } else {
      this.releaseRoomLease(room.id);
    }
    this.pushLobbyState(ctx.hub);
  }

  private handleFillSeats(ctx: RouteContext): MaybePromise<void> {
    return this.guard(ctx, () => {
      // Host aizpilda tukšās sēdvietas ar botiem; pieprasītājs saņem atjaunoto
      // istabas skatu (ROOM_JOINED kā istabas state atsvaidze); ja istabā ir
      // vairāki cilvēki, visi redz vienu un to pašu sēdvietu skatu.
      const roomId = this.requireCurrentRoom(ctx);
      return this.withOwnedRoom(ctx, roomId, () => {
        const room = this.rooms.fillSeatsWithBots(ctx.identity.playerId);
        this.pushRoomView(ctx.hub, room.id);
        this.pushLobbyState(ctx.hub);
      });
    });
  }

  private handleStartGame(ctx: RouteContext): MaybePromise<void> {
    return this.guard(ctx, () => {
      const roomId = this.requireCurrentRoom(ctx);
      return this.withOwnedRoom(ctx, roomId, () => {
        const { room, startsAt } = this.rooms.startGame(ctx.identity.playerId);
        this.pushRoomView(ctx.hub, room.id);
        if (startsAt <= ctx.serverNow) {
        // Bez pirms-spēles grace: sākam uzreiz (dzen līdz 1. cilvēka turnam).
          const events = this.rooms.advanceGame(room.id);
          this.deliverGameUpdate(ctx, room.id, events);
        } else {
        // Pirms-spēles grace: galds + atskaite; pirmo turnu atver servera timeris.
          this.deliverGameStarting(ctx, room.id, startsAt);
        }
      // Istaba pārgāja IN_GAME → istabu saraksts mainījies.
        this.pushLobbyState(ctx.hub);
      });
    });
  }

  /**
   * Pirms-spēles piegāde: katram sēdošajam cilvēkam personalizēts atvēršanas
   * `STATE_SNAPSHOT` (galds ar rokām, vēl bez aktīva turna) + `GAME_STARTING` ar
   * `startsAt` (kad sāksies solījumi). Pirmo turnu atver servera timeris vēlāk.
   */
  private deliverGameStarting(ctx: RouteContext, roomId: string, startsAt: number): void {
    for (const human of this.rooms.getSeatedHumans(roomId)) {
      ctx.hub.sendToPlayer(human.clientId, {
        type: "STATE_SNAPSHOT",
        roomId,
        seq: this.rooms.getSeq(roomId),
        snapshot: this.rooms.getSnapshotForClient(roomId, human.clientId),
        serverNow: ctx.serverNow
      });
      ctx.hub.sendToPlayer(human.clientId, {
        type: "GAME_STARTING",
        roomId,
        startsAt,
        serverNow: ctx.serverNow
      });
    }
  }

  private handleSubmitBid(
    ctx: RouteContext,
    message: Extract<PostHandshakeMessage, { type: "SUBMIT_BID" }>
  ): MaybePromise<void> {
    return this.handleSubmit(ctx, message.roomId, message.requestId, (corePlayerId) => ({
      type: "SUBMIT_BID",
      gameId: message.roomId,
      requestId: message.requestId,
      playerId: corePlayerId,
      turnId: message.turnId,
      now: 0,
      bid: message.bid
    }));
  }

  private handleSubmitMove(
    ctx: RouteContext,
    message: Extract<PostHandshakeMessage, { type: "SUBMIT_MOVE" }>
  ): MaybePromise<void> {
    return this.handleSubmit(ctx, message.roomId, message.requestId, (corePlayerId) => ({
      type: "SUBMIT_MOVE",
      gameId: message.roomId,
      requestId: message.requestId,
      playerId: corePlayerId,
      turnId: message.turnId,
      now: 0,
      tile: message.move.tile,
      ...(message.move.declaredNumber !== undefined
        ? { declaredNumber: message.move.declaredNumber }
        : {})
    }));
  }

  /**
   * Kopīgais gājiena ceļš (SUBMIT_BID/SUBMIT_MOVE). Servera validācijas secība:
   * Zod (gateway) → roomId pieder spēlētājam (transports) → core (kārta, turnId,
   * deadline, requestId idempotence, legalitāte) caur `RoomEngine.dispatch`.
   * Klients NEKAD nesūta playerId — to autoritatīvi nosaka identitāte/sēdvieta.
   */
  private handleSubmit(
    ctx: RouteContext,
    roomId: string,
    requestId: string,
    buildCommand: (corePlayerId: string) => Parameters<RoomManager["routeMessageToRoomEngine"]>[1]
  ): MaybePromise<void> {
    return this.guard(
      ctx,
      () => {
        this.requireMembership(ctx, roomId);
        return this.withOwnedRoom(ctx, roomId, () => {
          const corePlayerId = this.rooms.corePlayerIdForClient(roomId, ctx.identity.playerId);
          const result = this.rooms.routeMessageToRoomEngine(roomId, buildCommand(corePlayerId));
          this.completeSubmit(ctx, roomId, requestId, result);
        });
      },
      requestId
    );
  }

  /** Apstrādā dispatch rezultātu: idempotents replay / noraidījums / pieņemts. */
  private completeSubmit(
    ctx: RouteContext,
    roomId: string,
    requestId: string,
    result: RoomDispatchResult
  ): void {
    if (result.idempotentReplay) {
      // Jau apstrādāts requestId — tikai pārsinhronizē pieprasītāju ar snapshot.
      ctx.conn.send(this.snapshotFor(ctx, roomId));
      return;
    }
    if (!result.accepted) {
      ctx.conn.send(errorEvent(toMoveErrorCode(result.errors), firstErrorMessage(result.errors), requestId));
      return;
    }
    // Pieņemts: gājiena eventi + tālāka cilpa (botu darbības/nākamais turns) → piegāde.
    const advanceEvents = this.rooms.advanceGame(roomId);
    this.deliverGameUpdate(ctx, roomId, [...result.events, ...advanceEvents]);
  }

  /** Piegādā spēles atjauninājumu istabas dalībniekiem (kopīgs ar timeout ceļu). */
  private deliverGameUpdate(
    ctx: RouteContext,
    roomId: string,
    events: readonly SequencedRoomEvent[]
  ): void {
    this.publishAndFinalize(ctx.hub, roomId, events, ctx.serverNow);
  }

  /**
   * Servera-iniciētā (pacētā botu izspēle / turn timeout) spēles atjauninājuma
   * piegāde, ko `RoomManager` izsauc caur `setGameUpdateSink`. Tāpat kā
   * klienta-iniciētajā ceļā, pabeigta partija (GAME_OVER) iznīcina istabu un
   * atjauno lobby sarakstu.
   */
  deliverServerGameUpdate(
    hub: GatewayHub,
    roomId: string,
    events: readonly SequencedRoomEvent[],
    serverNow: number
  ): void {
    this.publishAndFinalize(hub, roomId, events, serverNow);
  }

  /**
   * Izsūta spēles eventus + svaigus snapshotus, tad — ja partija beigusies
   * (saņemts `GAME_OVER`) — iznīcina pabeigto istabu un pārraida jauno
   * LOBBY_STATE. Citādi pabeigta partija paliktu IN_GAME mūžīgi (atmiņas/timeru
   * noplūde), un tās spēlētāji būtu "iesprūduši" (nevarētu izveidot jaunu istabu).
   * Iznīcināšana notiek PĒC piegādes, lai klienti saņem GAME_OVER + gala snapshotu.
   */
  private publishAndFinalize(
    hub: GatewayHub,
    roomId: string,
    events: readonly SequencedRoomEvent[],
    serverNow: number
  ): void {
    publishGameUpdate(hub, this.rooms, roomId, events, serverNow);
    if (events.some((entry) => entry.event.type === "GAME_OVER")) {
      this.rooms.destroyFinishedRoom(roomId);
      this.releaseRoomLease(roomId);
      this.pushLobbyState(hub);
    }
  }

  /**
   * Seq-atjaunošana pēc savienojuma pārrāvuma: ja klienta `lastSeq` joprojām ir
   * ring-buferī → sūta tikai trūkstošos `GAME_EVENT`; citādi pilnu personalizētu
   * `STATE_SNAPSHOT`. Atbild tikai pieprasītājam.
   */
  private handleRequestSnapshot(
    ctx: RouteContext,
    message: Extract<PostHandshakeMessage, { type: "REQUEST_SNAPSHOT" }>
  ): MaybePromise<void> {
    return this.guard(ctx, () => {
      this.requireMembership(ctx, message.roomId);
      return this.withOwnedRoom(ctx, message.roomId, () => {
        const recovery = this.rooms.getEventsSince(message.roomId, message.lastSeq);
        if (recovery.mode === "incremental") {
          for (const entry of recovery.events) {
            ctx.conn.send({
              type: "GAME_EVENT",
              roomId: message.roomId,
              seq: entry.seq,
              event: entry.event,
              serverNow: ctx.serverNow
            });
          }
          return;
        }
        ctx.conn.send(this.snapshotFor(ctx, message.roomId));
      });
    });
  }

  /**
   * In-game reconnect: atjauno spēlētāja core connection state (emitē
   * `PLAYER_RESUMED`) un pilnībā re-sinhronizē atgriežos spēlētāju ar svaigu
   * `STATE_SNAPSHOT`. requestId atvasināts no `sessionId` (unikāls savienojumam),
   * tāpēc atkārtots resume tajā pašā savienojumā ir idempotents.
   */
  private handlePlayerResume(
    ctx: RouteContext,
    message: Extract<PostHandshakeMessage, { type: "PLAYER_RESUME" }>
  ): MaybePromise<void> {
    return this.guard(ctx, () => {
      this.requireMembership(ctx, message.roomId);
      return this.withOwnedRoom(ctx, message.roomId, () => {
        const corePlayerId = this.rooms.corePlayerIdForClient(message.roomId, ctx.identity.playerId);
        const result = this.rooms.routeMessageToRoomEngine(message.roomId, {
          type: "PLAYER_RESUME",
          gameId: message.roomId,
          requestId: `resume:${ctx.identity.sessionId}`,
          playerId: corePlayerId
        });

        if (result.idempotentReplay) {
        // Jau atjaunots šajā savienojumā → tikai resync snapshot pieprasītājam.
          ctx.conn.send(this.snapshotFor(ctx, message.roomId));
          return;
        }
        if (!result.accepted) {
          ctx.conn.send(errorEvent("FORBIDDEN", firstErrorMessage(result.errors)));
          return;
        }
      // PLAYER_RESUMED dalībniekiem + svaigs personalizēts snapshot katram.
        this.deliverGameUpdate(ctx, message.roomId, result.events);
      });
    });
  }

  /** Personalizēts pašreizējais `STATE_SNAPSHOT` events pieprasītājam. */
  private snapshotFor(ctx: RouteContext, roomId: string): ServerEvent {
    return {
      type: "STATE_SNAPSHOT",
      roomId,
      seq: this.rooms.getSeq(roomId),
      snapshot: this.rooms.getSnapshotForClient(roomId, ctx.identity.playerId),
      serverNow: ctx.serverNow
    };
  }

  private requireMembership(ctx: RouteContext, roomId: string): void {
    if (this.rooms.roomOf(ctx.identity.playerId) !== roomId) {
      throw new LobbyError("FORBIDDEN", `Player is not a member of room ${roomId}.`);
    }
  }

  private requireCurrentRoom(ctx: RouteContext): string {
    const roomId = this.rooms.roomOf(ctx.identity.playerId);
    if (roomId === undefined) {
      throw new LobbyError("PLAYER_NOT_IN_ROOM", `Player ${ctx.identity.playerId} is not in a room.`);
    }
    return roomId;
  }

  private handleSendChat(
    ctx: RouteContext,
    message: Extract<PostHandshakeMessage, { type: "SEND_CHAT" }>
  ): void {
    const result = this.chat.submit(ctx.identity.playerId, ctx.identity.displayId, message.text);
    if (!result.ok) {
      ctx.conn.send(errorEvent(result.code, result.reason, message.requestId));
      return;
    }
    ctx.hub.broadcast({ type: "CHAT_MESSAGE", ...result.message });
  }

  /** Pēc handshake: jaunajam dalībniekam čata vēsture + onlineCount push visiem. */
  onConnected(ctx: RouteContext): MaybePromise<void> {
    ctx.conn.send({ type: "CHAT_HISTORY", messages: this.chat.history() });
    this.pushLobbyState(ctx.hub);
    return this.restoreRoomOnReconnect(ctx);
  }

  /**
   * Reconnect/refresh atjaunošana: ja spēlētājs joprojām sēž istabā (dalība
   * saglabājās pāri atvienojumam), proaktīvi atjauno istabas skatu, un, ja spēle
   * notiek — connection state (`PLAYER_RESUMED`) + svaigu personalizētu snapshot
   * ar aktuālo `deadlineAt`. Pirmajā savienojumā (vēl nav istabā) — nekas.
   */
  private restoreRoomOnReconnect(ctx: RouteContext): MaybePromise<void> {
    const roomId = this.rooms.roomOf(ctx.identity.playerId);
    if (roomId === undefined) return;
    // Cilvēks atgriezās → atceļam pamešanas grace (istaba netiek iznīcināta) un
    // viņa sēdvietas auto-forfeit timeri (5.6).
    this.rooms.cancelAbandonGrace(roomId);
    this.rooms.cancelDisconnectForfeit(roomId, ctx.identity.playerId);
    return this.guard(ctx, () => this.withOwnedRoom(ctx, roomId, () => {
      ctx.conn.send({ type: "ROOM_JOINED", room: this.rooms.getRoomView(roomId) });
      if (this.rooms.findRoom(roomId).status !== "IN_GAME") return; // gaidītava — pietiek ar skatu
      const corePlayerId = this.rooms.corePlayerIdForClient(roomId, ctx.identity.playerId);
      const result = this.rooms.routeMessageToRoomEngine(roomId, {
        type: "PLAYER_RESUME",
        gameId: roomId,
        requestId: `resume:${ctx.identity.sessionId}`,
        playerId: corePlayerId
      });
      if (result.accepted && result.events.length > 0) {
        // PLAYER_RESUMED visiem + svaigs snapshot katram (ieskaitot atgriezušos).
        this.deliverGameUpdate(ctx, roomId, result.events);
      } else {
        // Jau pieslēgts / idempotent → tikai resync pieprasītājam.
        ctx.conn.send(this.snapshotFor(ctx, roomId));
      }
    }));
  }

  /** Pēc aizvēršanas: onlineCount samazinājies → atjauno pārējiem (+ disconnect mark). */
  onDisconnected(
    hub: GatewayHub,
    serverNow: number,
    disconnected?: ConnectionIdentity
  ): MaybePromise<void> {
    let disconnectResult: MaybePromise<void> | undefined;
    if (disconnected !== undefined) {
      disconnectResult = this.markPlayerDisconnected(hub, serverNow, disconnected);
      this.maybeScheduleAbandon(hub, disconnected);
      // Atbrīvojam čata + istabu-izveides rate-limit stāvokli (atmiņa neaug pie
      // liela mēroga; atgriežoties spēlētājs sāk ar pilnu uzliesmojuma budžetu).
      this.chat.forget(disconnected.playerId);
      this.roomCreateBuckets.delete(disconnected.playerId);
      // M3 piezīme: durable sesiju (token + displayId) NEATBRĪVOJAM šeit — token
      // apzināti pārdzīvo atvienojumu (reconnect grace + nepareiza-token impostora
      // noraidīšana, sk. WebSocketGateway token validāciju). Atbrīvošana notiek
      // pie dalības zaudēšanas offline spēlētājam (`onMemberDeparted` →
      // `releaseSession`), kad istaba tiek pamesta/iznīcināta.
    }
    this.pushLobbyState(hub);
    return disconnectResult;
  }

  /**
   * 9.3-b: ja pēc atvienojuma istabā NAV neviena tiešsaistes cilvēka, ieplāno
   * istabas iznīcināšanu pēc grace perioda (refresh paspēj atgriezties). Reconnect
   * grace laikā to atceļ; ja neviens neatgriežas → `destroyAbandonedRoom`.
   */
  private maybeScheduleAbandon(hub: GatewayHub, identity: ConnectionIdentity): void {
    try {
      const roomId = this.rooms.roomOf(identity.playerId);
      if (roomId === undefined) return;
      this.maybeScheduleAbandonForRoom(hub, roomId);
    } catch (error) {
      // Best-effort: atvienojuma apstrāde nedrīkst sabrukt. ROOM_NOT_FOUND ir gaidīts
      // (istaba pa to laiku pazuda); citas kļūdas ir negaidītas → padarām redzamas.
      logUnexpectedBestEffort(error, "maybeScheduleAbandon", identity.playerId);
    }
  }

  /**
   * Ja istaba ir IN_GAME un tajā NAV neviena tiešsaistes cilvēka, ieplāno pamešanas
   * grace → iznīcina pēc perioda. Izsaukts gan no atvienojuma ceļa, gan pēc explicit
   * Exit/forfeit: kad pamet pēdējais TIEŠSAISTES cilvēks, kamēr otrs jau atvienojies,
   * `forfeitSeat` istabu neiznīcina (atvienotais joprojām ir "human" sēdvieta), tāpēc
   * šeit ieplānojam grace — citādi istaba paliktu sarakstā līdz TTL / spēles beigām.
   */
  private maybeScheduleAbandonForRoom(hub: GatewayHub, roomId: string): void {
    if (this.rooms.findRoom(roomId).status !== "IN_GAME") return;
    const anyOnline = this.rooms.getSeatedHumans(roomId).some((human) => hub.isOnline(human.clientId));
    if (anyOnline) return; // vismaz viens cilvēks tiešsaistē → spēle turpinās
    this.rooms.scheduleAbandonGrace(roomId, () => this.destroyAbandonedRoom(hub, roomId));
  }

  /** Grace beidzies: ja joprojām neviens cilvēks nav tiešsaistē → iznīcina istabu. */
  private destroyAbandonedRoom(hub: GatewayHub, roomId: string): void {
    try {
      const room = this.rooms.findRoom(roomId);
      if (room.status !== "IN_GAME") return;
      const anyOnline = this.rooms.getSeatedHumans(roomId).some((human) => hub.isOnline(human.clientId));
      if (anyOnline) return; // kāds atgriezās starplaikā
      this.rooms.destroyRoom(roomId);
      this.releaseRoomLease(roomId);
      this.pushLobbyState(hub);
    } catch (error) {
      // Best-effort: ROOM_NOT_FOUND nozīmē, ka istaba jau iznīcināta (piem. spēle
      // beidzās) — gaidīts, nekas nav jādara. Citas kļūdas (destroyRoom/pushLobbyState)
      // ir negaidītas → padarām redzamas operatoram.
      logUnexpectedBestEffort(error, "destroyAbandonedRoom", roomId);
    }
  }

  /**
   * Atvienota spēlētāja sēdvietas auto-forfeit pēc grace (5.6). Re-pārbauda pie
   * nostrādes: istaba IN_GAME, spēlētājs joprojām offline + sēž, UN ir vismaz viens
   * CITS tiešsaistes cilvēks (citādi pilnas istabas abandon ceļš apstrādā visus).
   * Tad forfeitē sēdvietu (→ bots, `lose` caur RoomManager hook) un piegādā
   * atjauninājumu pārējiem (ctx-brīvi, kā turn-timeout). Best-effort.
   */
  private autoForfeitDisconnected(
    hub: GatewayHub,
    roomId: string,
    clientId: string,
    serverNow: number
  ): void {
    try {
      if (this.rooms.findRoom(roomId).status !== "IN_GAME") return;
      if (hub.isOnline(clientId)) return; // atgriezies
      const humans = this.rooms.getSeatedHumans(roomId);
      if (!humans.some((human) => human.clientId === clientId)) return; // jau aizgājis
      const otherOnline = humans.some(
        (human) => human.clientId !== clientId && hub.isOnline(human.clientId)
      );
      if (!otherOnline) return; // neviens cits online → abandon ceļš apstrādā visus
      const { room, events, destroyed } = this.rooms.forfeitInGame(clientId);
      if (destroyed) {
        this.releaseRoomLease(room.id);
      } else {
        const advanceEvents = this.rooms.advanceGame(room.id);
        publishGameUpdate(hub, this.rooms, room.id, [...events, ...advanceEvents], serverNow);
        this.pushRoomView(hub, room.id);
      }
      this.pushLobbyState(hub);
    } catch {
      // Istaba jau iznīcināta / spēle beigusies — nekas nav jādara.
    }
  }

  /**
   * Atzīmē spēlētāju kā atvienotu spēlē (ja viņš sēž IN_GAME istabā). Spēle NETIEK
   * apturēta — sēdvieta paliek rezervēta, turn timeris turpinās (timeout politika
   * auto-izspēlē). Best-effort: kļūdas tiek apslāpētas (savienojuma vairs nav).
   */
  private markPlayerDisconnected(
    hub: GatewayHub,
    serverNow: number,
    identity: ConnectionIdentity
  ): MaybePromise<void> {
    try {
      const roomId = this.rooms.roomOf(identity.playerId);
      if (roomId === undefined) return;
      if (this.rooms.findRoom(roomId).status !== "IN_GAME") return;
      // Fāze 3 (5.6): ieplāno šī spēlētāja sēdvietas auto-forfeit, ja paliek offline
      // ≥ grace, kamēr citi turpina spēli. Atceļ pie reconnect (restoreRoomOnReconnect).
      this.rooms.scheduleDisconnectForfeit(roomId, identity.playerId, (now) =>
        this.autoForfeitDisconnected(hub, roomId, identity.playerId, now)
      );
      return this.runOwnedRoomBestEffort(roomId, serverNow, () => {
        const corePlayerId = this.rooms.corePlayerIdForClient(roomId, identity.playerId);
        const result = this.rooms.routeMessageToRoomEngine(roomId, {
          type: "PLAYER_DISCONNECT",
          gameId: roomId,
          requestId: `disconnect:${identity.sessionId}`,
          playerId: corePlayerId
        });
        if (result.accepted && result.events.length > 0) {
          publishGameUpdate(hub, this.rooms, roomId, result.events, serverNow);
        }
      });
    } catch {
      // Atvienojuma apstrāde nedrīkst sabrukt (piem. istaba jau iznīcināta).
    }
  }

  sweepExpiredRooms(hub: GatewayHub, now: number): void {
    const destroyed = this.rooms.destroyExpiredRooms(now);
    if (destroyed.length > 0) {
      for (const roomId of destroyed) {
        this.releaseRoomLease(roomId);
      }
      this.pushLobbyState(hub);
    }
  }

  /**
   * Istabu-izveides token-bucket (M5): atjauno atļaujas pēc pagājušā laika (līdz
   * `ROOM_CREATE_BURST`), tad mēģina patērēt vienu. Atgriež `true`, ja izveide
   * atļauta. Atspoguļo `LobbyChat.consumeToken` loģiku; stāvoklis tiek iztīrīts
   * pie pilnas atvienošanās (`onDisconnected`).
   */
  private consumeRoomCreateToken(playerId: string, now: number): boolean {
    const bucket = this.roomCreateBuckets.get(playerId);
    if (!bucket) {
      this.roomCreateBuckets.set(playerId, { tokens: ROOM_CREATE_BURST - 1, updatedAt: now });
      return true;
    }
    const elapsed = Math.max(0, now - bucket.updatedAt);
    const replenished = Math.min(ROOM_CREATE_BURST, bucket.tokens + elapsed / ROOM_CREATE_REFILL_MS);
    bucket.updatedAt = now;
    if (replenished < 1) {
      bucket.tokens = replenished; // saglabājam daļēju uzkrājumu
      return false;
    }
    bucket.tokens = replenished - 1;
    return true;
  }

  /** Izpilda istabu mutāciju, pārvēršot `LobbyError` par drošu `ERROR` eventu. */
  private guard(
    ctx: RouteContext,
    run: () => MaybePromise<void>,
    requestId?: string
  ): MaybePromise<void> {
    try {
      const result = run();
      if (isPromiseLike(result)) {
        return result.catch((error: unknown) => this.handleGuardError(ctx, error, requestId));
      }
      return result;
    } catch (error) {
      return this.handleGuardError(ctx, error, requestId);
    }
  }

  private handleGuardError(ctx: RouteContext, error: unknown, requestId?: string): void {
    if (error instanceof LobbyError) {
      ctx.conn.send(errorEvent(toProtocolErrorCode(error.code), error.message, requestId));
      return;
    }
    throw error;
  }

  private withOwnedRoom(
    ctx: RouteContext,
    roomId: string,
    run: () => void
  ): MaybePromise<void> {
    const ownership = this.roomOwnership.ensureOwner(roomId, ctx.serverNow);
    if (isPromiseLike(ownership)) {
      return ownership.then(run);
    }
    run();
  }

  private withNewRoomLease(
    ctx: RouteContext,
    roomId: string,
    run: () => void
  ): MaybePromise<void> {
    try {
      const ownership = this.roomOwnership.ensureOwner(roomId, ctx.serverNow);
      if (isPromiseLike(ownership)) {
        return ownership.then(run, (error: unknown) => {
          this.destroyRoomAfterFailedLease(ctx.hub, roomId);
          throw error;
        });
      }
    } catch (error) {
      this.destroyRoomAfterFailedLease(ctx.hub, roomId);
      throw error;
    }
    run();
  }

  private runOwnedRoomBestEffort(
    roomId: string,
    now: number,
    run: () => void
  ): MaybePromise<void> {
    try {
      const ownership = this.roomOwnership.ensureOwner(roomId, now);
      if (isPromiseLike(ownership)) {
        return ownership.then(run).catch(() => {
          // Best-effort lifecycle event: wrong-owner or already-destroyed room is ignored.
        });
      }
      run();
    } catch {
      // Best-effort lifecycle event: wrong-owner or already-destroyed room is ignored.
    }
  }

  private destroyRoomAfterFailedLease(hub: GatewayHub, roomId: string): void {
    try {
      this.rooms.destroyRoom(roomId);
      this.pushLobbyState(hub);
    } catch {
      // Room may already have been destroyed by another code path.
    }
  }

  private releaseRoomLease(roomId: string): void {
    const released = this.roomOwnership.release(roomId);
    if (isPromiseLike(released)) {
      void released.catch((error: unknown) => {
        console.error(`[room-ownership] failed to release lease for ${roomId}:`, error);
      });
    }
  }

  /**
   * Izsūta aktuālo istabu sarakstu + onlineCount visiem (jebkura lobby izmaiņa).
   * Ja `lobbyStateDebounceMs > 0`, vairākas izmaiņas īsā logā tiek koalescētas
   * VIENĀ broadcast (sk. opcijas komentāru) — flush nolasa state izsūtīšanas brīdī,
   * tāpēc vienmēr aizsūta jaunāko. Citādi izsūta uzreiz (sinhroni; testi).
   */
  private pushLobbyState(hub: GatewayHub): void {
    if (this.lobbyStateDebounceMs <= 0) {
      this.broadcastLobbyState(hub);
      return;
    }
    this.pendingLobbyHub = hub;
    if (this.lobbyFlushTimer !== undefined) {
      return; // flush jau ieplānots; tas aizsūtīs jaunāko state
    }
    this.lobbyFlushTimer = setTimeout(() => {
      this.lobbyFlushTimer = undefined;
      if (this.pendingLobbyHub) {
        this.broadcastLobbyState(this.pendingLobbyHub);
      }
    }, this.lobbyStateDebounceMs);
    // Neļaujam šim taimerim turēt procesu dzīvu (serveris dzīvo caur socketiem).
    this.lobbyFlushTimer.unref?.();
  }

  private broadcastLobbyState(hub: GatewayHub): void {
    hub.broadcast({
      type: "LOBBY_STATE",
      rooms: this.rooms.listRooms(),
      onlineCount: hub.onlineCount()
    });
  }

  /**
   * Izsūta aktuālo publisko istabas skatu visiem cilvēkiem, kas sēž istabā.
   * `ROOM_JOINED` šeit tiek lietots kā istabas view atsvaidze arī esošajiem
   * dalībniekiem; klienta reduktors to jau uztver kā `view.room = room`.
   */
  private pushRoomView(hub: GatewayHub, roomId: string): void {
    const room = this.rooms.getRoomView(roomId);
    for (const human of this.rooms.getSeatedHumans(roomId)) {
      hub.sendToPlayer(human.clientId, { type: "ROOM_JOINED", room });
    }
  }
}

/**
 * Kartē iekšējo `LobbyErrorCode` uz publisko `ProtocolErrorCode`. Iekšējie
 * precizējumi, kuriem nav publiska koda, tiek saplacināti uz `FORBIDDEN`.
 */
function toProtocolErrorCode(code: LobbyErrorCode): ProtocolErrorCode {
  switch (code) {
    case "ROOM_NOT_FOUND":
    case "ROOM_FULL":
    case "GAME_ALREADY_STARTED":
    case "NOT_HOST":
    case "ALREADY_IN_ROOM":
    case "FORBIDDEN":
      return code;
    case "ROOM_NOT_JOINABLE":
    case "NOT_ENOUGH_PLAYERS":
    case "PLAYER_NOT_IN_ROOM":
      return "FORBIDDEN";
    default:
      return assertNever(code);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled lobby error code: ${String(value)}`);
}

/**
 * Best-effort istabas dzīves cikla ceļiem: gaidīto `ROOM_NOT_FOUND` (istaba jau
 * pazudusi) klusē, bet padara negaidītas kļūdas redzamas ar kontekstu (operācija +
 * room/player id), lai produkcijas incidentus var izsekot. NEKAD nepārmet tālāk —
 * šie ceļi (atvienojums/teardown) nedrīkst sabrukt.
 */
function logUnexpectedBestEffort(error: unknown, operation: string, contextId: string): void {
  if (error instanceof LobbyError && error.code === "ROOM_NOT_FOUND") {
    return;
  }
  console.error(`[room-lifecycle] ${operation} failed for ${contextId}:`, error);
}

/** Kartē core gājiena/solījuma kļūdas kodu uz publisko `ProtocolErrorCode`. */
function toMoveErrorCode(errors: RoomDispatchResult["errors"]): ProtocolErrorCode {
  switch (errors[0]?.code) {
    case "ACTION_TOO_LATE":
      return "ACTION_TOO_LATE";
    case "wrong_player":
    case "turn_not_started":
    case "turn_id_mismatch":
      return "NOT_YOUR_TURN";
    default:
      // bid_rejected / move_rejected / action_not_allowed / queued / u.c. → nelegāls gājiens.
      return "MOVE_REJECTED";
  }
}

function firstErrorMessage(errors: RoomDispatchResult["errors"]): string {
  return errors[0]?.message ?? "Action rejected.";
}

function isPromiseLike<T>(value: MaybePromise<T>): value is Promise<T> {
  return typeof (value as { readonly then?: unknown } | undefined)?.then === "function";
}
