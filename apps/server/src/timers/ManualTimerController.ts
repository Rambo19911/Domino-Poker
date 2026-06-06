import type { Clock, TurnTimerScheduler } from "./TurnTimerScheduler.js";

/**
 * Deterministisks laika/timeru kontrolieris testiem un simulācijām — bez īsta
 * `setTimeout`. Tas vienlaikus nodrošina `now()` pulksteni un `TurnTimerScheduler`;
 * laiku virza ar `advanceTo`, kas izpilda gaidošo timeri, kad pienācis tā laiks.
 */
export class ManualTimerController {
  private current: number;
  private pending: { readonly fireAt: number; readonly run: () => void } | undefined;

  constructor(initialNow = 0) {
    this.current = initialNow;
  }

  /** Pašreizējais laiks (ms). */
  readonly now: Clock = () => this.current;

  readonly scheduler: TurnTimerScheduler = {
    schedule: (fireAt, run) => {
      this.pending = { fireAt, run };
    },
    cancel: () => {
      this.pending = undefined;
    }
  };

  /**
   * Pārvieto laiku uz `target`, izpildot gaidošo timeri, ja tā `fireAt <= target`.
   * Izpildes brīdī pulkstenis tiek uzstādīts uz timera `fireAt`, lai izpildītā
   * darbība (piem. TURN_TIMEOUT) redzētu korektu `now`.
   */
  advanceTo(target: number): void {
    while (this.pending !== undefined && this.pending.fireAt <= target) {
      const timer = this.pending;
      this.pending = undefined;
      this.current = timer.fireAt;
      timer.run();
    }
    if (target > this.current) {
      this.current = target;
    }
  }

  /** Uzstāda laiku bez timeru izpildes. */
  set(now: number): void {
    this.current = now;
  }

  hasPendingTimer(): boolean {
    return this.pending !== undefined;
  }
}
