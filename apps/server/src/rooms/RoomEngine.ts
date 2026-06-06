import {
  applyCommand,
  createPlayerSnapshot,
  createPublicSnapshot,
  type MultiplayerApplyError,
  type MultiplayerCommand,
  type MultiplayerEvent,
  type MultiplayerGameState,
  type PlayerSnapshot,
  type PublicSnapshot
} from "@domino-poker/core/multiplayer";

import type { Clock, TurnTimerScheduler } from "../timers/TurnTimerScheduler.js";
import { logMpAction, logMpQueued } from "./mpActionLog.js";

/** Neliela rezerve (ms) virs deadline, lai TURN_TIMEOUT `now > deadlineAt`. */
const TURN_TIMER_GRACE_MS = 1;

/** Cik pēdējos eventus paturēt seq-atjaunošanas ring-buferī (noklusējums). */
const DEFAULT_MAX_EVENT_LOG = 512;

/** Room-līmeņa events ar monotonu `seq` numerāciju (atsevišķi no core eventSeq). */
export interface SequencedRoomEvent {
  readonly seq: number;
  readonly event: MultiplayerEvent;
}

/**
 * Seq-atjaunošanas rezultāts (`REQUEST_SNAPSHOT(lastSeq)`): vai nu inkrementāli
 * eventi kopš `lastSeq` (ja tie joprojām ir buferī), vai norāde, ka jāsūta pilns
 * snapshot (lastSeq par vecu / nederīgs).
 */
export type SnapshotRecovery =
  | { readonly mode: "incremental"; readonly events: readonly SequencedRoomEvent[] }
  | { readonly mode: "snapshot" };

export interface RoomDispatchResult {
  /** Vai komanda mainīja state (radīja jaunu state). */
  readonly accepted: boolean;
  /** Vai šis bija atkārtots `requestId` (idempotents — netika izpildīts atkārtoti). */
  readonly idempotentReplay: boolean;
  readonly events: readonly SequencedRoomEvent[];
  readonly errors: readonly MultiplayerApplyError[];
}

export interface RoomEngineOptions {
  readonly clock: Clock;
  readonly scheduler: TurnTimerScheduler;
  /** Seq ring-bufera izmērs (noklusējums 512; injicējams testiem). */
  readonly maxEventLog?: number;
  /**
   * Tiek izsaukts PĒC tam, kad pašu-ieplānotais turn timeout ir izpildīts (auto-
   * play). Ļauj augstākam slānim (RoomManager) turpināt spēles cilpu un piegādāt
   * eventus klientiem. NEtiek izsaukts novecojušam (stale) timeout.
   */
  readonly onTurnTimeout?: (events: readonly SequencedRoomEvent[]) => void;
  /**
   * Novērotājs (Fāze 10.3): tiek izsaukts SINHRONI pēc tam, kad jauni eventi ir
   * numerēti un pievienoti žurnālam — neatkarīgi no ceļa (klienta gājiens, bota
   * auto-play, turn timeout, forfeit). Tā kā `process()` ir vienīgā vieta, kur
   * eventi saņem `seq`, šis garantē, ka katrs events tiek novērots TIEŠI vienreiz
   * (persistencei). Novērotājs ir blakusefekts (fire-and-forget glabāšana augstāk);
   * tā kļūdas tiek apslāpētas, lai NEKAD nesalauztu single-writer plūsmu.
   */
  readonly onEventsAppended?: (events: readonly SequencedRoomEvent[]) => void;
}

/**
 * Tur **vienas** istabas state un ir vienīgais tās state izmaiņu ceļš
 * (single-writer). Visas komandas iet caur `dispatch`, kas tās serializē,
 * deleģē `core.applyCommand`, numerē room eventus, uztur idempotences kešu un
 * plāno/atceļ turn timeout caur injicētu (mocked) scheduler.
 */
export class RoomEngine {
  private state: MultiplayerGameState | undefined;
  private seq = 0;
  private readonly log: SequencedRoomEvent[] = [];
  private readonly seenRequests = new Map<string, RoomDispatchResult>();
  private readonly clock: Clock;
  private readonly scheduler: TurnTimerScheduler;
  private readonly maxEventLog: number;
  private readonly onTurnTimeout: ((events: readonly SequencedRoomEvent[]) => void) | undefined;
  private readonly onEventsAppended:
    | ((events: readonly SequencedRoomEvent[]) => void)
    | undefined;
  private pendingTurnId: string | undefined;

  // Single-writer rinda: pasargā no re-entrances (piem. timera izsaukts dispatch
  // jau notiekošas komandas vidū). Node ir vienpavediena, tāpēc tiešā izpilde
  // jau ir serializēta; rinda garantē, ka neviena komanda nesāk mutāciju, kamēr
  // cita vēl nav pabeigta.
  private processing = false;
  private readonly queue: MultiplayerCommand[] = [];

  constructor(options: RoomEngineOptions) {
    this.clock = options.clock;
    this.scheduler = options.scheduler;
    this.maxEventLog = options.maxEventLog ?? DEFAULT_MAX_EVENT_LOG;
    this.onTurnTimeout = options.onTurnTimeout;
    this.onEventsAppended = options.onEventsAppended;
  }

  /**
   * Atbrīvo dzinēju (kad istaba tiek iznīcināta): atceļ gaidošo turn-timeout
   * timeri, lai tas vēlāk neizšautos uz jau noņemta dzinēja (citādi avārija).
   */
  dispose(): void {
    this.pendingTurnId = undefined;
    this.scheduler.cancel();
  }

  dispatch(command: MultiplayerCommand): RoomDispatchResult {
    if (this.processing) {
      this.queue.push(command);
      // Re-entrance ir aizsardzības gadījums — ja tas notiek, tas ir aizdomīgi.
      logMpQueued(this.clock(), command);
      return {
        accepted: false,
        idempotentReplay: false,
        events: [],
        errors: [{ code: "queued", message: "Command queued behind an active dispatch." }]
      };
    }

    this.processing = true;
    try {
      const result = this.process(command);
      while (this.queue.length > 0) {
        const queued = this.queue.shift();
        if (queued) {
          this.process(queued);
        }
      }
      return result;
    } finally {
      this.processing = false;
    }
  }

  getSnapshotForPlayer(playerId: string): PlayerSnapshot {
    if (!this.state) {
      throw new Error("RoomEngine has no game state yet.");
    }
    return createPlayerSnapshot(this.state, playerId);
  }

  getPublicSnapshot(): PublicSnapshot {
    if (!this.state) {
      throw new Error("RoomEngine has no game state yet.");
    }
    return createPublicSnapshot(this.state);
  }

  /**
   * Uzticams servera-puses pilns MP state. Satur VISU spēlētāju rokas, tāpēc to
   * **nekad nesūta klientiem** — to lieto tikai servera orķestrators (GameDirector)
   * botu lēmumiem (`autoBid`/`autoMove`). State ir readonly, tāpēc lasīšana ir droša.
   */
  getGameState(): MultiplayerGameState {
    if (!this.state) {
      throw new Error("RoomEngine has no game state yet.");
    }
    return this.state;
  }

  getEventLog(): readonly SequencedRoomEvent[] {
    return this.log;
  }

  /**
   * Seq-atjaunošana: ja visi eventi pēc `lastSeq` joprojām ir ring-buferī,
   * atgriež tos inkrementāli; pretējā gadījumā (lastSeq par vecu, nederīgs vai
   * priekšā serverim) signalizē, ka jāsūta pilns snapshot.
   */
  getEventsSince(lastSeq: number): SnapshotRecovery {
    const currentSeq = this.seq;
    if (!Number.isInteger(lastSeq) || lastSeq < 0 || lastSeq > currentSeq) {
      return { mode: "snapshot" };
    }
    if (lastSeq === currentSeq) {
      return { mode: "incremental", events: [] }; // klients jau aktuāls
    }
    const oldestRetainedSeq = this.log[0]?.seq ?? currentSeq + 1;
    if (lastSeq + 1 >= oldestRetainedSeq) {
      return { mode: "incremental", events: this.log.filter((entry) => entry.seq > lastSeq) };
    }
    return { mode: "snapshot" }; // robs: daļa eventu izstumta no bufera
  }

  getSeq(): number {
    return this.seq;
  }

  hasState(): boolean {
    return this.state !== undefined;
  }

  /** Apstrādā komandu un logo rezultātu (MP atkļūdošanai; no-op, ja izslēgts). */
  private process(command: MultiplayerCommand): RoomDispatchResult {
    const result = this.processInner(command);
    // `this.state` šeit: noraidījumam = pirms-komandas state (nemainīts) → korekts
    // konteksts "kāpēc noraidīts"; pieņemšanai = jaunais state (logam pietiek ar events).
    logMpAction(this.clock(), command, result, this.state);
    return result;
  }

  private processInner(command: MultiplayerCommand): RoomDispatchResult {
    const idempotencyKey = this.idempotencyKey(command);
    if (idempotencyKey !== undefined) {
      const cached = this.seenRequests.get(idempotencyKey);
      if (cached) {
        return { ...cached, idempotentReplay: true };
      }
    }

    const result = applyCommand(this.state, this.withServerNow(command));

    if (result.invariantViolations.length > 0) {
      return {
        accepted: false,
        idempotentReplay: false,
        events: [],
        errors: result.invariantViolations.map((message) => ({
          code: "invariant_violation",
          message
        }))
      };
    }

    // Core `fail(...)` saglabā `nextState` (= esošais state), tāpēc noraidījumu
    // nedrīkst noteikt tikai pēc `nextState`. Uzticamais signāls ir `errors`:
    // `ok()` vienmēr ir tukšs, `fail()` vienmēr aizpildīts (REQUEST_SNAPSHOT ir
    // `ok` ar tukšiem events, tāpēc tas paliek pieņemts).
    if (result.errors.length > 0) {
      return {
        accepted: false,
        idempotentReplay: false,
        events: [],
        errors: result.errors
      };
    }

    if (!result.nextState) {
      return {
        accepted: false,
        idempotentReplay: false,
        events: [],
        errors: result.errors
      };
    }

    this.state = result.nextState;
    const sequenced = result.events.map((event) => ({ seq: (this.seq += 1), event }));
    this.log.push(...sequenced);
    if (this.log.length > this.maxEventLog) {
      this.log.splice(0, this.log.length - this.maxEventLog); // ring-buferis: izstumj vecākos
    }
    this.updateTurnTimer(result.events);
    this.notifyEventsAppended(sequenced);

    const dispatchResult: RoomDispatchResult = {
      accepted: true,
      idempotentReplay: false,
      events: sequenced,
      errors: []
    };
    if (idempotencyKey !== undefined) {
      this.seenRequests.set(idempotencyKey, dispatchResult);
    }
    return dispatchResult;
  }

  /** Serveris ir laika autoritāte: pārraksta laika-jutīgo komandu `now`. */
  private withServerNow(command: MultiplayerCommand): MultiplayerCommand {
    switch (command.type) {
      case "START_TURN":
      case "SUBMIT_BID":
      case "SUBMIT_MOVE":
      case "TURN_TIMEOUT":
        return { ...command, now: this.clock() };
      default:
        return command;
    }
  }

  /** Idempotence pēc `requestId` tikai spēlētāju komandām (ne servera iekšējām). */
  private idempotencyKey(command: MultiplayerCommand): string | undefined {
    if ("playerId" in command && typeof command.playerId === "string") {
      return `${command.playerId}:${command.requestId}`;
    }
    return undefined;
  }

  /**
   * Paziņo persistences novērotājam par jaunajiem eventiem. Blakusefekts: kļūdas
   * tiek apslāpētas, lai glabāšanas problēma NEKAD nesalauztu spēles plūsmu
   * (serveris paliek autoritatīvs neatkarīgi no DB pieejamības).
   */
  private notifyEventsAppended(events: readonly SequencedRoomEvent[]): void {
    if (!this.onEventsAppended || events.length === 0) return;
    try {
      this.onEventsAppended(events);
    } catch {
      // Persistence ir best-effort; novērotāja kļūda nedrīkst ietekmēt dispatch.
    }
  }

  private updateTurnTimer(events: readonly MultiplayerEvent[]): void {
    const started = events.find(
      (event): event is Extract<MultiplayerEvent, { type: "TURN_STARTED" }> =>
        event.type === "TURN_STARTED"
    );
    if (started) {
      const { turnId, deadlineAt } = started.turn;
      this.pendingTurnId = turnId;
      this.scheduler.schedule(deadlineAt + TURN_TIMER_GRACE_MS, () =>
        this.fireTurnTimeout(turnId)
      );
      return;
    }

    // Jebkura cita eventu kopa, kas beidz turnu (bid/move/timeout/fallback),
    // atstāj `currentTurn` tukšu → atceļam gaidošo timeri.
    if (this.state?.currentTurn === undefined) {
      this.pendingTurnId = undefined;
      this.scheduler.cancel();
    }
  }

  private fireTurnTimeout(turnId: string): void {
    // Stale timeout: turns jau beidzies vai nomainīts → ignorējam.
    if (this.pendingTurnId !== turnId) return;
    const gameId = this.state?.gameId;
    if (gameId === undefined) return;

    const result = this.dispatch({
      type: "TURN_TIMEOUT",
      gameId,
      requestId: `engine-timeout:${turnId}`,
      turnId,
      now: this.clock()
    });
    // Paziņojam augstākam slānim, lai tas turpina cilpu + piegādā eventus.
    if (result.accepted) {
      this.onTurnTimeout?.(result.events);
    }
  }
}
