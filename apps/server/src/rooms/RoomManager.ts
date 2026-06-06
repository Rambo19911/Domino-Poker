import type {
  MultiplayerCommand,
  PlayerSnapshot
} from "@domino-poker/core/multiplayer";

import { DisplayIdRegistry } from "../identity/DisplayIdRegistry.js";
import type { MatchSeatRecord, MatchStartedRecord } from "../storage/StoragePort.js";
import {
  noopTurnTimerScheduler,
  type Clock,
  type TurnTimerScheduler
} from "../timers/TurnTimerScheduler.js";
import {
  LobbyManager,
  type Room,
  type RoomSummary,
  type RoomView,
  type RoomVisibility
} from "./LobbyManager.js";
import { GameDirector } from "./GameDirector.js";
import { LobbyError } from "./lobbyErrors.js";
import {
  RoomEngine,
  type RoomDispatchResult,
  type SequencedRoomEvent,
  type SnapshotRecovery
} from "./RoomEngine.js";

/** Sēdošs cilvēks: viņa savienojuma `clientId` + core spēlētāja id. */
export interface SeatedHuman {
  readonly clientId: string;
  readonly corePlayerId: string;
}

/** Core spēlētāja id sēdeklim: indekss 0..3 → "1".."4" (sakrīt ar createNewGame). */
export function corePlayerIdForSeat(seatIndex: number): string {
  return String(seatIndex + 1);
}

export interface RoomManagerOptions {
  readonly clock: Clock;
  readonly displayIds?: DisplayIdRegistry;
  readonly ttlMs?: number;
  readonly createRoomId?: () => string;
  readonly createRoomCode?: () => string;
  /** Katrai istabai izveido savu turn timeri (noklusējums: no-op). */
  readonly createTurnScheduler?: () => TurnTimerScheduler;
  /** Spēles sēkla katrai partijai (noklusējums: crypto.randomUUID). */
  readonly createSeed?: () => string;
  /**
   * Pirms-spēles atskaite (ms) starp `START_GAME` un pirmo solījumu turnu, lai
   * lēnāki klienti paspēj ielādēt galdu. Noklusējums 0 = sākt uzreiz (testi).
   * Produkcijā (`index.ts`) iestata 10000.
   */
  readonly preGameDelayMs?: number;
  /**
   * Servera-pacētas izspēles aiztures (ms). `botPaceMs > 0` ieslēdz botu gājienu
   * izspēli PA VIENAM (cilvēka 10s deadline sākas tikai tad, kad boti nospēlējuši).
   * Noklusējums 0 = sinhroni (testi). Produkcijā ~800. `trickPauseMs` — pauze pēc
   * pabeigta trika (≥ klienta triku-aizturei). Abiem vajag injicētu turn-scheduler.
   */
  readonly botPaceMs?: number;
  readonly trickPauseMs?: number;
  /**
   * Grace periods (ms), pēc kura IN_GAME istaba tiek iznīcināta, ja VISI cilvēki
   * ir atvienojušies un neviens neatgriežas (9.3-b). Grace ļauj refresh atgriezties
   * pirms iznīcināšanas. Noklusējums 0 = atspējots (testi); produkcijā ~30000.
   */
  readonly abandonGraceMs?: number;
  /**
   * Turna ilgums (ms), ko padod `CREATE_GAME` (Fāze 12.1, no `TURN_DURATION_MS`).
   * Ja izlaists, core lieto savu noklusējumu (10000). Neietekmē maisīšanu/izdali.
   */
  readonly turnDurationMs?: number;
  /**
   * Persistences novērotāji (Fāze 10.3, blakusefekti). `onMatchStarted` — partija
   * sākta (metadata + seed). `onMatchEvents` — jauni room eventi (no dzinēja
   * vienīgā numerācijas punkta; tver VISUS ceļus). Abi ir fire-and-forget augstāk;
   * RoomManager paliek DB-agnostisks (saņem tikai serializējamus DTO/eventus).
   */
  readonly onMatchStarted?: (record: MatchStartedRecord) => void;
  readonly onMatchEvents?: (events: readonly SequencedRoomEvent[]) => void;
}

/**
 * Maršrutē komandas uz pareizo `RoomEngine` un uztur dalības (clientId → istaba),
 * savienojot `LobbyManager` (istabu metadati/sēdvietas) ar per-istabas spēles
 * dzinēju (5.3). Katra istaba ir izolēta: viena istaba nevar mainīt citas state.
 *
 * `clientId` ir savienojuma identitāte (viena istaba vienlaikus); Fāzē 5 tas
 * vienlaikus kalpo kā sēdekļa `playerId`. `clientId`→core spēlētāja kartēšana
 * notiek pēc sēdekļa indeksa (`corePlayerIdForSeat`).
 */
export class RoomManager {
  private readonly lobby: LobbyManager;
  private readonly engines = new Map<string, RoomEngine>();
  private readonly directors = new Map<string, GameDirector>();
  private readonly clientRoom = new Map<string, string>();
  /** Piegādā servera-iniciētus (turn timeout) atjauninājumus; pieslēdz net slānis. */
  private gameUpdateSink: ((roomId: string, events: readonly SequencedRoomEvent[]) => void) | undefined;
  /**
   * Paziņo, kad `clientId` zaudē istabas dalību (pamet / forfeit / istabu iznīcina).
   * Net slānis to izmanto, lai atbrīvotu offline spēlētāja durable sesiju (M3).
   */
  private memberDepartedHandler: ((clientId: string) => void) | undefined;
  private readonly clock: Clock;
  private readonly createTurnScheduler: () => TurnTimerScheduler;
  private readonly createSeed: () => string;
  private readonly preGameDelayMs: number;
  private readonly botPaceMs: number;
  private readonly trickPauseMs: number;
  private readonly abandonGraceMs: number;
  private readonly turnDurationMs: number | undefined;
  private readonly onMatchStarted: ((record: MatchStartedRecord) => void) | undefined;
  private readonly onMatchEvents:
    | ((events: readonly SequencedRoomEvent[]) => void)
    | undefined;
  /** Per-istabas vienreizējais pirms-spēles timeris (atver pirmo turnu pēc grace). */
  private readonly preGameTimers = new Map<string, TurnTimerScheduler>();
  /** Per-istabas pacēšanas timeris (izspēlē botus pa vienam ar aizturi). */
  private readonly pacingTimers = new Map<string, TurnTimerScheduler>();
  /** Per-istabas pamešanas grace timeris (visi cilvēki atvienojušies → iznīcina). */
  private readonly abandonTimers = new Map<string, TurnTimerScheduler>();

  constructor(options: RoomManagerOptions) {
    this.clock = options.clock;
    this.createTurnScheduler = options.createTurnScheduler ?? (() => noopTurnTimerScheduler);
    this.createSeed = options.createSeed ?? defaultSeed;
    this.preGameDelayMs = Math.max(0, options.preGameDelayMs ?? 0);
    this.botPaceMs = Math.max(0, options.botPaceMs ?? 0);
    this.trickPauseMs = Math.max(0, options.trickPauseMs ?? 0);
    this.abandonGraceMs = Math.max(0, options.abandonGraceMs ?? 0);
    this.turnDurationMs = options.turnDurationMs;
    this.onMatchStarted = options.onMatchStarted;
    this.onMatchEvents = options.onMatchEvents;
    this.lobby = new LobbyManager({
      clock: options.clock,
      ...(options.displayIds ? { displayIds: options.displayIds } : {}),
      ...(options.ttlMs !== undefined ? { ttlMs: options.ttlMs } : {}),
      ...(options.createRoomId ? { createRoomId: options.createRoomId } : {}),
      ...(options.createRoomCode ? { createRoomCode: options.createRoomCode } : {})
    });
  }

  /** Izveido istabu; izveidotājs kļūst par host. Klients drīkst būt tikai 1 istabā. */
  createRoom(
    clientId: string,
    options: { readonly visibility?: RoomVisibility; readonly numberOfRounds?: number } = {}
  ): Room {
    this.assertNotInRoom(clientId);
    const room = this.lobby.createRoom({
      hostPlayerId: clientId,
      ...(options.visibility ? { visibility: options.visibility } : {}),
      ...(options.numberOfRounds !== undefined ? { numberOfRounds: options.numberOfRounds } : {})
    });
    this.clientRoom.set(clientId, room.id);
    return room;
  }

  /** Atver istabas skatu bez sēdvietas ieņemšanas. */
  viewRoom(target: { readonly roomId: string } | { readonly code: string }): Room {
    return "code" in target ? this.findByCode(target.code) : this.openRoomById(target.roomId);
  }

  /** Pievienojas istabai pēc id (tikai publiska) vai pēc koda (publiska/privāta). */
  joinRoom(
    clientId: string,
    target: { readonly roomId: string; readonly seatIndex: number } | { readonly code: string; readonly seatIndex: number }
  ): Room {
    this.assertNotInRoom(clientId);

    const room = "code" in target ? this.findByCode(target.code) : this.openRoomById(target.roomId);
    const updated = this.lobby.assignSeat(room.id, clientId, target.seatIndex);
    this.clientRoom.set(clientId, room.id);
    return updated;
  }

  /** Pamet istabu (WAITING). Notīra dalību; ja istaba kļuva DESTROYED, noņem dzinēju. */
  leaveRoom(clientId: string): Room {
    const roomId = this.requireRoomOf(clientId);
    const room = this.lobby.leaveRoom(roomId, clientId);
    this.departMember(clientId);
    if (room.status === "DESTROYED") {
      this.disposeRoom(roomId);
    }
    return room;
  }

  /**
   * Spēlētājs apzināti pamet spēli (IN_GAME) caur "Exit". Viņa core sēdvieta kļūst
   * par botu (`PLAYER_FORFEIT` → auto-spēlē uzreiz), lobby sēdvieta arī (vai istabu
   * iznīcina, ja nepaliek cilvēku), un dalība tiek notīrīta — spēlētājs vairs
   * nevar atgriezties. Atgriež atjaunoto istabu, forfeit eventus un `destroyed`.
   */
  forfeitInGame(clientId: string): {
    readonly room: Room;
    readonly events: readonly SequencedRoomEvent[];
    readonly destroyed: boolean;
  } {
    const roomId = this.requireRoomOf(clientId);
    const room = this.lobby.getRoom(roomId);
    if (room.status !== "IN_GAME") {
      throw new LobbyError("FORBIDDEN", `forfeitInGame is only valid while the room is IN_GAME.`);
    }
    const seat = room.seats.find((candidate) => candidate.playerId === clientId);
    if (!seat) {
      throw new LobbyError("PLAYER_NOT_IN_ROOM", `Player ${clientId} has no seat in room ${roomId}.`);
    }

    // 1. Core: sēdvietas statuss → bot (auto-spēlē). PIRMS lobby/destroy izmaiņas.
    let events: readonly SequencedRoomEvent[] = [];
    const engine = this.engines.get(roomId);
    if (engine) {
      const result = engine.dispatch({
        type: "PLAYER_FORFEIT",
        gameId: roomId,
        requestId: `forfeit:${clientId}`,
        playerId: corePlayerIdForSeat(seat.index)
      });
      if (result.accepted) {
        events = result.events;
      }
    }

    // 2. Lobby: sēdvieta → bots, vai iznīcina, ja nepaliek cilvēku.
    const updated = this.lobby.forfeitSeat(roomId, clientId);
    // 3. Notīra dalību (spēlētājs vairs nav istabā → nevar atgriezties).
    this.departMember(clientId);
    // 4. Ja iznīcināta → noņem dzinēju + timerus.
    const destroyed = updated.status === "DESTROYED";
    if (destroyed) {
      this.disposeRoom(roomId);
    }
    return { room: updated, events, destroyed };
  }

  /**
   * Periodiska istabu TTL izslaukšana (pieslēgta net slānī ar `setInterval`):
   * iznīcina istabas, kurām beidzies laiks (WAITING/STARTING/FINISHED; IN_GAME
   * paliek līdz partijas beigām), atbrīvo to dzinējus/timerus un notīra sēdošo
   * cilvēku dalību (citādi host paliktu "iesprūdis" jau iznīcinātā istabā). Atgriež
   * iznīcināto istabu id (≥1 → net slānis pārraida jauno LOBBY_STATE).
   */
  destroyExpiredRooms(now: number): readonly string[] {
    const destroyed = this.lobby.destroyExpired(now);
    if (destroyed.length === 0) return destroyed;
    const destroyedSet = new Set(destroyed);
    for (const [clientId, roomId] of this.clientRoom) {
      if (destroyedSet.has(roomId)) this.departMember(clientId);
    }
    for (const roomId of destroyed) this.disposeRoom(roomId);
    return destroyed;
  }

  /** Noņem istabas dzinēju, direktoru un visus timerus (pēc iznīcināšanas). */
  private disposeRoom(roomId: string): void {
    this.engines.get(roomId)?.dispose(); // atceļ gaidošo turn-timeout timeri
    this.engines.delete(roomId);
    this.directors.delete(roomId);
    this.preGameTimers.get(roomId)?.cancel();
    this.preGameTimers.delete(roomId);
    this.clearPacing(roomId);
    this.cancelAbandonGrace(roomId);
  }

  /**
   * Ieplāno IN_GAME istabas iznīcināšanu pēc grace perioda (9.3-b), kad VISI
   * cilvēki ir atvienojušies. `run` izsauc pēc grace (maršrutētājs tad pārbauda,
   * vai neviens nav atgriezies, un iznīcina). No-op, ja grace atspējots (0) vai
   * jau ieplānots šai istabai.
   */
  scheduleAbandonGrace(roomId: string, run: () => void): void {
    if (this.abandonGraceMs <= 0) return;
    if (this.abandonTimers.has(roomId)) return; // jau gaida
    const timer = this.createTurnScheduler();
    this.abandonTimers.set(roomId, timer);
    timer.schedule(this.clock() + this.abandonGraceMs, () => {
      this.abandonTimers.delete(roomId);
      run();
    });
  }

  /** Atceļ pamešanas grace (piem. cilvēks atgriezās). */
  cancelAbandonGrace(roomId: string): void {
    this.abandonTimers.get(roomId)?.cancel();
    this.abandonTimers.delete(roomId);
  }

  /** Iznīcina istabu (lobby + dzinējs + timeri + dalība). Lieto pamestai istabai. */
  destroyRoom(roomId: string): void {
    for (const human of this.lobby.getRoom(roomId).seats) {
      if (human.playerId) this.departMember(human.playerId);
    }
    this.lobby.destroyRoom(roomId);
    this.disposeRoom(roomId);
  }

  findRoom(roomId: string): Room {
    return this.lobby.getRoom(roomId);
  }

  listRooms(): readonly RoomSummary[] {
    return this.lobby.listRooms();
  }

  getRoomView(roomId: string): RoomView {
    return this.lobby.getRoomView(roomId);
  }

  roomOf(clientId: string): string | undefined {
    return this.clientRoom.get(clientId);
  }

  /** Host aizpilda tukšās sēdvietas ar botiem (deleģē LobbyManager host pārbaudi). */
  fillSeatsWithBots(clientId: string): Room {
    const roomId = this.requireRoomOf(clientId);
    return this.lobby.fillSeatsWithBots(roomId, clientId);
  }

  /**
   * Host sāk spēli: izveido šīs istabas RoomEngine + GameDirector un pāriet uz
   * IN_GAME. Spēles cilpu (līdz 1. cilvēka turnam) palaiž atsevišķi ar
   * `advanceGame`, ko maršrutētājs izsauc gan pēc starta, gan pēc katra SUBMIT.
   */
  startGame(clientId: string): { readonly room: Room; readonly startsAt: number } {
    const roomId = this.requireRoomOf(clientId);
    const startingRoom = this.lobby.startGame(roomId, clientId); // host + min-to-start → STARTING

    // Lobby cilvēku/botu sastāvs → dzinēja spēlētāji. Sēdvietas indekss i atbilst
    // core spēlētājam String(i+1) (sk. corePlayerIdForSeat / createNewGame).
    const humanSeatIndices = startingRoom.seats
      .filter((seat) => seat.kind === "human")
      .map((seat) => seat.index);

    const engine = new RoomEngine({
      clock: this.clock,
      scheduler: this.createTurnScheduler(),
      onTurnTimeout: (events) => this.handleTurnTimeout(roomId, events),
      // Persistence (10.3): visi room eventi no dzinēja vienīgā numerācijas punkta.
      onEventsAppended: (events) => this.onMatchEvents?.(events)
    });
    // Satveram seed mainīgajā, lai to gan padotu dzinējam (determinisms), gan
    // saglabātu match metadata (atkārtotai izspēlei). Maisīšanas loģika nemainās.
    const seed = this.createSeed();
    const created = engine.dispatch({
      type: "CREATE_GAME",
      gameId: roomId,
      requestId: `create:${roomId}`,
      seed,
      humanSeatIndices,
      numberOfRounds: startingRoom.numberOfRounds,
      ...(this.turnDurationMs !== undefined ? { turnDurationMs: this.turnDurationMs } : {})
    });
    if (!created.accepted) {
      throw new LobbyError("FORBIDDEN", `Failed to create game for room ${roomId}.`);
    }
    this.engines.set(roomId, engine);
    this.directors.set(roomId, new GameDirector({ engine, gameId: roomId }));
    const room = this.lobby.markInGame(roomId);
    this.emitMatchStarted(roomId, seed, startingRoom);

    // Pirms-spēles grace: pirmo turnu atver tikai pēc `startsAt`. Ja delay=0,
    // sākam uzreiz (maršrutētājs to izdara inline; nekas netiek ieplānots).
    const startsAt = this.clock() + this.preGameDelayMs;
    if (this.preGameDelayMs > 0) {
      const timer = this.createTurnScheduler();
      this.preGameTimers.set(roomId, timer);
      timer.schedule(startsAt, () => this.firePreGameStart(roomId));
    }
    return { room, startsAt };
  }

  /**
   * Pirms-spēles timera izpilde: atver pirmo turnu (dzen cilpu līdz 1. cilvēkam)
   * un piegādā eventus. Idempotents pret istabu, kas starplaikā iznīcināta.
   */
  private firePreGameStart(roomId: string): void {
    this.preGameTimers.delete(roomId);
    // Sargs pret istabu, kas starplaikā iznīcināta: `advanceGame` prasa DIREKTORU
    // (ne tikai engine), tāpēc pārbaudām `directors` (saskan ar `handleTurnTimeout`).
    // Citādi novēlots timeris mestu neapstrādātu `ROOM_NOT_FOUND` setTimeout callback iekšā.
    if (!this.directors.has(roomId)) return;
    const events = this.advanceGame(roomId);
    // Pacētā režīmā `advanceGame` atgriež [] un piegādā soļus caur sink pati;
    // sinhronā režīmā piegādājam savāktos eventus.
    if (events.length > 0) {
      this.gameUpdateSink?.(roomId, events);
    }
  }

  /**
   * Pieslēdz piegādes sink servera-iniciētiem atjauninājumiem (turn timeout).
   * Net slānis to iestata ar `publishGameUpdate(gateway, ...)`.
   */
  setGameUpdateSink(sink: (roomId: string, events: readonly SequencedRoomEvent[]) => void): void {
    this.gameUpdateSink = sink;
  }

  /**
   * Pieslēdz dalības-zaudēšanas novērotāju (M3). Izsaukts katru reizi, kad
   * `clientId` tiek izņemts no dalības (pamet / forfeit / istabu iznīcina), lai
   * net slānis varētu atbrīvot offline spēlētāja durable sesiju.
   */
  setMemberDepartedHandler(handler: (clientId: string) => void): void {
    this.memberDepartedHandler = handler;
  }

  /** Izņem dalību un (ja tā tiešām pastāvēja) paziņo dalības-zaudēšanas novērotājam. */
  private departMember(clientId: string): void {
    if (this.clientRoom.delete(clientId)) {
      this.memberDepartedHandler?.(clientId);
    }
  }

  /**
   * Sastāda un izsūta partijas sākuma ierakstu persistencei (10.3). Sēdvietu
   * sastāvs (cilvēks/bots + displayId) tiek momentuzņemts partijas sākumā. Tukšas
   * sēdvietas neiekļaujam (startGame jau prasa pilnu galdu). Blakusefekts.
   */
  private emitMatchStarted(roomId: string, seed: string, room: Room): void {
    if (!this.onMatchStarted) return;
    const players: MatchSeatRecord[] = room.seats
      .filter((seat) => seat.kind !== "empty")
      .map((seat) => ({
        seatIndex: seat.index,
        corePlayerId: corePlayerIdForSeat(seat.index),
        kind: seat.kind === "bot" ? "bot" : "human",
        // Cilvēka `seat.playerId` ir stabilais clientId (reconnect identitāte) — to
        // lieto statistikas atslēgai (F5). Botiem to neiekļaujam.
        ...(seat.kind !== "bot" && seat.playerId !== undefined ? { clientId: seat.playerId } : {}),
        ...(seat.displayId !== undefined ? { displayId: seat.displayId } : {})
      }));
    this.onMatchStarted({
      matchId: roomId,
      seed,
      numberOfRounds: room.numberOfRounds,
      players,
      startedAt: this.clock()
    });
  }

  /**
   * Turn timeout āķis (no `RoomEngine.onTurnTimeout`): auto-play jau noticis core
   * pusē; te turpinām cilpu un piegādājam timeout + advance eventus klientiem.
   */
  private handleTurnTimeout(roomId: string, timeoutEvents: readonly SequencedRoomEvent[]): void {
    // Aizsardzība: ja istaba starplaikā iznīcināta (piem. pēdējais cilvēks pameta),
    // novēlots turn-timeout nedrīkst avarēt serveri.
    if (!this.directors.has(roomId)) return;
    const advanceEvents = this.advanceGame(roomId);
    if (timeoutEvents.length > 0 || advanceEvents.length > 0) {
      this.gameUpdateSink?.(roomId, [...timeoutEvents, ...advanceEvents]);
    }
  }

  /**
   * Dzen istabas spēles cilpu uz priekšu. Ja `botPaceMs === 0` (testi/noklusējums)
   * — sinhroni līdz nākamajam cilvēka turnam un atgriež visus eventus. Ja
   * `botPaceMs > 0` (produkcija) — izspēlē botus PA VIENAM ar aizturi caur sink,
   * tā ka cilvēka turns (un 10s deadline) sākas tikai tad, kad boti nospēlējuši;
   * šajā gadījumā atgriež `[]` (botu eventi atnāk vēlāk caur sink).
   */
  advanceGame(roomId: string): readonly SequencedRoomEvent[] {
    const director = this.directors.get(roomId);
    if (!director) {
      throw new LobbyError("ROOM_NOT_FOUND", `Room ${roomId} has no active game.`);
    }
    if (this.botPaceMs <= 0) {
      return director.advance().events;
    }
    this.beginPacedAdvance(roomId);
    return [];
  }

  /**
   * Servera-pacēta izspēle: izpilda dzinēja soļus pa vienam ar aizturi (bots
   * domā → liek; pēc pabeigta trika — garāka pauze) un piegādā katru soli caur
   * sink, līdz sasniegts cilvēka turns vai gameEnd. Pirmo soli ieplāno ar aizturi,
   * lai cilvēka gājiens paspēj parādīties pirms pirmā bota.
   */
  private beginPacedAdvance(roomId: string): void {
    this.pacingTimers.get(roomId)?.cancel();
    const timer = this.pacingTimers.get(roomId) ?? this.createTurnScheduler();
    this.pacingTimers.set(roomId, timer);

    const runStep = (): void => {
      const director = this.directors.get(roomId);
      if (!director) {
        this.clearPacing(roomId);
        return;
      }
      const result = director.step();
      if (result.events.length > 0) {
        this.gameUpdateSink?.(roomId, result.events);
      }
      // Piegāde (sink) pēc GAME_OVER var iznīcināt istabu — tad cilpa apstājas un
      // timeri netiek atkārtoti ieplānoti (citādi rastos orfana timeris).
      if (!this.directors.has(roomId)) {
        this.clearPacing(roomId);
        return;
      }
      if (result.status === "awaiting-human" || result.status === "game-over") {
        this.clearPacing(roomId);
        return;
      }
      timer.schedule(this.clock() + this.pacingDelayFor(result), runStep);
    };

    timer.schedule(this.clock() + this.botPaceMs, runStep);
  }

  /** Aizture pirms NĀKAMĀ soļa pēc dotā soļa veida. */
  private pacingDelayFor(result: { readonly status: string; readonly trickComplete: boolean }): number {
    if (result.trickComplete) return this.trickPauseMs;
    if (result.status === "bot-turn-started") return Math.max(0, Math.round(this.botPaceMs * 0.4));
    return this.botPaceMs;
  }

  private clearPacing(roomId: string): void {
    this.pacingTimers.get(roomId)?.cancel();
    this.pacingTimers.delete(roomId);
  }

  /** Pašreizējais istabas dzinēja room-eventu seq (STATE_SNAPSHOT korelācijai). */
  getSeq(roomId: string): number {
    return this.requireEngine(roomId).getSeq();
  }

  /**
   * Seq-atjaunošana `REQUEST_SNAPSHOT(lastSeq)` vajadzībām. `lastSeq === undefined`
   * → vienmēr pilns snapshot; citādi deleģē dzinēja ring-buferim.
   */
  getEventsSince(roomId: string, lastSeq?: number): SnapshotRecovery {
    const engine = this.requireEngine(roomId);
    return lastSeq === undefined ? { mode: "snapshot" } : engine.getEventsSince(lastSeq);
  }

  /** Core spēlētāja id dotajam savienojuma `clientId` šajā istabā (met, ja nav sēdvietas). */
  corePlayerIdForClient(roomId: string, clientId: string): string {
    const seat = this.lobby.getRoom(roomId).seats.find((candidate) => candidate.playerId === clientId);
    if (!seat) {
      throw new LobbyError("PLAYER_NOT_IN_ROOM", `Player ${clientId} has no seat in room ${roomId}.`);
    }
    return corePlayerIdForSeat(seat.index);
  }

  /** Šīs istabas sēdošie cilvēki (clientId + core spēlētāja id) — boti izlaisti. */
  getSeatedHumans(roomId: string): readonly SeatedHuman[] {
    const room = this.lobby.getRoom(roomId);
    const humans: SeatedHuman[] = [];
    for (const seat of room.seats) {
      if (seat.kind === "human" && seat.playerId !== undefined) {
        humans.push({ clientId: seat.playerId, corePlayerId: corePlayerIdForSeat(seat.index) });
      }
    }
    return humans;
  }

  /**
   * Maršrutē komandu uz konkrētās istabas dzinēju. Komanda nevar ietekmēt citu
   * istabu: `command.gameId` jāsakrīt ar `roomId`.
   */
  routeMessageToRoomEngine(roomId: string, command: MultiplayerCommand): RoomDispatchResult {
    const engine = this.engines.get(roomId);
    if (!engine) {
      throw new LobbyError("ROOM_NOT_FOUND", `Room ${roomId} has no active game.`);
    }
    if (command.gameId !== roomId) {
      throw new LobbyError(
        "FORBIDDEN",
        `Command for game ${command.gameId} cannot be routed to room ${roomId}.`
      );
    }
    return engine.dispatch(command);
  }

  /** Reconnect: personalizēts snapshot tikai istabas dalībniekam. */
  getSnapshotForClient(roomId: string, clientId: string): PlayerSnapshot {
    const engine = this.engines.get(roomId);
    if (!engine) {
      throw new LobbyError("ROOM_NOT_FOUND", `Room ${roomId} has no active game.`);
    }
    if (this.clientRoom.get(clientId) !== roomId) {
      throw new LobbyError("FORBIDDEN", `Player ${clientId} is not a member of room ${roomId}.`);
    }
    const seat = this.lobby
      .getRoom(roomId)
      .seats.find((candidate) => candidate.playerId === clientId);
    if (!seat) {
      throw new LobbyError("PLAYER_NOT_IN_ROOM", `Player ${clientId} has no seat in room ${roomId}.`);
    }
    return engine.getSnapshotForPlayer(corePlayerIdForSeat(seat.index));
  }

  /**
   * Pēc partijas beigām (GAME_OVER): IN_GAME → FINISHED → DESTROYED. Atbrīvo
   * dzinēju (atceļ gaidošo turn-timeout timeri caur `disposeRoom`), visus
   * per-istabas timerus un sēdošo dalības, lai pabeigta partija neatstāj atmiņas
   * noplūdi un spēlētāji atkal drīkst izveidot/pievienoties istabai. Idempotents:
   * atkārtots izsaukums (jau DESTROYED) neko nedara.
   */
  destroyFinishedRoom(roomId: string): void {
    const room = this.lobby.getRoom(roomId);
    if (room.status === "DESTROYED") return;
    if (room.status === "IN_GAME") {
      this.lobby.markFinished(roomId);
    }
    for (const [clientId, rid] of this.clientRoom) {
      if (rid === roomId) {
        this.departMember(clientId);
      }
    }
    this.lobby.destroyRoom(roomId);
    this.disposeRoom(roomId);
  }

  // ---- iekšējie palīgi ----

  private assertNotInRoom(clientId: string): void {
    if (this.clientRoom.has(clientId)) {
      throw new LobbyError(
        "ALREADY_IN_ROOM",
        `Player ${clientId} is already in room ${this.clientRoom.get(clientId)}.`
      );
    }
  }

  private requireRoomOf(clientId: string): string {
    const roomId = this.clientRoom.get(clientId);
    if (roomId === undefined) {
      throw new LobbyError("PLAYER_NOT_IN_ROOM", `Player ${clientId} is not in any room.`);
    }
    return roomId;
  }

  private requireEngine(roomId: string): RoomEngine {
    const engine = this.engines.get(roomId);
    if (!engine) {
      throw new LobbyError("ROOM_NOT_FOUND", `Room ${roomId} has no active game.`);
    }
    return engine;
  }

  private openRoomById(roomId: string): Room {
    const room = this.lobby.getRoom(roomId);
    if (room.visibility === "private") {
      throw new LobbyError("FORBIDDEN", `Private room ${roomId} can only be joined with its code.`);
    }
    return room;
  }

  private findByCode(code: string): Room {
    const room = this.lobby.findRoomByCode(code);
    if (!room) {
      throw new LobbyError("ROOM_NOT_FOUND", `No joinable room with code ${code}.`);
    }
    return room;
  }
}

function defaultSeed(): string {
  return globalThis.crypto.randomUUID();
}
