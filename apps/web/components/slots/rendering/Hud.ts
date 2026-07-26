import {
  Assets,
  ColorMatrixFilter,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  type Texture,
  type Ticker,
} from 'pixi.js';
import { totalBetOf, type GameState } from '../app/gameState';
import { getAssetDefinition, type AssetId, type Rect } from '../config/assetManifest';
import { COLORS, FONTS, HUD_HIT_AREAS, HUD_TEXTS, LINES_PANEL_BOUNDS } from '../config/layout';
import { SLOT_MATH_CONFIG } from '@domino-poker/core/slots';
import { BET_CHANGE_FADE_MS, BET_DEDUCTION_TRANSITION_MS, countUpDurationMs } from './winTimeline';
import { createValueText, formatCoins, setValueText, startFadeIn } from './valueText';

/** Non-interactive HUD panel frames in z-order. */
const PANEL_SPRITES: readonly AssetId[] = ['A028', 'A004', 'A029'];

const PRESSED_OFFSET_PX = 2;
const PRESSED_SCALE = 0.96;
const DISABLED_ALPHA = 0.45;

/** Shared 20% desaturation for disabled controls (UI/UX 8). */
const DISABLED_FILTER = (() => {
  const filter = new ColorMatrixFilter();
  filter.saturate(-0.2, false);
  return filter;
})();

export interface ButtonVisual {
  readonly bounds: Rect;
  readonly defaultTexture: AssetId;
  readonly hoverTexture: AssetId;
}

/** Builds a ButtonVisual from a statically placed asset and its hover pair. */
export function staticButtonVisual(id: AssetId, hover: AssetId): ButtonVisual {
  const definition = getAssetDefinition(id);
  if (definition.placement.kind !== 'static') throw new Error(`${id} is not static`);
  return { bounds: definition.placement.bounds, defaultTexture: id, hoverTexture: hover };
}

/**
 * One HUD button: a stationary control container carries the documented
 * non-overlapping hit rectangle (UI/UX 7.2); only the child sprite moves for
 * the +2 px pressed state (UI/UX 8). Visuals can be swapped (Auto <-> Hold).
 */
export class HudButton {
  readonly control = new Container();
  private readonly sprite: Sprite;
  private visual: ButtonVisual;
  private pressed = false;
  private hovered = false;
  private enabled = false;

  constructor(label: string, visual: ButtonVisual, hit: Rect, onPress: () => void) {
    this.visual = visual;
    this.control.label = label;
    this.control.cursor = 'pointer';
    this.control.eventMode = 'none';
    this.control.hitArea = new Rectangle(hit.x, hit.y, hit.width, hit.height);
    this.sprite = new Sprite(Assets.get<Texture>(visual.defaultTexture));
    this.applyVisual();
    this.control.addChild(this.sprite);

    this.control.on('pointerover', () => {
      this.hovered = true;
      this.refreshTexture();
    });
    this.control.on('pointerout', () => {
      this.hovered = false;
      this.release();
      this.refreshTexture();
    });
    this.control.on('pointerdown', () => {
      // Pressed state (UI/UX 8): scale 0.96 around the centre plus +2 px.
      this.pressed = true;
      const { bounds } = this.visual;
      this.sprite.width = bounds.width * PRESSED_SCALE;
      this.sprite.height = bounds.height * PRESSED_SCALE;
      this.sprite.position.set(
        bounds.x + (bounds.width * (1 - PRESSED_SCALE)) / 2,
        bounds.y + (bounds.height * (1 - PRESSED_SCALE)) / 2 + PRESSED_OFFSET_PX,
      );
    });
    this.control.on('pointerupoutside', () => this.release());
    this.control.on('pointerup', () => {
      if (!this.pressed) return;
      this.release();
      onPress();
    });
  }

  private applyVisual(): void {
    const { bounds } = this.visual;
    this.sprite.texture = Assets.get<Texture>(
      this.hovered && this.enabled ? this.visual.hoverTexture : this.visual.defaultTexture,
    );
    this.sprite.position.set(bounds.x, bounds.y);
    this.sprite.width = bounds.width;
    this.sprite.height = bounds.height;
  }

  private refreshTexture(): void {
    this.sprite.texture = Assets.get<Texture>(
      this.hovered && this.enabled ? this.visual.hoverTexture : this.visual.defaultTexture,
    );
  }

  private release(): void {
    this.pressed = false;
    const { bounds } = this.visual;
    this.sprite.width = bounds.width;
    this.sprite.height = bounds.height;
    this.sprite.position.set(bounds.x, bounds.y);
  }

  /** Swaps the shown asset pair and bounds (Auto Spin <-> Hold, UI/UX 8.5). */
  setVisual(visual: ButtonVisual): void {
    if (visual === this.visual) return;
    this.visual = visual;
    this.release();
    this.applyVisual();
  }

  /** Disabled controls keep their asset at alpha 0.45 + 20% grayscale (UI/UX 8). */
  setEnabled(enabled: boolean, dimWhenDisabled = true): void {
    this.enabled = enabled;
    this.control.eventMode = enabled ? 'static' : 'none';
    const dimmed = !enabled && dimWhenDisabled;
    this.sprite.alpha = dimmed ? DISABLED_ALPHA : 1;
    this.sprite.filters = dimmed ? [DISABLED_FILTER] : [];
    if (!enabled) {
      this.hovered = false;
      this.release();
    }
    this.refreshTexture();
  }
}

export interface HudHandlers {
  readonly onSpin: () => void;
  readonly onBetMinus: () => void;
  readonly onBetPlus: () => void;
  readonly onMaxBet: () => void;
  readonly onAutoOpen: () => void;
  readonly onAutoStop: () => void;
}

const AUTO_VISUAL: ButtonVisual = {
  bounds: { x: 1014, y: 962, width: 188, height: 118 },
  defaultTexture: 'A002',
  hoverTexture: 'A001',
};
/** Hold replaces the Auto asset while autoplay runs (UI/UX 8.5). */
const HOLD_VISUAL: ButtonVisual = {
  bounds: { x: 1045, y: 983, width: 126, height: 76 },
  defaultTexture: 'A018',
  hoverTexture: 'A017',
};

/**
 * HUD per UI/UX section 7: panel frames, all five controls with the section
 * 7.2 hit areas, dynamic values with the 9.3 count-up transitions and the
 * active Auto Spin (Hold) state.
 */
export class Hud {
  readonly container = new Container();
  private readonly ticker: Ticker;
  private readonly totalBetText: Text;
  private readonly balanceText: Text;
  private readonly winText: Text;
  private readonly buttons: Record<'minus' | 'plus' | 'maxBet' | 'spin' | 'auto', HudButton>;
  private readonly holdGlow: Graphics;
  private autoActive = false;
  private lastLineBet: number | null = null;

  // Displayed (possibly mid-animation) values; targets live in GameState.
  private shownBalance = 0;
  private shownWin = 0;
  private valueAnim: {
    fromBalance: number;
    toBalance: bigint;
    fromWin: number;
    toWin: bigint;
    elapsedMs: number;
    durationMs: number;
  } | null = null;

  private valueWaiters: (() => void)[] = [];

  private readonly onValueTick = (): void => {
    const anim = this.valueAnim;
    if (anim === null) {
      this.ticker.remove(this.onValueTick);
      this.flushValueWaiters();
      return;
    }
    anim.elapsedMs += this.ticker.deltaMS;
    const t = Math.min(1, anim.elapsedMs / anim.durationMs);
    this.shownBalance = anim.fromBalance + (Number(anim.toBalance) - anim.fromBalance) * t;
    this.shownWin = anim.fromWin + (Number(anim.toWin) - anim.fromWin) * t;
    this.renderValues();
    if (t >= 1) {
      this.valueAnim = null;
      this.ticker.remove(this.onValueTick);
      this.flushValueWaiters();
    }
  };

  private flushValueWaiters(): void {
    const waiters = this.valueWaiters;
    this.valueWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /**
   * Resolves once the Balance/Win transition has finished (UI/UX 9.3). Driven
   * by the same ticker as the presentation, so a throttled tab pauses both.
   */
  waitForValueAnimation(): Promise<void> {
    if (this.valueAnim === null) return Promise.resolve();
    return new Promise((resolve) => this.valueWaiters.push(resolve));
  }

  constructor(ticker: Ticker, handlers: HudHandlers) {
    this.ticker = ticker;
    this.container.label = 'hud';
    this.container.addChild(this.createLinesPanel());

    for (const id of PANEL_SPRITES) {
      const definition = getAssetDefinition(id);
      if (definition.placement.kind !== 'static') {
        throw new Error(`HUD asset ${id} is not statically placed`);
      }
      const sprite = new Sprite(Assets.get<Texture>(id));
      const { bounds } = definition.placement;
      sprite.position.set(bounds.x, bounds.y);
      sprite.width = bounds.width;
      sprite.height = bounds.height;
      sprite.label = definition.role;
      this.container.addChild(sprite);
    }

    this.buttons = {
      minus: new HudButton(
        'bet-minus',
        staticButtonVisual('A007', 'A008'),
        HUD_HIT_AREAS.minus,
        () => handlers.onBetMinus(),
      ),
      plus: new HudButton('bet-plus', staticButtonVisual('A009', 'A010'), HUD_HIT_AREAS.plus, () =>
        handlers.onBetPlus(),
      ),
      maxBet: new HudButton(
        'max-bet',
        staticButtonVisual('A024', 'A023'),
        HUD_HIT_AREAS.maxBet,
        () => handlers.onMaxBet(),
      ),
      // Inactive Auto opens the Auto Spin dialog; the active Hold control
      // requests "stop after the current spin" (UI/UX 8.5).
      auto: new HudButton('auto-spin', AUTO_VISUAL, HUD_HIT_AREAS.auto, () => {
        if (this.autoActive) handlers.onAutoStop();
        else handlers.onAutoOpen();
      }),
      spin: new HudButton('spin', staticButtonVisual('A006', 'A005'), HUD_HIT_AREAS.spin, () =>
        handlers.onSpin(),
      ),
    };
    // Cyan glow marks the active autoplay control (UI/UX 8, state `active`).
    this.holdGlow = new Graphics()
      .roundRect(
        HOLD_VISUAL.bounds.x - 4,
        HOLD_VISUAL.bounds.y - 4,
        HOLD_VISUAL.bounds.width + 8,
        HOLD_VISUAL.bounds.height + 8,
        12,
      )
      .stroke({ color: COLORS.cyan400, width: 3, alpha: 0.9 });
    this.holdGlow.visible = false;
    this.buttons.auto.control.addChildAt(this.holdGlow, 0);
    // Spin added last: its decorative edges overlap Max Bet and Auto Spin.
    this.container.addChild(
      this.buttons.minus.control,
      this.buttons.plus.control,
      this.buttons.maxBet.control,
      this.buttons.auto.control,
      this.buttons.spin.control,
    );

    const linesText = createValueText(HUD_TEXTS.lines);
    setValueText(linesText, String(SLOT_MATH_CONFIG.activeLines), HUD_TEXTS.lines);
    this.totalBetText = createValueText(HUD_TEXTS.totalBet);
    this.balanceText = createValueText(HUD_TEXTS.balance);
    this.winText = createValueText(HUD_TEXTS.win);
    this.container.addChild(linesText, this.totalBetText, this.balanceText, this.winText);
  }

  /** The Lines panel has no PNG (UI/UX 7.1); drawn with the design tokens. */
  private createLinesPanel(): Container {
    const panel = new Container();
    panel.label = 'lines-panel';
    const { x, y, width, height } = LINES_PANEL_BOUNDS;
    panel.addChild(
      new Graphics()
        .roundRect(x, y, width, height, 14)
        .fill({ color: COLORS.brown900, alpha: 0.92 })
        .stroke({ color: COLORS.gold700, width: 3 }),
    );
    const label = new Text({
      text: 'LINES',
      style: {
        fontFamily: [...FONTS.numbers],
        fontSize: 26,
        fontWeight: '700',
        fill: COLORS.gold400,
        letterSpacing: 2,
        dropShadow: { color: COLORS.brown900, alpha: 1, angle: Math.PI / 2, blur: 2, distance: 2 },
      },
    });
    label.anchor.set(0.5);
    label.position.set(x + width / 2, y + 28);
    panel.addChild(label);
    return panel;
  }

  update(state: GameState): void {
    const idle = state.phase === 'IDLE';
    const noAuto = state.autoSpin === null;
    const steps = SLOT_MATH_CONFIG.lineBetSteps;
    const maxBet = steps[steps.length - 1];
    this.buttons.minus.setEnabled(idle && noAuto && state.lineBet > steps[0]!);
    this.buttons.plus.setEnabled(idle && noAuto && state.lineBet < maxBet!);
    this.buttons.maxBet.setEnabled(idle && noAuto && state.lineBet < maxBet!);
    this.buttons.spin.setEnabled(idle);

    const autoActive = state.autoSpin !== null;
    if (autoActive !== this.autoActive) {
      this.autoActive = autoActive;
      this.buttons.auto.setVisual(autoActive ? HOLD_VISUAL : AUTO_VISUAL);
      this.holdGlow.visible = autoActive;
    }
    // Active Hold stays clickable through the whole autoplay (stop request);
    // the inactive Auto button opens the Auto Spin dialog in IDLE (UI/UX 8.5).
    this.buttons.auto.setEnabled(autoActive || idle);

    if (this.lastLineBet !== state.lineBet) {
      const isBetChange = this.lastLineBet !== null;
      this.lastLineBet = state.lineBet;
      setValueText(this.totalBetText, formatCoins(totalBetOf(state.lineBet)), HUD_TEXTS.totalBet);
      if (isBetChange) startFadeIn(this.totalBetText, this.ticker, BET_CHANGE_FADE_MS);
    }

    this.animateValues(state);
  }

  /**
   * Balance/Win transitions (UI/UX 9.3): 150 ms on bet deduction, 300..800 ms
   * count-up on wins; instant when reduced motion is preferred.
   */
  private animateValues(state: GameState): void {
    const targetBalance = state.balance;
    const targetWin = state.lastWin;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const balanceDelta = Number(targetBalance) - this.shownBalance;
    const winChanged = Number(targetWin) !== Math.round(this.shownWin);
    if (balanceDelta === 0 && !winChanged) return;

    // The displayed Win drops to zero instantly when the spin starts; only
    // additions count up (UI/UX 9.3). The balance keeps its 150 ms deduction.
    if (targetWin === 0n && this.shownWin > 0) {
      this.shownWin = 0;
    }

    const durationMs = reduced
      ? 0
      : balanceDelta < 0
        ? BET_DEDUCTION_TRANSITION_MS
        : countUpDurationMs(targetWin, totalBetOf(state.lineBet));
    if (durationMs === 0) {
      this.valueAnim = null;
      this.ticker.remove(this.onValueTick);
      this.shownBalance = Number(targetBalance);
      this.shownWin = Number(targetWin);
      this.renderValues();
      this.flushValueWaiters();
      return;
    }
    if (this.valueAnim === null) this.ticker.add(this.onValueTick);
    this.valueAnim = {
      fromBalance: this.shownBalance,
      toBalance: targetBalance,
      fromWin: this.shownWin,
      toWin: targetWin,
      elapsedMs: 0,
      durationMs,
    };
    this.renderValues();
  }

  private renderValues(): void {
    setValueText(
      this.balanceText,
      formatCoins(BigInt(Math.round(this.shownBalance))),
      HUD_TEXTS.balance,
    );
    setValueText(this.winText, formatCoins(BigInt(Math.round(this.shownWin))), HUD_TEXTS.win);
  }

  private balanceFlashTimer: ReturnType<typeof setTimeout> | null = null;

  /** Rejected spin: the Balance value flashes reddish for 300 ms (plan 15.2). */
  flashInsufficientBalance(): void {
    this.balanceText.style.fill = COLORS.error600;
    if (this.balanceFlashTimer !== null) clearTimeout(this.balanceFlashTimer);
    this.balanceFlashTimer = setTimeout(() => {
      this.balanceText.style.fill = COLORS.gold100;
      this.balanceFlashTimer = null;
    }, 300);
  }
}
