import type { Ticker } from 'pixi.js';
import { SPIN_TIMINGS } from '../config/layout';
import type { ReelGrid } from './ReelGrid';
import { backOut, columnStopTimeMs, motionOffsetPx, type ColumnPlan } from './spinTimeline';

/**
 * Plays the purely visual spin timeline (plan section 14): blur fade-in,
 * vertical wrap motion, staggered stops with a back-out bounce, and the
 * reduced-motion variant. The SpinResult is fixed before play() is called;
 * this class only displays it and never touches state or money.
 */
export class SpinAnimator {
  /** DEV/test hook: multiplies elapsed time; 1 in production. */
  timeScale = 1;
  private playing = false;

  constructor(private readonly ticker: Ticker) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  async play(grid: ReelGrid, plans: readonly ColumnPlan[], reducedMotion: boolean): Promise<void> {
    if (this.playing) throw new Error('A spin animation is already playing');
    this.playing = true;
    try {
      if (reducedMotion) {
        await this.playReduced(grid, plans);
      } else {
        await this.playFull(grid, plans);
      }
    } finally {
      this.playing = false;
    }
  }

  /** Full timeline: 0-180 blur fade, motion, stops at 700+120*column. */
  private playFull(grid: ReelGrid, plans: readonly ColumnPlan[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let elapsed = 0;
      const stopped = plans.map(() => false);
      const update = (): void => {
        // A frame-time exception must not strand the promise (plan section 18):
        // the callback detaches itself and rejects so the caller can recover.
        try {
          elapsed += this.ticker.deltaMS * this.timeScale;

          if (elapsed < SPIN_TIMINGS.blurFadeInMs) {
            const progress = elapsed / SPIN_TIMINGS.blurFadeInMs;
            for (const column of grid.columns) column.setBlurFade(progress);
            return;
          }

          let allDone = true;
          grid.columns.forEach((column, index) => {
            const stopStart = columnStopTimeMs(index);
            if (elapsed < stopStart) {
              // Still spinning: ensure the fade is complete, keep wrapping.
              column.setBlurFade(1);
              column.setMotionOffset(motionOffsetPx(elapsed));
              allDone = false;
              return;
            }
            const plan = plans[index];
            if (plan === undefined) throw new Error(`Missing plan for column ${index}`);
            if (!stopped[index]) {
              stopped[index] = true;
              column.beginStop(plan);
            }
            const t = Math.min(1, (elapsed - stopStart) / SPIN_TIMINGS.stopTransitionMs);
            column.setStopOffset(SPIN_TIMINGS.stopBouncePx * (1 - backOut(t)));
            if (t < 1) allDone = false;
          });

          if (allDone) {
            for (const column of grid.columns) column.setStopOffset(0);
            this.ticker.remove(update);
            resolve();
          }
        } catch (error) {
          this.ticker.remove(update);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
      this.ticker.add(update);
    });
  }

  /**
   * Reduced motion (UI/UX 11.3): no translation or bounce; the new symbols
   * fade in over 120 ms and the whole spin lasts 250 ms.
   */
  private playReduced(grid: ReelGrid, plans: readonly ColumnPlan[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let elapsed = 0;
      const fadeStart = SPIN_TIMINGS.reducedTotalMs - SPIN_TIMINGS.reducedFadeMs;
      let switched = false;
      const update = (): void => {
        try {
          elapsed += this.ticker.deltaMS * this.timeScale;
          if (elapsed < fadeStart) return;
          if (!switched) {
            switched = true;
            grid.showFinal(plans);
          }
          const t = Math.min(1, (elapsed - fadeStart) / SPIN_TIMINGS.reducedFadeMs);
          for (const column of grid.columns) column.setSymbolAlpha(t);
          if (elapsed >= SPIN_TIMINGS.reducedTotalMs) {
            for (const column of grid.columns) column.setSymbolAlpha(1);
            this.ticker.remove(update);
            resolve();
          }
        } catch (error) {
          this.ticker.remove(update);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
      this.ticker.add(update);
    });
  }
}
