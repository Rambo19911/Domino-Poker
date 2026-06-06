import type { ClientMessage, ProtocolErrorCode, ServerEvent } from "@domino-poker/shared";

import type { LobbyChat } from "../chat/LobbyChat.js";
import { LobbyError, type LobbyErrorCode } from "../rooms/lobbyErrors.js";
import type { RoomDispatchResult, SequencedRoomEvent } from "../rooms/RoomEngine.js";
import type { RoomManager } from "../rooms/RoomManager.js";
import { publishGameUpdate } from "./gameUpdateDelivery.js";
import { errorEvent } from "./gatewayEvents.js";
import type { GatewayConnection } from "./GatewayConnection.js";
import type { GatewayHub } from "./GatewayHub.js";
import type { SessionIdentity as ConnectionIdentity } from "../sessions/SessionManager.js";

/** Visi klienta ziņojumi pēc handshake (HELLO apstrādā pats gateway). */
export type PostHandshakeMessage = Exclude<ClientMessage, { type: "HELLO" }>;

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
  route(ctx: RouteContext, message: PostHandshakeMessage): void;
  /** Pēc handshake: jauns lobby dalībnieks (čata vēsture + onlineCount push). */
  onConnected(ctx: RouteContext): void;
  /**
   * Pēc savienojuma aizvēršanas: atjauno onlineCount pārējiem. Ja `disconnected`
   * padots (spēlētājs PILNĪBĀ atvienojies — nav cita aktīva socketa), un viņš sēž
   * spēlē, atzīmē `connectionState = disconnected` (spēle turpinās, sēdvieta paliek).
   */
  onDisconnected(hub: GatewayHub, serverNow: number, disconnected?: ConnectionIdentity): void;
  /**
   * Periodiska istabu TTL izslaukšana (net slānis to sauc ar `setInterval`):
   * iznīcina istabas, kurām beidzies laiks, un, ja kāda iznīcināta, pārraida
   * jauno LOBBY_STATE (lai klienti noņem istabu no saraksta).
   */
  sweepExpiredRooms(hub: GatewayHub, now: number): void;
}

export interface CoreMessageRouterOptions {
  readonly rooms: RoomManager;
  readonly chat: LobbyChat;
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
  private readonly lobbyStateDebounceMs: number;
  /** Gaidošā debounce flush (ja kāda) + pēdējais hub LOBBY_STATE izsūtīšanai. */
  private lobbyFlushTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingLobbyHub: GatewayHub | undefined;

  constructor(options: CoreMessageRouterOptions) {
    this.rooms = options.rooms;
    this.chat = options.chat;
    this.lobbyStateDebounceMs = Math.max(0, options.lobbyStateDebounceMs ?? 0);
  }

  route(ctx: RouteContext, message: PostHandshakeMessage): void {
    switch (message.type) {
      case "PING":
        ctx.conn.send({ type: "PONG", clientTime: message.clientTime, serverNow: ctx.serverNow });
        return;
      case "LIST_ROOMS":
        ctx.conn.send({ type: "ROOM_LIST", rooms: this.rooms.listRooms() });
        return;
      case "CREATE_ROOM":
        this.handleCreateRoom(ctx, message);
        return;
      case "VIEW_ROOM":
        this.handleViewRoom(ctx, message);
        return;
      case "JOIN_ROOM":
        this.handleJoinRoom(ctx, message);
        return;
      case "LEAVE_ROOM":
        this.handleLeaveRoom(ctx);
        return;
      case "FILL_SEATS_WITH_BOTS":
        this.handleFillSeats(ctx);
        return;
      case "START_GAME":
        this.handleStartGame(ctx);
        return;
      case "SUBMIT_BID":
        this.handleSubmitBid(ctx, message);
        return;
      case "SUBMIT_MOVE":
        this.handleSubmitMove(ctx, message);
        return;
      case "REQUEST_SNAPSHOT":
        this.handleRequestSnapshot(ctx, message);
        return;
      case "PLAYER_RESUME":
        this.handlePlayerResume(ctx, message);
        return;
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
  ): void {
    this.guard(ctx, () => {
      const room = this.rooms.createRoom(ctx.identity.playerId, {
        ...(message.visibility ? { visibility: message.visibility } : {}),
        ...(message.numberOfRounds !== undefined
          ? { numberOfRounds: message.numberOfRounds }
          : {})
      });
      if (message.fillWithBots === true) {
        this.rooms.fillSeatsWithBots(ctx.identity.playerId);
      }
      ctx.conn.send({ type: "ROOM_CREATED", room: this.rooms.getRoomView(room.id) });
      this.pushLobbyState(ctx.hub);
    });
  }

  private handleJoinRoom(
    ctx: RouteContext,
    message: Extract<PostHandshakeMessage, { type: "JOIN_ROOM" }>
  ): void {
    this.guard(ctx, () => {
      const code = message.code?.trim();
      const room = code
        ? this.rooms.joinRoom(ctx.identity.playerId, { code, seatIndex: message.seatIndex })
        : message.roomId !== undefined
          ? this.rooms.joinRoom(ctx.identity.playerId, { roomId: message.roomId, seatIndex: message.seatIndex })
          : undefined;
      if (room === undefined) {
        throw new LobbyError("ROOM_NOT_FOUND", "JOIN_ROOM requires roomId or code.");
      }
      this.pushRoomView(ctx.hub, room.id);
      this.pushLobbyState(ctx.hub);
    });
  }

  private handleViewRoom(
    ctx: RouteContext,
    message: Extract<PostHandshakeMessage, { type: "VIEW_ROOM" }>
  ): void {
    this.guard(ctx, () => {
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

  private handleLeaveRoom(ctx: RouteContext): void {
    this.guard(ctx, () => {
      const roomId = this.rooms.roomOf(ctx.identity.playerId);
      // Spēles laikā "Exit" = forfeit (sēdvieta → bots / istabu iznīcina); citādi
      // parastā WAITING pamešana.
      if (roomId !== undefined && this.rooms.findRoom(roomId).status === "IN_GAME") {
        this.handleForfeit(ctx);
        return;
      }
      const room = this.rooms.leaveRoom(ctx.identity.playerId);
      ctx.conn.send({ type: "ROOM_LEFT", roomId: room.id });
      if (room.status !== "DESTROYED") {
        this.pushRoomView(ctx.hub, room.id);
      }
      this.pushLobbyState(ctx.hub);
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
    }
    this.pushLobbyState(ctx.hub);
  }

  private handleFillSeats(ctx: RouteContext): void {
    this.guard(ctx, () => {
      // Host aizpilda tukšās sēdvietas ar botiem; pieprasītājs saņem atjaunoto
      // istabas skatu (ROOM_JOINED kā istabas state atsvaidze); ja istabā ir
      // vairāki cilvēki, visi redz vienu un to pašu sēdvietu skatu.
      const room = this.rooms.fillSeatsWithBots(ctx.identity.playerId);
      this.pushRoomView(ctx.hub, room.id);
      this.pushLobbyState(ctx.hub);
    });
  }

  private handleStartGame(ctx: RouteContext): void {
    this.guard(ctx, () => {
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
  ): void {
    this.handleSubmit(ctx, message.roomId, message.requestId, (corePlayerId) => ({
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
  ): void {
    this.handleSubmit(ctx, message.roomId, message.requestId, (corePlayerId) => ({
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
  ): void {
    this.guard(
      ctx,
      () => {
        this.requireMembership(ctx, roomId);
        const corePlayerId = this.rooms.corePlayerIdForClient(roomId, ctx.identity.playerId);
        const result = this.rooms.routeMessageToRoomEngine(roomId, buildCommand(corePlayerId));
        this.completeSubmit(ctx, roomId, requestId, result);
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
    publishGameUpdate(ctx.hub, this.rooms, roomId, events, ctx.serverNow);
  }

  /**
   * Seq-atjaunošana pēc savienojuma pārrāvuma: ja klienta `lastSeq` joprojām ir
   * ring-buferī → sūta tikai trūkstošos `GAME_EVENT`; citādi pilnu personalizētu
   * `STATE_SNAPSHOT`. Atbild tikai pieprasītājam.
   */
  private handleRequestSnapshot(
    ctx: RouteContext,
    message: Extract<PostHandshakeMessage, { type: "REQUEST_SNAPSHOT" }>
  ): void {
    this.guard(ctx, () => {
      this.requireMembership(ctx, message.roomId);
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
  ): void {
    this.guard(ctx, () => {
      this.requireMembership(ctx, message.roomId);
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
  onConnected(ctx: RouteContext): void {
    ctx.conn.send({ type: "CHAT_HISTORY", messages: this.chat.history() });
    this.pushLobbyState(ctx.hub);
    this.restoreRoomOnReconnect(ctx);
  }

  /**
   * Reconnect/refresh atjaunošana: ja spēlētājs joprojām sēž istabā (dalība
   * saglabājās pāri atvienojumam), proaktīvi atjauno istabas skatu, un, ja spēle
   * notiek — connection state (`PLAYER_RESUMED`) + svaigu personalizētu snapshot
   * ar aktuālo `deadlineAt`. Pirmajā savienojumā (vēl nav istabā) — nekas.
   */
  private restoreRoomOnReconnect(ctx: RouteContext): void {
    const roomId = this.rooms.roomOf(ctx.identity.playerId);
    if (roomId === undefined) return;
    // Cilvēks atgriezās → atceļam pamešanas grace (istaba netiek iznīcināta).
    this.rooms.cancelAbandonGrace(roomId);
    this.guard(ctx, () => {
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
    });
  }

  /** Pēc aizvēršanas: onlineCount samazinājies → atjauno pārējiem (+ disconnect mark). */
  onDisconnected(hub: GatewayHub, serverNow: number, disconnected?: ConnectionIdentity): void {
    if (disconnected !== undefined) {
      this.markPlayerDisconnected(hub, serverNow, disconnected);
      this.maybeScheduleAbandon(hub, disconnected);
      // Atbrīvojam čata rate-limit stāvokli (atmiņa neaug pie liela mēroga).
      this.chat.forget(disconnected.playerId);
    }
    this.pushLobbyState(hub);
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
      if (this.rooms.findRoom(roomId).status !== "IN_GAME") return;
      const anyOnline = this.rooms.getSeatedHumans(roomId).some((human) => hub.isOnline(human.clientId));
      if (anyOnline) return; // vismaz viens cilvēks tiešsaistē → spēle turpinās
      this.rooms.scheduleAbandonGrace(roomId, () => this.destroyAbandonedRoom(hub, roomId));
    } catch {
      // Best-effort: atvienojuma apstrāde nedrīkst sabrukt.
    }
  }

  /** Grace beidzies: ja joprojām neviens cilvēks nav tiešsaistē → iznīcina istabu. */
  private destroyAbandonedRoom(hub: GatewayHub, roomId: string): void {
    try {
      const room = this.rooms.findRoom(roomId);
      if (room.status !== "IN_GAME") return;
      const anyOnline = this.rooms.getSeatedHumans(roomId).some((human) => hub.isOnline(human.clientId));
      if (anyOnline) return; // kāds atgriezās starplaikā
      this.rooms.destroyRoom(roomId);
      this.pushLobbyState(hub);
    } catch {
      // Istaba jau iznīcināta (piem. spēle beidzās) — nekas nav jādara.
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
  ): void {
    try {
      const roomId = this.rooms.roomOf(identity.playerId);
      if (roomId === undefined) return;
      if (this.rooms.findRoom(roomId).status !== "IN_GAME") return;
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
    } catch {
      // Atvienojuma apstrāde nedrīkst sabrukt (piem. istaba jau iznīcināta).
    }
  }

  sweepExpiredRooms(hub: GatewayHub, now: number): void {
    const destroyed = this.rooms.destroyExpiredRooms(now);
    if (destroyed.length > 0) {
      this.pushLobbyState(hub);
    }
  }

  /** Izpilda istabu mutāciju, pārvēršot `LobbyError` par drošu `ERROR` eventu. */
  private guard(ctx: RouteContext, run: () => void, requestId?: string): void {
    try {
      run();
    } catch (error) {
      if (error instanceof LobbyError) {
        ctx.conn.send(errorEvent(toProtocolErrorCode(error.code), error.message, requestId));
        return;
      }
      throw error;
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
