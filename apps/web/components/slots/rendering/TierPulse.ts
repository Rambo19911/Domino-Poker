import type { Graphics, Ticker } from 'pixi.js';
import { TIER_PULSE } from '../config/layout';

/**
 * Drives every tier perimeter outline with one named ticker callback
 * (UI/UX section 6.4.1). Reduced motion is honoured live: when the media
 * preference flips, pulsing stops and the outlines settle on a static alpha.
 */
export class TierPulse {
  private readonly outlines = new Set<Graphics>();
  private readonly media = window.matchMedia('(prefers-reduced-motion: reduce)');
  private elapsedMs = 0;
  private attached = false;

  private readonly onTick = (): void => {
    this.elapsedMs += this.ticker.deltaMS;
    const phase = (this.elapsedMs % TIER_PULSE.periodMs) / TIER_PULSE.periodMs;
    const wave = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
    const alpha = TIER_PULSE.minAlpha + wave * (TIER_PULSE.maxAlpha - TIER_PULSE.minAlpha);
    for (const outline of this.outlines) outline.alpha = alpha;
  };

  private readonly onMediaChange = (): void => this.applyMode();

  constructor(private readonly ticker: Ticker) {
    this.media.addEventListener('change', this.onMediaChange);
    this.applyMode();
  }

  register(outline: Graphics): void {
    outline.alpha = TIER_PULSE.reducedMotionAlpha;
    this.outlines.add(outline);
  }

  unregister(outline: Graphics): void {
    this.outlines.delete(outline);
  }

  private applyMode(): void {
    const reduced = this.media.matches;
    if (reduced && this.attached) {
      this.ticker.remove(this.onTick);
      this.attached = false;
      for (const outline of this.outlines) outline.alpha = TIER_PULSE.reducedMotionAlpha;
    } else if (!reduced && !this.attached) {
      this.ticker.add(this.onTick);
      this.attached = true;
    }
  }

  destroy(): void {
    if (this.attached) this.ticker.remove(this.onTick);
    this.media.removeEventListener('change', this.onMediaChange);
    this.outlines.clear();
  }
}
