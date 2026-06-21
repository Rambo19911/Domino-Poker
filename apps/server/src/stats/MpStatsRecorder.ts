import type { MultiplayerEvent } from "@domino-poker/core/multiplayer";

import type { SequencedRoomEvent } from "../rooms/RoomEngine.js";
import type { GameResultRecord, PlayerStatsStore } from "../storage/PlayerStatsStore.js";
import type { MatchStartedRecord } from "../storage/StoragePort.js";
import type { Clock } from "../timers/TurnTimerScheduler.js";

/**
 * MP padziļinātās statistikas reģistrētājs (sk. `docs/TODO/player-stats-plan.md`).
 * Brālis `OutcomeRecorder`/`MatchPayoutService` — TĀ PAŠA istabas-īpašnieka dzīves
 * cikla āķos (matchStarted / per-event / gameOver / abandon), tāpēc tikai īpašnieka
 * instance uzkrāj (NE cross-instance fanout abonenti), un idempotentās rindas sargā
 * pret dubultu rakstu.
 *
 * Bid-accuracy ir SERVERA-autoritatīva: to uzkrāj no bagātinātā `ROUND_RESULT`
 * eventa `playerResults` (solījums + paņemtie stiķi PIRMS nākamā raunda reseta — sk.
 * core `applyStartNextRound`), NE no jau-resetota stāvokļa. Pie `GAME_OVER` apvieno
 * uzkrāto ar gala `standings` → vieta, un persistē VIENU rindu uz reģistrētu cilvēku.
 *
 * Politika (atšķiras no `OutcomeRecorder`): ieraksta VISAS pabeigtās MP spēles, kurās
 * piedalās reģistrēts lietotājs (arī ar botiem) — personīga atgriezeniskā saite, dzen
 * NEKO konkurētspējīgu. Eligibility + userId no START roster.
 *
 * Robeža (kā `OutcomeRecorder`): tikai-atmiņā uzkrājums uz īpašnieka; ja īpašnieks
 * avarē pirms `GAME_OVER`, tās partijas MP statistika zūd (fanout/idempotences-droši,
 * bet ne restart-droši). Bagātinātie eventi ļauj nākotnes backfill (ārpus v1).
 */
interface MpMatchState {
  /** Reģistrēto cilvēku `userId → core player id` (no START roster). */
  readonly humans: ReadonlyMap<string, string>;
  /** `userId →` uzkrātie solījumu-precizitātes skaitītāji. */
  readonly tallies: Map<string, { met: number; exceeded: number; missed: number }>;
  /** Jau ieskaitīto raundu numuri (dedupē atkārtotu event piegādi). */
  readonly countedRounds: Set<number>;
}

export interface MpStatsRecorderOptions {
  readonly store: Pick<PlayerStatsStore, "recordGameResult">;
  readonly clock: Clock;
  readonly onError?: (context: string, error: unknown) => void;
}

export class MpStatsRecorder {
  private readonly store: Pick<PlayerStatsStore, "recordGameResult">;
  private readonly clock: Clock;
  private readonly onError: (context: string, error: unknown) => void;
  private readonly matches = new Map<string, MpMatchState>();

  constructor(options: MpStatsRecorderOptions) {
    this.store = options.store;
    this.clock = options.clock;
    this.onError =
      options.onError ??
      ((context, error) => {
        console.error(`[mp-stats] ${context}:`, error);
      });
  }

  /** Partija sākta: kešo reģistrēto cilvēku sastāvu (userId → core id). */
  matchStarted(record: MatchStartedRecord): void {
    const humans = new Map<string, string>();
    for (const seat of record.players) {
      if (seat.kind === "human" && seat.userId !== undefined) {
        humans.set(seat.userId, seat.corePlayerId);
      }
    }
    // Nav reģistrētu cilvēku → nav ko ierakstīt (anonīmie nesaņem statistiku).
    if (humans.size === 0) return;
    this.matches.set(record.matchId, { humans, tallies: new Map(), countedRounds: new Set() });
  }

  /**
   * Apstrādā pievienoto eventu partiju (KATRAM batch, īpašnieka pusē): uzkrāj
   * bid-accuracy no `ROUND_RESULT.playerResults`. Izsaukts PIRMS `gameOver` arī tad,
   * kad `ROUND_RESULT` + `GAME_OVER` ir vienā partijā → pēdējais raunds ieskaitīts.
   */
  recordEvents(events: readonly SequencedRoomEvent[]): void {
    for (const { event } of events) {
      this.recordRoundResult(event);
    }
  }

  private recordRoundResult(event: MultiplayerEvent): void {
    if (event.type !== "ROUND_RESULT" || event.playerResults === undefined) return;
    const state = this.matches.get(event.gameId);
    if (!state || state.countedRounds.has(event.round)) return;
    state.countedRounds.add(event.round);
    const byPlayerId = new Map(event.playerResults.map((result) => [result.playerId, result] as const));
    for (const [userId, corePlayerId] of state.humans) {
      const result = byPlayerId.get(corePlayerId);
      // `bid < 0` = nepieteica (piem. forfeitēja pirms šī raunda solīšanas) → izlaiž šo
      // raundu šim spēlētājam (mazāk ieskaitītu raundu, bet summa joprojām = round_count).
      if (result === undefined || result.bid < 0) continue;
      const tally = state.tallies.get(userId) ?? { met: 0, exceeded: 0, missed: 0 };
      if (result.tricksWon === result.bid) tally.met += 1;
      else if (result.tricksWon > result.bid) tally.exceeded += 1;
      else tally.missed += 1;
      state.tallies.set(userId, tally);
    }
  }

  /**
   * Normāls fināls: katram reģistrētam cilvēkam persistē VIENU rindu — vieta no
   * `standings`, skaitītāji no uzkrātā. Idempotents pēc `mp:{matchId}:{userId}`.
   * Fire-and-forget (kā `OutcomeRecorder`); DB kļūdas reģistrē, ne met.
   */
  gameOver(matchId: string, standings: readonly string[]): void {
    const state = this.matches.get(matchId);
    if (!state) return;
    const now = this.clock();
    const placementByCoreId = new Map(standings.map((coreId, index) => [coreId, index + 1] as const));
    for (const [userId, corePlayerId] of state.humans) {
      const tally = state.tallies.get(userId);
      const roundCount = tally ? tally.met + tally.exceeded + tally.missed : 0;
      const placement = placementByCoreId.get(corePlayerId);
      // Bez nospēlētiem raundiem (pārkāptu round_count > 0) vai bez vietas → izlaiž + log.
      if (tally === undefined || roundCount === 0 || placement === undefined) {
        this.onError(
          "gameOver",
          new Error(`skipping mp stats for ${matchId}/${userId}: rounds=${roundCount}, placement=${placement ?? "none"}`)
        );
        continue;
      }
      const record: GameResultRecord = {
        id: `mp:${matchId}:${userId}`,
        userId,
        mode: "mp",
        placement,
        roundCount,
        bidMet: tally.met,
        bidExceeded: tally.exceeded,
        bidMissed: tally.missed,
        completedAt: now
      };
      try {
        this.store
          .recordGameResult(record)
          .catch((error: unknown) => this.onError("recordGameResult", error));
      } catch (error) {
        this.onError("recordGameResult", error);
      }
    }
    this.matches.delete(matchId);
  }

  /** Pamesta istaba / bez GAME_OVER: aizmirst (NEpersistē — nav autoritatīvas vietas). */
  forget(matchId: string): void {
    this.matches.delete(matchId);
  }
}
