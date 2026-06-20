import {
  defaultRoomNumberOfRounds,
  maxRoomNumberOfRounds,
  MAX_ENTRY_FEE,
  MIN_ENTRY_FEE,
  minRoomNumberOfRounds
} from "@domino-poker/shared";
import type {
  RoomSeatView,
  RoomStatus,
  RoomSummary,
  RoomView,
  RoomVisibility,
  SeatKind
} from "@domino-poker/shared";

import { DisplayIdRegistry } from "../identity/DisplayIdRegistry.js";
import type { Clock } from "../timers/TurnTimerScheduler.js";
import { LobbyError } from "./lobbyErrors.js";

// Publiskie istabu DTO tipi dzīvo @domino-poker/shared (transporta līgumi);
// re-eksportējam tos, lai esošie LobbyManager patērētāji (RoomManager) tos
// joprojām var importēt no šejienes.
export type {
  RoomSeatView,
  RoomStatus,
  RoomSummary,
  RoomView,
  RoomVisibility,
  SeatKind
};

export const SEAT_COUNT = 4;
export const DEFAULT_ROOM_TTL_MS = 60 * 60 * 1000; // 1 stunda no createdAt

/** Maksas sēdvietas ieņemšanas dati (Fāze 3) — naudai necaurspīdīgi virkņu id. */
export interface SeatEntry {
  /** Vienreizēja sēdvietas ieņemšanas atslēga (ledger idempotence: debit↔refund). */
  readonly entryId: string;
  /** Lietotājs, kas samaksāja šo dalības maksu (refunds iet atpakaļ TIEŠI viņam). */
  readonly payerUserId: string;
}

/** Servera iekšējais sēdeklis — satur `playerId` (NEtiek atklāts citiem). */
export interface Seat {
  readonly index: number;
  readonly kind: SeatKind;
  readonly playerId?: string;
  readonly displayId?: string;
  /**
   * Maksas istabas sēdvietas ieņemšanas dati (Fāze 3): aizpildīts tikai cilvēka
   * sēdvietai maksas istabā (`room.entryFee > 0`). Botiem/bezmaksas — `undefined`.
   * `LobbyManager` to glabā necaurspīdīgi (kā `playerId`); naudas darbības iet caur
   * `WalletService` orķestrācijas slānī. Refunds atsaucas uz `entry.entryId`.
   */
  readonly entry?: SeatEntry;
}

/** Servera iekšējais istabas state — satur `playerId`/`hostPlayerId`. */
export interface Room {
  readonly id: string;
  readonly code: string;
  readonly visibility: RoomVisibility;
  readonly status: RoomStatus;
  readonly hostPlayerId: string | undefined;
  readonly seats: readonly Seat[];
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly numberOfRounds: number;
  /** Zelta monētu dalības maksa (Fāze 3); `0` = bezmaksas istaba. */
  readonly entryFee: number;
  /** Faktiski savāktais pods = `entryFee` × samaksājušo cilvēku skaits; `0` bezmaksas. */
  readonly pot: number;
}

export interface LobbyManagerOptions {
  readonly clock: Clock;
  readonly displayIds?: DisplayIdRegistry;
  readonly ttlMs?: number;
  readonly createRoomId?: () => string;
  readonly createRoomCode?: () => string;
}

/**
 * Tur visu istabu kolekciju un to dzīves ciklu (Fāze 5.2/5.4): izveide ar kodu
 * un TTL, sēdvietas (max 4), host loģika, botu aizpilde, host migrācija un
 * statusu FSM `WAITING → STARTING → IN_GAME → FINISHED → DESTROYED`.
 *
 * Visi publiskie skati (`listRooms`, `getRoomView`) atklāj tikai `displayId`,
 * nekad `playerId`. Cross-room "viena istaba vienlaikus" (`ALREADY_IN_ROOM` pēc
 * clientId) un komandu maršrutēšana pieder `RoomManager` (5.3).
 */
export class LobbyManager {
  private readonly rooms = new Map<string, Room>();
  private readonly codes = new Set<string>();
  private readonly clock: Clock;
  private readonly displayIds: DisplayIdRegistry;
  private readonly ttlMs: number;
  private readonly createRoomId: () => string;
  private readonly createRoomCode: () => string;

  constructor(options: LobbyManagerOptions) {
    this.clock = options.clock;
    this.displayIds = options.displayIds ?? new DisplayIdRegistry();
    this.ttlMs = options.ttlMs ?? DEFAULT_ROOM_TTL_MS;
    this.createRoomId = options.createRoomId ?? defaultRoomId;
    this.createRoomCode = options.createRoomCode ?? defaultRoomCode;
  }

  /** Izveido jaunu istabu; izveidotājs kļūst par host pie sēdekļa 0. */
  createRoom(options: {
    readonly hostPlayerId: string;
    readonly visibility?: RoomVisibility;
    readonly numberOfRounds?: number;
    /**
     * Zelta monētu dalības maksa (Fāze 3); `0`/izlaists = bezmaksas. Ja `> 0`,
     * `hostEntry` ir OBLIGĀTS (hosts maksā, D6) — orķestrācijas slānis vispirms
     * atomiski debitē hostu, tad izsauc šo ar `hostEntry`.
     */
    readonly entryFee?: number;
    readonly hostEntry?: SeatEntry;
  }): Room {
    const hostPlayerId = requireNonEmpty(options.hostPlayerId, "hostPlayerId");
    const entryFee = normalizeEntryFee(options.entryFee);
    if (entryFee > 0 && options.hostEntry === undefined) {
      throw new LobbyError("FORBIDDEN", "A paid room requires the host's paid seat entry.");
    }
    const now = this.clock();
    const room: Room = {
      id: this.nextRoomId(),
      code: this.nextRoomCode(),
      visibility: options.visibility ?? "public",
      status: "WAITING",
      hostPlayerId,
      seats: this.buildInitialSeats(hostPlayerId, entryFee > 0 ? options.hostEntry : undefined),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      numberOfRounds: normalizeNumberOfRounds(options.numberOfRounds),
      entryFee,
      // Hosts vienmēr maksā maksas istabā (D6) → sākotnējais pods = viena maksa.
      pot: entryFee > 0 ? entryFee : 0
    };
    this.rooms.set(room.id, room);
    this.codes.add(room.code);
    return room;
  }

  /** Servera iekšējais lasījums (satur `playerId`). Met ROOM_NOT_FOUND, ja nav. */
  getRoom(roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new LobbyError("ROOM_NOT_FOUND", `Room ${roomId} does not exist.`);
    }
    return room;
  }

  /** Atrod istabu pēc koda (reģistrnejutīgi); `undefined`, ja nav vai iznīcināta. */
  findRoomByCode(code: string): Room | undefined {
    const normalized = code.trim().toUpperCase();
    for (const room of this.rooms.values()) {
      if (room.code === normalized && isListable(room.status)) {
        return room;
      }
    }
    return undefined;
  }

  /** Publiskais saraksts: tikai WAITING un IN_GAME (privātās redzamas, ar karogu). */
  listRooms(): readonly RoomSummary[] {
    const summaries: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (isListable(room.status)) {
        summaries.push(this.toSummary(room, { revealCode: false }));
      }
    }
    return summaries;
  }

  /** Publiskais istabas skats ar sēdvietām (bez `playerId`). */
  getRoomView(roomId: string): RoomView {
    return this.toView(this.getRoom(roomId));
  }

  /**
   * Pievieno cilvēku spēlētāju izvēlētā vai pirmajā brīvajā sēdeklī (tikai WAITING
   * istabā). Maksas istabā (`room.entryFee > 0`) padod `entry` (ieņemšanas dati);
   * sēdvieta to glabā un pods palielinās par vienu dalības maksu. Orķestrācijas
   * slānis vispirms atomiski debitē, tad izsauc šo (debet-tad-commit-seat); ja šis
   * met (piem. ROOM_FULL race uz pēdējo sēdvietu pēc debeta), orķestrācija refundē.
   */
  assignSeat(roomId: string, playerId: string, requestedSeatIndex?: number, entry?: SeatEntry): Room {
    const room = this.getRoom(roomId);
    const id = requireNonEmpty(playerId, "playerId");
    this.assertJoinable(room);

    if (room.seats.some((seat) => seat.playerId === id)) {
      throw new LobbyError("ALREADY_IN_ROOM", `Player ${id} is already in room ${roomId}.`);
    }
    const emptyIndex = requestedSeatIndex ?? room.seats.findIndex((seat) => seat.kind === "empty");
    if (emptyIndex === -1) {
      throw new LobbyError("ROOM_FULL", `Room ${roomId} has no empty seats.`);
    }
    if (!Number.isInteger(emptyIndex) || emptyIndex < 0 || emptyIndex >= SEAT_COUNT) {
      throw new LobbyError("FORBIDDEN", `Seat index ${String(requestedSeatIndex)} is invalid.`);
    }
    if (room.seats[emptyIndex]?.kind !== "empty") {
      throw new LobbyError("ROOM_FULL", `Seat ${emptyIndex} in room ${roomId} is not empty.`);
    }

    const seatEntry = room.entryFee > 0 ? entry : undefined;
    return this.replaceRoom({
      ...room,
      seats: this.withSeat(room.seats, emptyIndex, this.makeSeat(emptyIndex, id, "human", seatEntry)),
      // Maksas istabā katra cilvēka ieņemšana palielina podu par vienu dalības maksu.
      pot: seatEntry !== undefined ? room.pot + room.entryFee : room.pot
    });
  }

  /** Host aizpilda visas tukšās sēdvietas ar deterministiskiem AI botiem. */
  fillSeatsWithBots(roomId: string, requestingPlayerId: string): Room {
    const room = this.getRoom(roomId);
    this.assertHost(room, requestingPlayerId);
    this.assertJoinable(room);

    const seats = room.seats.map((seat) =>
      seat.kind === "empty"
        ? this.makeSeat(seat.index, `bot:${room.id}:${seat.index}`, "bot")
        : seat
    );
    return this.replaceRoom({ ...room, seats });
  }

  /**
   * Spēlētājs pamet istabu WAITING fāzē. Ja aiziet host → migrē uz nākamo cilvēku
   * pēc `seatIndex`; ja nepaliek neviens cilvēks → istaba kļūst DESTROYED.
   */
  leaveRoom(roomId: string, playerId: string): Room {
    const room = this.getRoom(roomId);
    if (room.status !== "WAITING") {
      throw new LobbyError(
        "FORBIDDEN",
        "leaveRoom is only valid while the room is WAITING; use disconnect during a game."
      );
    }

    const seat = room.seats.find((candidate) => candidate.playerId === playerId);
    if (!seat) {
      throw new LobbyError("PLAYER_NOT_IN_ROOM", `Player ${playerId} is not in room ${roomId}.`);
    }

    this.displayIds.release(playerId);
    const seats = this.withSeat(room.seats, seat.index, emptySeat(seat.index));
    const remainingHumans = seats.filter((candidate) => candidate.kind === "human");
    // Maksas sēdvietas atbrīvošana (WAITING) atgriež tās maksu no poda; faktisko
    // refundu kontā veic orķestrācijas slānis pēc `seat.entry`.
    const pot = seat.entry !== undefined ? room.pot - room.entryFee : room.pot;

    if (remainingHumans.length === 0) {
      return this.replaceRoom({ ...room, seats, pot, status: "DESTROYED", hostPlayerId: undefined });
    }

    const nextHostPlayerId =
      room.hostPlayerId === playerId
        ? remainingHumans[0]?.playerId ?? room.hostPlayerId
        : room.hostPlayerId;

    return this.replaceRoom({ ...room, seats, pot, hostPlayerId: nextHostPlayerId });
  }

  /**
   * Spēlētājs apzināti pamet spēli (IN_GAME). Viņa sēdvieta kļūst par **botu**
   * (spēle turpinās raiti pārējiem; cilvēku skaits paliek korekts). Ja nepaliek
   * neviens cilvēks → istaba tiek iznīcināta (arī no lobby saraksta). Hosts pēc
   * vajadzības migrē uz nākamo cilvēku. Pamatā ļauj "Exit" pogai spēles laikā.
   */
  forfeitSeat(roomId: string, playerId: string): Room {
    const room = this.getRoom(roomId);
    if (room.status !== "IN_GAME") {
      throw new LobbyError("FORBIDDEN", `forfeitSeat is only valid while the room is IN_GAME.`);
    }
    const seat = room.seats.find((candidate) => candidate.kind === "human" && candidate.playerId === playerId);
    if (!seat) {
      throw new LobbyError("PLAYER_NOT_IN_ROOM", `Player ${playerId} is not a seated human in room ${roomId}.`);
    }

    const otherHumans = room.seats.filter(
      (candidate) => candidate.kind === "human" && candidate.playerId !== playerId
    );
    if (otherHumans.length === 0) {
      // Neviens cilvēks nepaliek → iznīcina (atbrīvo visus sēdvietu displayId).
      return this.destroyRoom(roomId);
    }

    this.displayIds.release(playerId);
    const botSeat = this.makeSeat(seat.index, `bot:${room.id}:${seat.index}`, "bot");
    const seats = this.withSeat(room.seats, seat.index, botSeat);
    const nextHostPlayerId =
      room.hostPlayerId === playerId ? otherHumans[0]!.playerId : room.hostPlayerId;
    return this.replaceRoom({ ...room, seats, hostPlayerId: nextHostPlayerId });
  }

  /** Vai istabu drīkst sākt: 4 aizpildītas sēdvietas un ≥1 cilvēks. */
  canStartGame(roomId: string): boolean {
    const room = this.getRoom(roomId);
    return (
      room.status === "WAITING" &&
      room.seats.every((seat) => seat.kind !== "empty") &&
      room.seats.some((seat) => seat.kind === "human")
    );
  }

  /** Host sāk spēli: WAITING → STARTING (prasa pilnu galdu + ≥1 cilvēku). */
  startGame(roomId: string, requestingPlayerId: string): Room {
    const room = this.getRoom(roomId);
    this.assertHost(room, requestingPlayerId);
    if (room.status !== "WAITING") {
      throw new LobbyError("GAME_ALREADY_STARTED", `Room ${roomId} is not in WAITING.`);
    }
    if (!this.canStartGame(roomId)) {
      throw new LobbyError(
        "NOT_ENOUGH_PLAYERS",
        "Starting requires all four seats filled with at least one human."
      );
    }
    return this.replaceRoom({ ...room, status: "STARTING" });
  }

  /** STARTING → IN_GAME (kad RoomEngine spēle ir izveidota). */
  markInGame(roomId: string): Room {
    const room = this.getRoom(roomId);
    if (room.status !== "STARTING") {
      throw new LobbyError("FORBIDDEN", `Room ${roomId} must be STARTING to enter IN_GAME.`);
    }
    return this.replaceRoom({ ...room, status: "IN_GAME" });
  }

  /** IN_GAME → FINISHED (pēc GAME_OVER). */
  markFinished(roomId: string): Room {
    const room = this.getRoom(roomId);
    if (room.status !== "IN_GAME") {
      throw new LobbyError("FORBIDDEN", `Room ${roomId} must be IN_GAME to finish.`);
    }
    return this.replaceRoom({ ...room, status: "FINISHED" });
  }

  /** Iznīcina istabu (pazūd no saraksta); atbrīvo sēdvietu displayId. */
  destroyRoom(roomId: string): Room {
    const room = this.getRoom(roomId);
    for (const seat of room.seats) {
      if (seat.playerId) this.displayIds.release(seat.playerId);
    }
    return this.replaceRoom({ ...room, status: "DESTROYED", hostPlayerId: undefined });
  }

  /**
   * TTL uzkopšana: istabas, kurām `expiresAt <= now`, tiek iznīcinātas, IZŅEMOT
   * IN_GAME (tās pabeidz partiju un tiek iznīcinātas vēlāk). Atgriež iznīcināto
   * istabu id sarakstu.
   */
  destroyExpired(now: number): readonly string[] {
    const destroyed: string[] = [];
    for (const room of this.rooms.values()) {
      if (room.status === "DESTROYED") {
        // Tombstone tīrīšana (M5): iepriekš iznīcinātās istabas izņemam no `rooms`
        // un `codes`, lai `create → leave → create` cikls šīs kartes neaudzētu
        // bezgalīgi. Notiek periodiskajā sweep (ne uzreiz pie iznīcināšanas),
        // tāpēc tikko iznīcināta istaba īslaicīgi paliek pieprasāma kā DESTROYED.
        this.rooms.delete(room.id);
        this.codes.delete(room.code);
        continue;
      }
      if (room.status === "IN_GAME") continue;
      if (now >= room.expiresAt) {
        this.destroyRoom(room.id);
        destroyed.push(room.id);
      }
    }
    return destroyed;
  }

  // ---- iekšējie palīgi ----

  private buildInitialSeats(hostPlayerId: string, hostEntry?: SeatEntry): readonly Seat[] {
    return Array.from({ length: SEAT_COUNT }, (_unused, index) =>
      index === 0 ? this.makeSeat(0, hostPlayerId, "human", hostEntry) : emptySeat(index)
    );
  }

  private makeSeat(index: number, playerId: string, kind: "human" | "bot", entry?: SeatEntry): Seat {
    return {
      index,
      kind,
      playerId,
      displayId: this.displayIds.assign(playerId),
      // Maksas ieņemšanas dati tikai cilvēka sēdvietai; boti nekad nemaksā.
      ...(kind === "human" && entry !== undefined ? { entry } : {})
    };
  }

  private withSeat(seats: readonly Seat[], index: number, seat: Seat): readonly Seat[] {
    return seats.map((current) => (current.index === index ? seat : current));
  }

  private replaceRoom(room: Room): Room {
    this.rooms.set(room.id, room);
    return room;
  }

  private assertJoinable(room: Room): void {
    if (room.status === "WAITING") return;
    if (room.status === "STARTING" || room.status === "IN_GAME") {
      throw new LobbyError("GAME_ALREADY_STARTED", `Room ${room.id} has already started.`);
    }
    throw new LobbyError("ROOM_NOT_JOINABLE", `Room ${room.id} is ${room.status}.`);
  }

  private assertHost(room: Room, requestingPlayerId: string): void {
    if (room.hostPlayerId !== requestingPlayerId) {
      throw new LobbyError("NOT_HOST", `Player ${requestingPlayerId} is not the host of room ${room.id}.`);
    }
  }

  private nextRoomId(): string {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const id = this.createRoomId();
      if (!this.rooms.has(id)) return id;
    }
    throw new Error("LobbyManager could not generate a unique room id.");
  }

  private nextRoomCode(): string {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const code = this.createRoomCode().trim().toUpperCase();
      if (code !== "" && !this.codes.has(code)) return code;
    }
    throw new Error("LobbyManager could not generate a unique room code.");
  }

  private toSummary(room: Room, options: { readonly revealCode: boolean }): RoomSummary {
    const host = room.seats.find((seat) => seat.playerId === room.hostPlayerId);
    return {
      id: room.id,
      code: options.revealCode ? room.code : "",
      visibility: room.visibility,
      isPrivate: room.visibility === "private",
      status: room.status,
      seatsFilled: room.seats.filter((seat) => seat.kind !== "empty").length,
      seatsTotal: SEAT_COUNT,
      hostDisplayId: host?.displayId,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      numberOfRounds: room.numberOfRounds,
      entryFee: room.entryFee
    };
  }

  private toView(room: Room): RoomView {
    return {
      ...this.toSummary(room, { revealCode: true }),
      pot: room.pot,
      seats: room.seats.map((seat) => ({
        index: seat.index,
        kind: seat.kind,
        displayId: seat.displayId,
        isHost: seat.playerId !== undefined && seat.playerId === room.hostPlayerId,
        isAI: seat.kind === "bot"
      }))
    };
  }
}

function emptySeat(index: number): Seat {
  return { index, kind: "empty" };
}

function isListable(status: RoomStatus): boolean {
  return status === "WAITING" || status === "IN_GAME";
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`LobbyManager requires a non-empty ${label}.`);
  }
  return trimmed;
}

function normalizeNumberOfRounds(value: number | undefined): number {
  if (value === undefined) return defaultRoomNumberOfRounds;
  if (
    !Number.isInteger(value) ||
    value < minRoomNumberOfRounds ||
    value > maxRoomNumberOfRounds
  ) {
    throw new LobbyError(
      "FORBIDDEN",
      `Room numberOfRounds must be an integer from ${minRoomNumberOfRounds} to ${maxRoomNumberOfRounds}.`
    );
  }
  return value;
}

/**
 * Validē dalības maksu (Fāze 3): vesels skaitlis, `0` (bezmaksas) vai `>= MIN_ENTRY_FEE`,
 * līdz `MAX_ENTRY_FEE` saprātīguma robežai. Faktisko bilances robežu piespiež
 * orķestrācijas slānis (atomisks debets); šī ir tikai pēdējā struktūras pārbaude.
 */
function normalizeEntryFee(value: number | undefined): number {
  if (value === undefined || value === 0) return 0;
  if (!Number.isInteger(value) || value < MIN_ENTRY_FEE || value > MAX_ENTRY_FEE) {
    throw new LobbyError(
      "FORBIDDEN",
      `Room entryFee must be 0 or an integer from ${MIN_ENTRY_FEE} to ${MAX_ENTRY_FEE}.`
    );
  }
  return value;
}

function defaultRoomId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultRoomCode(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}
