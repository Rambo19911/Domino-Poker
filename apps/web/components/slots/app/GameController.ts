import { SLOT_MATH_CONFIG } from '@domino-poker/core/slots';
import type { LineBet } from '@domino-poker/core/slots';
import type { SpinResult } from '@domino-poker/core/slots';
import { AUTO_SPIN_OPTIONS } from '../config/presentation';
import { totalBetOf, type GameState, type SpinError } from './gameState';
import type { GameStore } from './GameStore';

/** Servera atbilde vienam griezienam, jau normalizēta kontrolierim. */
export interface SpinOutcome {
  readonly balance: number;
  readonly payout: number;
  readonly result: SpinResult;
}

export interface SpinFailure {
  readonly reason: 'insufficient' | 'unauthorized' | 'rate_limited' | 'network' | 'failed';
  /**
   * Servera autoritatīvā bilance, ja kļūdas atbilde to nesa (402 `insufficient_coins`).
   * Tas ir vienīgais ceļš, kā izlabot novecojušu lokālo bilanci, jo noraidīts grieziens
   * neatgriež parasto norēķina atbildi.
   */
  readonly balance?: number;
}

export type SpinResponse = { readonly ok: true; readonly value: SpinOutcome } | ({ readonly ok: false } & SpinFailure);

/** Viens servera grieziens. `spinId` atkārtojot, serveris atdod ierakstīto iznākumu. */
export type SpinRequest = (spinId: string, lineBet: LineBet) => Promise<SpinResponse>;

export interface GameControllerDeps {
  readonly store: GameStore;
  readonly spin: SpinRequest;
  /** UUID ģenerators (injicējams testiem). */
  readonly createSpinId: () => string;
  /** Autoritatīvā bilance uz augšu lobijam; izsaukts tikai pēc norēķina. */
  readonly onBalanceChange?: (balance: number) => void;
}

const FAILURE_ERRORS: Readonly<Record<SpinFailure['reason'], SpinError>> = {
  insufficient: 'NOT_ENOUGH_COINS',
  unauthorized: 'SESSION_EXPIRED',
  rate_limited: 'RATE_LIMITED',
  network: 'SPIN_FAILED',
  failed: 'SPIN_FAILED',
};

/**
 * Owns every state transition (plan sections 8-10).
 *
 * **Naudu šis kontrolieris NEPĀRVALDA.** DominoPoker integrācijā serveris ir vienīgā
 * autoritāte: `spin()` atgriež gan režģi, gan bilanci, un šeit tie tikai tiek parādīti.
 * Standalone spēles lokālā bilance, write-ahead envelope persistence un `settleSpin`
 * ir noņemti pilnībā — divi patiesības avoti naudai būtu defekts, ne dublējums.
 *
 * Prezentācijas smalkums: serveris atdod GALA bilanci (likme atskaitīta UN laimests
 * ieskaitīts). HUD grib redzēt kritumu grieziena sākumā un pieaugumu norēķinā, tāpēc
 * starpsolis tiek atvasināts kā `balance - payout` — abi skaitļi no servera, nekāda
 * lokāla aritmētika ar naudu.
 */
export class GameController {
  private readonly store: GameStore;
  private readonly spin: SpinRequest;
  private readonly createSpinId: () => string;
  private readonly onBalanceChange: ((balance: number) => void) | undefined;
  /** Sargs pret dubultu izsaukumu, kamēr servera pieprasījums vēl lido. */
  private inFlight = false;
  private disposed = false;

  constructor(deps: GameControllerDeps) {
    this.store = deps.store;
    this.spin = deps.spin;
    this.createSpinId = deps.createSpinId;
    this.onBalanceChange = deps.onBalanceChange;
  }

  private get state(): GameState {
    return this.store.getState();
  }

  /**
   * Pārtrauc vēl neatbildētu griezienu efektus un IZSKALO neizpausto bilanci: ja
   * lietotājs aizver spēli, kamēr ruļļi vēl griežas, `onReelsStopped` nekad nenostrādās,
   * bet nauda serverī jau ir kustējusies.
   */
  dispose(): void {
    this.disposed = true;
    if (this.unpublishedBalance !== null) {
      this.onBalanceChange?.(this.unpublishedBalance);
      this.unpublishedBalance = null;
    }
  }

  /** Servera bilance, ko lobijs vēl nav redzējis (grieziens norēķināts, ruļļi griežas). */
  private unpublishedBalance: number | null = null;

  /**
   * Vēl neatrisināts `spinId`: pieprasījums, kas beidzās ar tīkla kļūmi, VARĒJA būt
   * nostrādājis serverī. Nākamais mēģinājums lieto to pašu id, tāpēc serveris atdod
   * ierakstīto iznākumu, nevis paņem otru likmi. Notīrās tikai pēc skaidras atbildes.
   */
  private unresolvedSpinId: string | null = null;

  /** Sāk sesiju ar konta bilanci; režģis paliek tukšs, līdz pirmajam griezienam. */
  boot(balance: number): void {
    this.store.patch({
      phase: 'IDLE',
      balance: BigInt(balance),
      lineBet: SLOT_MATH_CONFIG.defaultLineBet as LineBet,
      lastWin: 0n,
      autoSpin: null,
      pendingSpin: null,
      error: null,
    });
  }

  /**
   * Pieprasa vienu griezienu no servera. Atgriež `true`, ja grieziens tika uzsākts.
   * Tīkla kļūme tiek atkārtota VIENU reizi ar to pašu `spinId` — tas ir droši, jo
   * serveris ir idempotents; jauns id nozīmētu jaunu likmi.
   */
  async requestSpin(): Promise<boolean> {
    // Pirmais sargs ir `disposed`, ne fāze: Auto Spin dialogam ir 150 ms aizture, un
    // bez šī lietotājs, kas aizver dialogu tās laikā, joprojām noliktu ĪSTU likmi.
    if (this.disposed || this.inFlight || this.state.phase !== 'IDLE') return false;
    const lineBet = this.state.lineBet;
    // Pietiekamību izlemj TIKAI serveris (D1). Agrāk šeit bija lokāla ātrā pārbaude,
    // bet tā radīja strupceļu: ja lokālā bilance bija novecojusi UZ LEJU, pieprasījums
    // nekad netika izsūtīts, tāpēc arī neviena servera atbilde to nevarēja izlabot —
    // spēle paliktu bloķēta ar naudu, kas kontā patiesībā ir. Tagad noraidījums atnāk
    // kā 402 KOPĀ ar autoritatīvo bilanci, un `fail()` to uzreiz pieliek.
    // Cena: viens HTTP izsaukums arī tad, kad monētu tiešām nepietiek (rate limit 600/h,
    // un Auto Spin pie `insufficient` apstājas, tāpēc cilpas nav).

    this.inFlight = true;
    // Neatrisināts id no iepriekšējās tīkla kļūmes tiek LIETOTS ATKĀRTOTI: tā likme,
    // iespējams, jau ir noņemta, un jauns id nozīmētu otru likmi par to pašu klikšķi.
    const spinId = this.unresolvedSpinId ?? this.createSpinId();
    try {
      let response = await this.spin(spinId, lineBet);
      // Atkārtojums NEDRĪKST notikt pēc `dispose`: ja pirmais pieprasījums serveri
      // nekad nesasniedza, atkārtojums noliktu PIRMO īsto likmi uz jau aizvērtas
      // spēles. `disposed` sargs `requestSpin` sākumā to nesedz — mēs jau esam
      // await iekšienē. Id paliek rezervēts zemāk, tāpēc likme netiek pazaudēta.
      if (!response.ok && response.reason === 'network' && !this.disposed) {
        response = await this.spin(spinId, lineBet);
      }
      // Tīkla kļūme ir NESKAIDRA — id paliek rezervēts nākamajam mēģinājumam.
      this.unresolvedSpinId = !response.ok && response.reason === 'network' ? spinId : null;
      if (!response.ok) {
        if (this.disposed) {
          // Novēlots noraidījums pēc aizvēršanas. HUD vairs nav, tāpēc store NETIEK
          // aiztikts, bet autoritatīvā bilance (402) tik un tā jāaiznes lobijam —
          // tieši tā pati simetrija kā veiksmes ceļam zemāk. Novecojušas publikācijas
          // atsijā dialoga (tokens + kārtas nr.) zīmogs.
          if (response.balance !== undefined) this.onBalanceChange?.(response.balance);
          return false;
        }
        this.fail(response);
        return false;
      }
      const { balance, payout, result } = response.value;
      if (this.disposed) {
        // Grieziens NORĒĶINĀJĀS, bet spēle jau ir aizvērta. Bilance tik un tā ir
        // jāpaziņo lobijam, citādi tas rādītu novecojušu skaitli.
        this.onBalanceChange?.(balance);
        return false;
      }
      // Lobijs to uzzinās norēķinā (vai `dispose`, ja spēle aizveras agrāk) — tagad
      // nē, citādi bilances lēciens atklātu laimestu pirms ruļļi apstājas.
      this.unpublishedBalance = balance;
      const autoSpin = this.state.autoSpin;
      this.store.patch({
        phase: 'SPINNING',
        // Serveris atdod GALA bilanci; grieziena laikā rāda stāvokli pēc likmes.
        balance: BigInt(balance - payout),
        pendingSpin: result,
        error: null,
        // YOUR WIN resets when the spin starts so the settle count-up always
        // rises from zero (UI/UX 9.3); the new total arrives at settlement.
        lastWin: 0n,
        autoSpin: autoSpin === null ? null : { ...autoSpin, remaining: autoSpin.remaining - 1 },
      });
      return true;
    } catch (error) {
      console.error('Slot spin request failed', error);
      if (!this.disposed) this.fail({ reason: 'failed' });
      return false;
    } finally {
      this.inFlight = false;
    }
  }

  private fail(failure: SpinFailure): void {
    this.stopAutoSpin();
    // Serveris kļūdas atbildē var atsūtīt autoritatīvo bilanci (402). Pieņemam to arī
    // kļūmes ceļā — citādi HUD un lobijs paliktu ar novecojušu skaitli tieši tajā
    // brīdī, kad lietotājam ir vissvarīgāk redzēt patieso summu.
    if (failure.balance !== undefined) {
      this.store.patch({ balance: BigInt(failure.balance) });
      this.onBalanceChange?.(failure.balance);
    }
    this.store.patch({ error: FAILURE_ERRORS[failure.reason] });
  }

  /** All reels stopped: show the settled result the server already recorded. */
  onReelsStopped(): void {
    const { phase, pendingSpin } = this.state;
    if (phase !== 'SPINNING' || pendingSpin === null) return;
    this.store.patch({ phase: 'SETTLING' });
    const finalBalance = this.state.balance + pendingSpin.totalWin;
    this.store.patch({
      phase: 'PRESENTING_WIN',
      balance: finalBalance,
      lastWin: pendingSpin.totalWin,
      pendingSpin: null,
    });
    // Lobijs uzzina bilanci tikai tagad: agrāk tas nodotu laimestu, pirms ruļļi apstājas.
    const published = this.unpublishedBalance ?? Number(finalBalance);
    this.unpublishedBalance = null;
    this.onBalanceChange?.(published);
  }

  /** Win presentation finished: back to IDLE, then continue Auto Spin if due. */
  onPresentationComplete(): void {
    if (this.state.phase !== 'PRESENTING_WIN') return;
    this.store.patch({ phase: 'IDLE' });
    const { autoSpin, balance, lineBet } = this.state;
    if (autoSpin === null) return;
    const shouldContinue =
      !autoSpin.stopRequested && autoSpin.remaining > 0 && balance >= totalBetOf(lineBet);
    if (!shouldContinue) {
      this.stopAutoSpin();
      return;
    }
    // Katrs Auto Spin grieziens ir JAUNS `spinId` — tā ir jauna likme, ne atkārtojums.
    void this.requestSpin();
  }

  // --- Bet controls: IDLE only, never during Auto Spin (plan section 10.6) ---

  private canChangeBet(): boolean {
    return this.state.phase === 'IDLE' && this.state.autoSpin === null && !this.inFlight;
  }

  private setLineBet(lineBet: LineBet): void {
    this.store.patch({ lineBet });
  }

  betMinus(): boolean {
    if (!this.canChangeBet()) return false;
    const steps = SLOT_MATH_CONFIG.lineBetSteps;
    const index = steps.indexOf(this.state.lineBet);
    if (index <= 0) return false;
    this.setLineBet(steps[index - 1] as LineBet);
    return true;
  }

  betPlus(): boolean {
    if (!this.canChangeBet()) return false;
    const steps = SLOT_MATH_CONFIG.lineBetSteps;
    const index = steps.indexOf(this.state.lineBet);
    if (index < 0 || index >= steps.length - 1) return false;
    this.setLineBet(steps[index + 1] as LineBet);
    return true;
  }

  maxBet(): boolean {
    if (!this.canChangeBet()) return false;
    const max = SLOT_MATH_CONFIG.lineBetSteps[SLOT_MATH_CONFIG.lineBetSteps.length - 1] as LineBet;
    if (this.state.lineBet === max) return false;
    this.setLineBet(max);
    return true;
  }

  // --- Rules dialog: opening stops Auto Spin (plan section 10.5) ---

  openRules(): boolean {
    if (this.state.phase !== 'IDLE') return false;
    this.stopAutoSpin();
    this.store.patch({ phase: 'RULES_OPEN' });
    return true;
  }

  closeRules(): void {
    if (this.state.phase === 'RULES_OPEN') this.store.patch({ phase: 'IDLE' });
  }

  // --- Auto Spin (plan section 10) ---

  openAutoSpinConfig(): boolean {
    if (this.state.phase !== 'IDLE' || this.state.autoSpin !== null) return false;
    this.store.patch({ phase: 'AUTOSPIN_CONFIG' });
    return true;
  }

  cancelAutoSpinConfig(): void {
    if (this.state.phase === 'AUTOSPIN_CONFIG') this.store.patch({ phase: 'IDLE' });
  }

  async selectAutoSpin(count: number): Promise<boolean> {
    if (this.state.phase !== 'AUTOSPIN_CONFIG') return false;
    if (!(AUTO_SPIN_OPTIONS as readonly number[]).includes(count)) return false;
    this.store.patch({ phase: 'IDLE', autoSpin: { remaining: count, stopRequested: false } });
    return this.requestSpin();
  }

  /** Second click on the Auto/Hold control: finish the current spin, no new one. */
  requestAutoStop(): void {
    const autoSpin = this.state.autoSpin;
    if (autoSpin !== null) this.store.patch({ autoSpin: { ...autoSpin, stopRequested: true } });
  }

  /** Browser tab hidden: Auto Spin must stop after the active spin. */
  notifyTabHidden(): void {
    this.requestAutoStop();
  }

  private stopAutoSpin(): void {
    if (this.state.autoSpin !== null) this.store.patch({ autoSpin: null });
  }
}

export function createInitialState(): GameState {
  return {
    phase: 'BOOT',
    balance: 0n,
    lineBet: SLOT_MATH_CONFIG.defaultLineBet as LineBet,
    lastWin: 0n,
    autoSpin: null,
    pendingSpin: null,
    error: null,
  };
}
