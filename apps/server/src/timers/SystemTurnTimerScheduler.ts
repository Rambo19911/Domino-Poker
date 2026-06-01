import type { Clock, TurnTimerScheduler } from "./TurnTimerScheduler.js";

type TimerHandle = ReturnType<typeof setTimeout>;

export interface SystemTurnTimerSchedulerOptions {
  /** Laika avots (noklusējums `Date.now`); jāsakrīt ar dzinēja pulksteni. */
  readonly clock?: Clock;
  /** Injicējams `setTimeout` (testiem); noklusējums īstais. */
  readonly setTimeoutFn?: (run: () => void, delayMs: number) => TimerHandle;
  readonly clearTimeoutFn?: (handle: TimerHandle) => void;
}

/**
 * Īstais (`setTimeout`) `TurnTimerScheduler` Fāzei 7. Tā kā istabā vienlaikus var
 * būt tikai viens aktīvs turns, pietiek ar vienu gaidošo timeri: `schedule`
 * aizstāj iepriekšējo, `cancel` to notīra. `fireAt` ir absolūts laiks (dzinēja
 * pulksteņa domēnā), tāpēc aizkavi rēķina kā `fireAt - clock()`.
 */
export class SystemTurnTimerScheduler implements TurnTimerScheduler {
  private readonly clock: Clock;
  private readonly setTimeoutFn: (run: () => void, delayMs: number) => TimerHandle;
  private readonly clearTimeoutFn: (handle: TimerHandle) => void;
  private handle: TimerHandle | undefined;

  constructor(options: SystemTurnTimerSchedulerOptions = {}) {
    this.clock = options.clock ?? (() => Date.now());
    this.setTimeoutFn = options.setTimeoutFn ?? ((run, delayMs) => setTimeout(run, delayMs));
    this.clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
  }

  schedule(fireAt: number, run: () => void): void {
    this.cancel();
    const delayMs = Math.max(0, fireAt - this.clock());
    this.handle = this.setTimeoutFn(run, delayMs);
  }

  cancel(): void {
    if (this.handle !== undefined) {
      this.clearTimeoutFn(this.handle);
      this.handle = undefined;
    }
  }
}
