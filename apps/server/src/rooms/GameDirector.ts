import {
  autoBid,
  autoMove,
  type MultiplayerCommand
} from "@domino-poker/core/multiplayer";

import type { RoomEngine, SequencedRoomEvent } from "./RoomEngine.js";

/** Drošības robeža pret bezgalīgu cilpu (kā simulatorā). */
const MAX_LOOP_STEPS = 10_000;

export interface GameDirectorOptions {
  readonly engine: RoomEngine;
  readonly gameId: string;
  /** turnId ģenerators (noklusējums monotons `turn-1`, `turn-2`, ...). */
  readonly createTurnId?: () => string;
  /** requestId ģenerators (noklusējums unikāls `dir-<n>:<label>`). */
  readonly createRequestId?: (label: string) => string;
}

export interface AdvanceResult {
  /** Visi room-eventi, kas radās šajā advance() izsaukumā (secībā). */
  readonly events: readonly SequencedRoomEvent[];
  /** `true` ja apstājāmies, gaidot cilvēka gājienu; `false` ja sasniedzām gameEnd. */
  readonly awaitingHuman: boolean;
}

/** Viena `step()` rezultāts — pamats servera-pacētai (pa vienam) izspēlei. */
export interface StepResult {
  readonly events: readonly SequencedRoomEvent[];
  readonly status:
    | "bot-turn-started" // bota turns atvērts (rāda izgaismojumu, tad domā)
    | "bot-acted" // bots nolika/nosolīja (rāda kauliņu/solījumu)
    | "round-advanced" // pārgāja uz nākamo raundu
    | "awaiting-human" // cilvēka turns atvērts — apstājamies, 10s sākas TAGAD
    | "game-over"; // spēle beigusies
  /** Vai šis solis pabeidza triku (klients rāda pabeigto triku ar pauzi). */
  readonly trickComplete: boolean;
}

/**
 * Dzen vienas istabas spēles cilpu virs `RoomEngine` (single-writer). Atkārto:
 *
 *   roundEnd → START_NEXT_ROUND;  nav aktīva turna → START_TURN;
 *   aktīvs botu turns → deterministisks auto-bid/auto-move;
 *   aktīvs cilvēka turns → apstāties (gaidām klienta SUBMIT);  gameEnd → beigt.
 *
 * Zelta noteikums: direktors **nesatur** spēles noteikumus — botu izvēli deleģē
 * core `autoBid`/`autoMove`, bet visas state izmaiņas iet caur `RoomEngine.dispatch`.
 * Serveris ir laika autoritāte, tāpēc komandām padod `now: 0` — dzinējs pārraksta
 * to ar savu `clock()`.
 */
export class GameDirector {
  private readonly engine: RoomEngine;
  private readonly gameId: string;
  private readonly createTurnId: () => string;
  private readonly createRequestId: (label: string) => string;
  private turnCounter = 0;
  private requestCounter = 0;

  constructor(options: GameDirectorOptions) {
    this.engine = options.engine;
    this.gameId = options.gameId;
    this.createTurnId = options.createTurnId ?? (() => `turn-${(this.turnCounter += 1)}`);
    this.createRequestId =
      options.createRequestId ?? ((label) => `dir-${(this.requestCounter += 1)}:${label}`);
  }

  /**
   * Virza spēli uz priekšu, līdz tā gaida cilvēka gājienu vai beidzas. Drīkst
   * izsaukt pēc spēles izveides un pēc katra cilvēka SUBMIT — tas ir idempotents,
   * ja jau gaida cilvēku (nekas netiek dispečēts).
   */
  advance(): AdvanceResult {
    const collected: SequencedRoomEvent[] = [];

    for (let step = 0; step < MAX_LOOP_STEPS; step += 1) {
      const result = this.step();
      collected.push(...result.events);
      if (result.status === "awaiting-human") {
        return { events: collected, awaitingHuman: true };
      }
      if (result.status === "game-over") {
        return { events: collected, awaitingHuman: false };
      }
    }

    throw new Error(
      `GameDirector.advance exceeded ${MAX_LOOP_STEPS} steps for game ${this.gameId}.`
    );
  }

  /**
   * Izpilda VIENU spēles cilpas soli (pamats servera-pacētai izspēlei). Servera
   * laika autoritāte: komandām padod `now: 0`, dzinējs to pārraksta ar `clock()`.
   * Svarīgi: cilvēka turna `START_TURN` (un līdz ar to 10s deadline) notiek tikai
   * tad, kad cilpa līdz viņam nonāk — t.i. PĒC tam, kad boti ir nospēlējuši.
   */
  step(): StepResult {
    const state = this.engine.getGameState();
    const phase = state.coreState.phase;

    if (phase === "gameEnd") {
      return { events: [], status: "game-over", trickComplete: false };
    }

    if (phase === "roundEnd") {
      const events = this.requireDispatch({
        type: "START_NEXT_ROUND",
        gameId: this.gameId,
        requestId: this.createRequestId("next-round")
      });
      return { events, status: "round-advanced", trickComplete: hasTrickComplete(events) };
    }

    if (phase !== "bidding" && phase !== "playing") {
      // Negaidīta fāze — apstājamies droši (nav ko orķestrēt).
      return { events: [], status: "game-over", trickComplete: false };
    }

    const activeTurn = state.currentTurn;
    if (!activeTurn) {
      const events = this.requireDispatch({
        type: "START_TURN",
        gameId: this.gameId,
        requestId: this.createRequestId("start-turn"),
        turnId: this.createTurnId(),
        now: 0
      });
      // Vai tikko atvērtais turns pieder cilvēkam? Tad apstājamies (gaidām SUBMIT).
      const started = this.engine.getGameState();
      const actor = started.players.find((player) => player.playerId === started.currentTurn?.playerId);
      const status = actor && actor.status !== "bot" ? "awaiting-human" : "bot-turn-started";
      return { events, status, trickComplete: false };
    }

    const actingPlayer = state.players.find((player) => player.playerId === activeTurn.playerId);
    if (actingPlayer && actingPlayer.status !== "bot") {
      // Cilvēka turns jau aktīvs: apstājamies un gaidām klienta SUBMIT.
      return { events: [], status: "awaiting-human", trickComplete: false };
    }

    // Botu turns: deterministiska auto-darbība.
    const events = this.autoPlayBot(activeTurn.playerId, activeTurn.turnId, phase);
    return { events, status: "bot-acted", trickComplete: hasTrickComplete(events) };
  }

  private autoPlayBot(
    playerId: string,
    turnId: string,
    phase: "bidding" | "playing"
  ): readonly SequencedRoomEvent[] {
    const state = this.engine.getGameState();

    if (phase === "bidding") {
      const decision = autoBid(state, playerId);
      if (!decision) {
        throw new Error(`No legal auto-bid for bot ${playerId} in game ${this.gameId}.`);
      }
      return this.requireDispatch({
        type: "SUBMIT_BID",
        gameId: this.gameId,
        requestId: this.createRequestId("bot-bid"),
        playerId,
        turnId,
        now: 0,
        bid: decision.bid
      });
    }

    const move = autoMove(state, playerId);
    if (!move) {
      throw new Error(`No legal auto-move for bot ${playerId} in game ${this.gameId}.`);
    }
    return this.requireDispatch({
      type: "SUBMIT_MOVE",
      gameId: this.gameId,
      requestId: this.createRequestId("bot-move"),
      playerId,
      turnId,
      now: 0,
      tile: move.tile,
      ...(move.declaredNumber !== undefined ? { declaredNumber: move.declaredNumber } : {})
    });
  }

  private requireDispatch(command: MultiplayerCommand): readonly SequencedRoomEvent[] {
    const result = this.engine.dispatch(command);
    if (!result.accepted) {
      const reason = result.errors.map((error) => error.code).join(", ") || "unknown";
      throw new Error(
        `GameDirector command ${command.type} was rejected (${reason}) in game ${this.gameId}.`
      );
    }
    return result.events;
  }
}

/** Vai eventu kopā ir `TRICK_COMPLETED` (klients tad rāda pabeigto triku ar pauzi). */
function hasTrickComplete(events: readonly SequencedRoomEvent[]): boolean {
  return events.some((entry) => entry.event.type === "TRICK_COMPLETED");
}
