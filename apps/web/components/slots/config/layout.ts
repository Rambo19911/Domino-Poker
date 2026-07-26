import type { Point, Rect } from './assetManifest';

/**
 * Non-asset layout constants from the UI/UX spec (docs/03, sections 6-10, 19).
 * Asset bounds live in the asset manifest; this file only holds text anchors,
 * programmatic panels and design tokens that have no PNG of their own.
 */

export interface TextSpec {
  readonly center: Point;
  readonly bounds: Rect;
  readonly fontSize: number;
  readonly fontWeight: 600 | 700;
}

/** UI/UX section 7.3 — HUD dynamic value texts. */
export const HUD_TEXTS = {
  lines: {
    center: { x: 316, y: 1012 },
    bounds: { x: 250, y: 983, width: 132, height: 58 },
    fontSize: 42,
    fontWeight: 700,
  },
  totalBet: {
    center: { x: 585, y: 1012 },
    bounds: { x: 520, y: 983, width: 130, height: 58 },
    fontSize: 42,
    fontWeight: 700,
  },
  balance: {
    center: { x: 1336, y: 1012 },
    bounds: { x: 1230, y: 983, width: 212, height: 58 },
    fontSize: 38,
    fontWeight: 600,
  },
  win: {
    center: { x: 1602, y: 1012 },
    bounds: { x: 1510, y: 983, width: 184, height: 58 },
    fontSize: 38,
    fontWeight: 600,
  },
} as const satisfies Record<string, TextSpec>;

/** UI/UX section 6.2 — Jackpot header value (100 x Total Bet). */
export const JACKPOT_VALUE_TEXT = {
  center: { x: 965, y: 131 },
  bounds: { x: 781, y: 107, width: 368, height: 48 },
  fontSize: 36,
  fontWeight: 700,
} as const satisfies TextSpec;

/** UI/UX section 7.1 — the Lines panel is programmatic (no PNG asset). */
export const LINES_PANEL_BOUNDS: Rect = { x: 208, y: 948, width: 216, height: 124 };

/**
 * UI/UX section 7.2 — non-overlapping pointer hit areas in design pixels.
 * The decorative button PNGs overlap; the hit rectangles never do.
 */
export const HUD_HIT_AREAS = {
  minus: { x: 458, y: 976, width: 70, height: 72 },
  plus: { x: 643, y: 976, width: 70, height: 72 },
  maxBet: { x: 719, y: 950, width: 104, height: 130 },
  spin: { x: 824, y: 944, width: 260, height: 136 },
  auto: { x: 1085, y: 950, width: 97, height: 130 },
} as const satisfies Record<string, Rect>;

/**
 * UI/UX section 20.1 — the Rules button hit area is 96x96, centred on the
 * button visual `(1819,8,79,80)` and clamped to the top screen edge.
 */
export const RULES_HIT_AREA: Rect = { x: 1810, y: 0, width: 96, height: 96 };

/** UI/UX section 10.1 — loading screen elements without their own asset. */
export const PRELOADER_LAYOUT = {
  ra: { x: 751, y: 420, width: 418, height: 92 },
  bar: { x: 812, y: 520, width: 296, height: 70 },
  barMask: { x: 811, y: 519, width: 297, height: 72 },
  percent: { x: 860, y: 600, width: 200, height: 48 },
  status: { x: 660, y: 654, width: 600, height: 48 },
} as const satisfies Record<string, Rect>;

/** Minimum shrunk font size for HUD values (UI/UX section 7.3). */
export const MIN_VALUE_FONT_SIZE = 30;

/**
 * Uniform domino upscale (UI/UX section 6.4): fills the 215x215 cell more
 * densely while preserving the aspect ratio, so pips are never distorted.
 * Tallest tile stays inside the cell: 162 * 1.3 = 210.6 < 215.
 */
export const DOMINO_RENDER_SCALE = 1.3;

export interface TierStyle {
  /** Subtle multiplicative sprite tint. */
  readonly tint: number;
  /** Perimeter glow colour. */
  readonly outline: number;
}

/**
 * Idle-state domino tier colouring (UI/UX section 6.4): trump tiles carry a
 * light gold cast, ace tiles a light green cast, each with a softly pulsing
 * outline along the tile perimeter.
 */
export const TIER_STYLES: Readonly<Partial<Record<string, TierStyle>>> = {
  'royal-trump': { tint: 0xffd478, outline: 0xf2c14e },
  'high-trump': { tint: 0xffd478, outline: 0xf2c14e },
  'low-trump': { tint: 0xffd478, outline: 0xf2c14e },
  ace: { tint: 0xa9e698, outline: 0x6fd06f },
};

/** Perimeter pulse: alpha oscillates between the bounds over one period. */
export const TIER_PULSE = {
  minAlpha: 0.3,
  maxAlpha: 0.85,
  periodMs: 1600,
  strokeWidth: 4,
  cornerRadius: 14,
  /** Static alpha used when prefers-reduced-motion is set. */
  reducedMotionAlpha: 0.55,
} as const;

/** Spin animation timeline (plan section 14.1 / UI/UX section 11). */
export const SPIN_TIMINGS = {
  /** 0..180 ms: final symbols fade into their blur textures. */
  blurFadeInMs: 180,
  /** First column stops at 700 ms. */
  firstStopMs: 700,
  /** Each next column stops 120 ms later. */
  staggerMs: 120,
  /** Blur-to-final back-out transition per column. */
  stopTransitionMs: 80,
  /** Maximum stop bounce. */
  stopBouncePx: 6,
  /** Vertical blur wrap amplitude. */
  motionAmplitudePx: 20,
  /** Duration of one wrap cycle of the blur motion. */
  motionCycleMs: 90,
  /** prefers-reduced-motion: total spin duration and column fade. */
  reducedTotalMs: 250,
  reducedFadeMs: 120,
} as const;

/** UI/UX section 19.1 — colour tokens used by programmatic drawing. */
export const COLORS = {
  gold100: '#FFF0C9',
  gold400: '#F2C14E',
  gold700: '#9A5A10',
  cyan400: '#28C7F2',
  jackpotCyan: '#17BCE8',
  error600: '#B93A2D',
  brown900: '#1A0904',
  jackpotShadow: '#3A2107',
  pageBackground: '#06030C',
} as const;

/** UI/UX section 19.2 — font stacks (no font assets exist). */
export const FONTS = {
  numbers: ['Georgia', 'Times New Roman', 'serif'],
  dialog: ['Arial', 'sans-serif'],
} as const;
