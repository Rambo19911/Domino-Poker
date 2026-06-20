import { splitPot } from "@domino-poker/shared";

import type { MatchSeatRecord, MatchStartedRecord } from "../storage/StoragePort.js";
import type { WalletService } from "./WalletService.js";

/** Vienas poda daļas izmaksas rezultāts (orķestrācijai bilances push vajadzībām). */
export interface PayoutResult {
  /** Sēdvietas savienojuma `clientId` (WALLET_UPDATED push mērķis). */
  readonly clientId: string;
  readonly userId: string;
  /** Izmaksātā summa (poda daļa). */
  readonly amount: number;
  /** Bilance pēc izmaksas. */
  readonly balance: number;
}

interface PayoutState {
  readonly pot: number;
  /** Partijas SĀKUMA sastāvs (eligibility un userId no šejienes, NE no dzīvajām sēdvietām). */
  readonly roster: readonly MatchSeatRecord[];
  /** Forfeitējušo core spēlētāju id (izslēgti no izmaksas, pat ja bot-spēle finišē augstu). */
  readonly forfeited: Set<string>;
}

export interface MatchPayoutServiceOptions {
  readonly wallet: Pick<WalletService, "payoutCoins">;
  readonly onError?: (context: string, error: unknown) => void;
}

/**
 * MP poda izmaksas dzinējs (Fāze 3) — atsevišķs serviss (kā `OutcomeRecorder`), ko
 * sauc no spēles dzīves cikla āķiem: partijas sākums (kešo podu + sastāvu maksas
 * spēlēm), forfeit (izslēdz no izmaksas), fināls (GAME_OVER → sadala podu top-2
 * reģistrētajiem cilvēkiem) un pamesta istaba (atmet — neviena nav, kam izmaksāt).
 *
 * Politika:
 *  - **Izmaksa tikai maksas spēlēs** (`pot > 0`), neatkarīgi no stats eligibility —
 *    maksas istabā var būt cilvēki + boti, un cilvēks(-i) tomēr saņem podu (D4/D5).
 *  - **Boti nesaņem podu** (`kind === "human"` + `userId`); **forfeitējušie cilvēki arī ne**.
 *  - **Sadalījums** 70/30 ar atlikumu 1. vietai (A1); 1 cilvēks → 100% (A2) — `splitPot`.
 *  - **Idempotents pēc `matchId`** (kešs dzēsts pie pirmā GAME_OVER + `WalletService`
 *    ledger `mp_payout/ref=matchId` kā galīgais aizsargs pret dubultu izmaksu).
 *
 * Fire-and-forget izmaksa (kā `OutcomeRecorder`): kešotais sastāvs+pods nav atkarīgs
 * no istabas dzīves cikla, tāpēc droši arī pēc istabas iznīcināšanas. DB kļūdas tiek
 * reģistrētas (R3: bez outbox; atlikušais risks dokumentēts).
 */
export class MatchPayoutService {
  private readonly wallet: Pick<WalletService, "payoutCoins">;
  private readonly onError: (context: string, error: unknown) => void;
  private readonly matches = new Map<string, PayoutState>();

  constructor(options: MatchPayoutServiceOptions) {
    this.wallet = options.wallet;
    this.onError =
      options.onError ??
      ((context, error) => {
        console.error(`[payout] ${context}:`, error);
      });
  }

  /** Partija sākta: kešo podu + sastāvu TIKAI maksas spēlēm (`pot > 0`). */
  matchStarted(record: MatchStartedRecord): void {
    if (record.pot === undefined || record.pot <= 0) return;
    this.matches.set(record.matchId, {
      pot: record.pot,
      roster: record.players,
      forfeited: new Set()
    });
  }

  /** Forfeit (apzināts exit / auto-forfeit): izslēdz šo core spēlētāju no izmaksas. */
  playerForfeited(matchId: string, corePlayerId: string): void {
    this.matches.get(matchId)?.forfeited.add(corePlayerId);
  }

  /** Pamesta istaba (visi offline): neviena nav, kam izmaksāt → atmet (pods paliek neizmaksāts). */
  matchAbandoned(matchId: string): void {
    this.matches.delete(matchId);
  }

  /** Aizmirst partiju bez izmaksas (piem. istaba iznīcināta citā ceļā). */
  forget(matchId: string): void {
    this.matches.delete(matchId);
  }

  /**
   * Normāls fināls: sadala podu top-2 reģistrētajiem, NE-forfeitējušajiem cilvēkiem
   * pēc `standings` (core id rangā; index 0 = 1. vieta). Atgriež izmaksas bilances
   * push vajadzībām. Idempotents: kešs dzēsts uzreiz, atkārtots izsaukums → `[]`.
   */
  async gameOver(matchId: string, standings: readonly string[]): Promise<readonly PayoutResult[]> {
    const state = this.matches.get(matchId);
    if (!state) return [];
    this.matches.delete(matchId);

    const seatByCore = new Map(state.roster.map((seat) => [seat.corePlayerId, seat] as const));
    const candidates = standings
      .map((coreId) => seatByCore.get(coreId))
      .filter(
        (seat): seat is MatchSeatRecord =>
          seat !== undefined &&
          seat.kind === "human" &&
          seat.userId !== undefined &&
          !state.forfeited.has(seat.corePlayerId)
      )
      .slice(0, 2);
    if (candidates.length === 0) return [];

    const amounts = splitPot(state.pot, candidates.length);
    const results: PayoutResult[] = [];
    for (let i = 0; i < candidates.length; i += 1) {
      const seat = candidates[i]!;
      const amount = amounts[i] ?? 0;
      if (amount <= 0) continue;
      const userId = seat.userId!;
      try {
        const balance = await this.wallet.payoutCoins(userId, matchId, amount);
        if (seat.clientId !== undefined) {
          results.push({ clientId: seat.clientId, userId, amount, balance });
        }
      } catch (error) {
        this.onError("payoutCoins", error);
      }
    }
    return results;
  }
}
