import type { Clock } from "../timers/TurnTimerScheduler.js";
import type { MatchOutcome, MatchSeatRecord, MatchStartedRecord, StoragePort } from "./StoragePort.js";

/**
 * MP kontu iznākumu dzinējs (Fāze 3). Atsevišķs serviss (Codex ieteikums), ko sauc
 * no spēles dzīves cikla āķiem: partijas sākums, fināls (GAME_OVER ar standings),
 * forfeit (apzināts exit / auto-forfeit) un pamesta istaba (abandon).
 *
 * Politika:
 *  - **Skaitāma spēle** tikai ja partijas SĀKUMĀ 4 sēdvietas = 4 atšķirīgi reģistrēti
 *    lietotāji (anti-farming 8). Citādi — nekādu kontu statistiku.
 *  - **Eligibility un userId vienmēr no START roster**, nekad no dzīvajām sēdvietām
 *    (kuras forfeit maina uz botiem).
 *  - **Tieši viens iznākums uz lietotāju uz spēli.** Lēmums atmiņā NEtiek pārrakstīts
 *    (forfeit `lose` nekad nekļūst par `win` pie GAME_OVER); DB `recordUserMatchOutcome`
 *    ir idempotents galīgais aizsargs (anti-cheat 5.7).
 *  - Fail-safe: lēmuma DB ieraksts tiek atkārtoti mēģināts arī GAME_OVER brīdī (ja
 *    forfeit raksts iepriekš neizdevās, palicis pareizais `lose`).
 *
 * Fire-and-forget: DB kļūdas tiek reģistrētas, ne mestas (spēle paliek autoritatīva).
 */
interface MatchOutcomeState {
  readonly roster: readonly MatchSeatRecord[];
  readonly eligible: boolean;
  /** userId → jau pieņemtais iznākums (forfeit/abandon = `lose`). Pirmais uzvar. */
  readonly decided: Map<string, MatchOutcome>;
}

export interface OutcomeRecorderOptions {
  readonly storage: Pick<StoragePort, "recordUserMatchOutcome">;
  readonly clock: Clock;
  readonly onError?: (context: string, error: unknown) => void;
  /**
   * Izsaukts PĒC katra veiksmīga (JAUNA) iznākuma ieraksta (Leaderboard fāze).
   * Lieto, lai paziņotu `LeaderboardService` par stats izmaiņu (rangu keša pārbūve).
   * NEizsaukts pie idempotenta re-ieraksta (jau bija) — kešs nav jāinvalidē veltīgi.
   */
  readonly onStatsChanged?: () => void;
}

export class OutcomeRecorder {
  private readonly storage: Pick<StoragePort, "recordUserMatchOutcome">;
  private readonly clock: Clock;
  private readonly onError: (context: string, error: unknown) => void;
  private readonly onStatsChanged: () => void;
  private readonly matches = new Map<string, MatchOutcomeState>();

  constructor(options: OutcomeRecorderOptions) {
    this.storage = options.storage;
    this.clock = options.clock;
    this.onError =
      options.onError ??
      ((context, error) => {
        console.error(`[outcomes] ${context}:`, error);
      });
    this.onStatsChanged = options.onStatsChanged ?? (() => {});
  }

  /** Partija sākta: kešo START roster un aprēķina, vai spēle ir skaitāma. */
  matchStarted(record: MatchStartedRecord): void {
    const humans = record.players.filter((seat) => seat.kind === "human");
    const userIds = humans
      .map((seat) => seat.userId)
      .filter((userId): userId is string => userId !== undefined);
    const eligible =
      record.players.length === 4 &&
      humans.length === 4 &&
      userIds.length === 4 &&
      new Set(userIds).size === 4;
    this.matches.set(record.matchId, { roster: record.players, eligible, decided: new Map() });
  }

  /** Forfeit (apzināts exit / auto-forfeit pēc grace): `lose` šim sēdvietas lietotājam. */
  playerForfeited(matchId: string, corePlayerId: string): void {
    const state = this.matches.get(matchId);
    if (!state || !state.eligible) return;
    const seat = state.roster.find((candidate) => candidate.corePlayerId === corePlayerId);
    if (seat?.userId === undefined) return;
    this.decide(matchId, state, seat.userId, "lose");
  }

  /** Pamesta istaba (visi cilvēki offline, neviens neatgriežas): `lose` visiem vēl nereģistrētajiem. */
  matchAbandoned(matchId: string): void {
    const state = this.matches.get(matchId);
    if (state && state.eligible) {
      for (const seat of state.roster) {
        if (seat.userId !== undefined) {
          this.decide(matchId, state, seat.userId, "lose");
        }
      }
    }
    this.matches.delete(matchId);
  }

  /**
   * Normāls fināls: vietas-balstīts iznākums (1./2. = win, 3./4. = lose) pēc
   * `standings` (core spēlētāju id rangā). Jau izlemtie (forfeit) saglabā savu `lose`.
   */
  gameOver(matchId: string, standings: readonly string[]): void {
    const state = this.matches.get(matchId);
    if (!state) return;
    if (state.eligible) {
      const rankByCoreId = new Map(standings.map((coreId, index) => [coreId, index] as const));
      for (const seat of state.roster) {
        if (seat.userId === undefined) continue;
        const rank = rankByCoreId.get(seat.corePlayerId);
        const placement: MatchOutcome = rank !== undefined && rank <= 1 ? "win" : "lose";
        this.decide(matchId, state, seat.userId, placement);
      }
    }
    this.matches.delete(matchId);
  }

  /** Aizmirst partiju (piem. istaba iznīcināta bez iznākuma). */
  forget(matchId: string): void {
    this.matches.delete(matchId);
  }

  /**
   * Pieņem lēmumu (pirmais uzvar — `lose` netiek pārrakstīts ar `win`) un fire-and-forget
   * ieraksta DB (idempotents). Atkārtots izsaukums tam pašam lietotājam re-mēģina to
   * pašu lēmumu (fail-safe pret iepriekš neizdevušos rakstu).
   */
  private decide(
    matchId: string,
    state: MatchOutcomeState,
    userId: string,
    proposed: MatchOutcome
  ): void {
    if (!state.decided.has(userId)) {
      state.decided.set(userId, proposed);
    }
    const outcome = state.decided.get(userId)!;
    try {
      this.storage
        .recordUserMatchOutcome(matchId, userId, outcome, this.clock())
        .then((recorded) => {
          // Tikai JAUNS iznākums maina stats → paziņo leaderboard kešam (ne idempotents re-ieraksts).
          if (recorded) {
            // Atsevišķs konteksts: onStatsChanged kļūda nedrīkst maskēties kā DB raksta kļūda.
            try {
              this.onStatsChanged();
            } catch (error) {
              this.onError("onStatsChanged", error);
            }
          }
        })
        .catch((error: unknown) => this.onError("recordUserMatchOutcome", error));
    } catch (error) {
      this.onError("recordUserMatchOutcome", error);
    }
  }
}
