import { Text, type Ticker } from 'pixi.js';
import { COLORS, FONTS, MIN_VALUE_FONT_SIZE, type TextSpec } from '../config/layout';

export interface ValueTextOptions {
  readonly fill?: string;
  readonly shadowColor?: string;
}

/**
 * Creates a centred dynamic value text per UI/UX section 7.3: Georgia stack,
 * gold fill and a `0 2px 2px` drop shadow, anchored on the spec centre point.
 */
export function createValueText(spec: TextSpec, options: ValueTextOptions = {}): Text {
  const text = new Text({
    text: '',
    style: {
      fontFamily: [...FONTS.numbers],
      fontSize: spec.fontSize,
      fontWeight: String(spec.fontWeight) as '600' | '700',
      fill: options.fill ?? COLORS.gold100,
      dropShadow: {
        color: options.shadowColor ?? COLORS.brown900,
        alpha: 1,
        angle: Math.PI / 2,
        blur: 2,
        distance: 2,
      },
    },
  });
  text.anchor.set(0.5);
  text.position.set(spec.center.x, spec.center.y);
  return text;
}

/**
 * Sets the value and shrinks it to the spec bounds. The scale never drops the
 * effective font size below 30 px and the text is never ellipsis-clipped.
 */
export function setValueText(text: Text, value: string, spec: TextSpec): void {
  text.text = value;
  text.scale.set(1);
  if (text.width <= spec.bounds.width) return;
  const fitScale = spec.bounds.width / text.width;
  const minScale = MIN_VALUE_FONT_SIZE / spec.fontSize;
  text.scale.set(Math.max(fitScale, minScale));
}

/** en-US grouped coin formatting (UI/UX section 2): `100,000`, never `100 000`. */
export function formatCoins(value: bigint): string {
  return value.toLocaleString('en-US');
}

/** Bet-change texts swap with a short fade-in (UI/UX section 9.2). */
export function startFadeIn(target: { alpha: number }, ticker: Ticker, durationMs: number): void {
  target.alpha = 0;
  let elapsed = 0;
  const update = (): void => {
    elapsed += ticker.deltaMS;
    target.alpha = Math.min(1, elapsed / durationMs);
    if (elapsed >= durationMs) ticker.remove(update);
  };
  ticker.add(update);
}
