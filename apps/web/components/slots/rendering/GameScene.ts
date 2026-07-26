import { Assets, Container, Sprite, type Text, type Texture, type Ticker } from 'pixi.js';
import { totalBetOf, type GameState } from '../app/gameState';
import type { SoundPlayer } from '../audio/SoundPlayer';
import { getAssetDefinition, type AssetId, type Rect } from '../config/assetManifest';
import { COLORS, JACKPOT_VALUE_TEXT, RULES_HIT_AREA } from '../config/layout';
import { createDominoId, type SymbolId } from '@domino-poker/core/slots';
import type { SpinResult } from '@domino-poker/core/slots';
import { Hud, HudButton, staticButtonVisual, type HudHandlers } from './Hud';
import { LayerStack, type LayerName } from './LayerStack';
import { ReelGrid } from './ReelGrid';
import { SpinAnimator } from './SpinAnimator';
import { planColumns, type ColumnPlan } from './spinTimeline';
import { TierPulse } from './TierPulse';
import { createValueText, formatCoins, setValueText, startFadeIn } from './valueText';
import { BET_CHANGE_FADE_MS } from './winTimeline';
import { WinPresenter } from './WinPresenter';

const d = (a: number, b: number): SymbolId => createDominoId(a, b);

/** HUD handlers plus the header controls the scene owns itself. */
export interface SceneHandlers extends HudHandlers {
  readonly onRules: () => void;
}

/**
 * Decorative idle grid shown before the first spin; every later grid comes
 * from a fixed SpinResult. The mix exercises dominoes, all four majors, Wild
 * and Jackpot for the screenshot verification.
 */
const INITIAL_PLANS: readonly ColumnPlan[] = [
  { kind: 'cells', symbols: [d(6, 6), 'WILD', d(0, 1)] },
  { kind: 'cells', symbols: ['VASE', d(1, 6), 'SCARAB'] },
  { kind: 'cells', symbols: [d(0, 0), 'BOOK', d(5, 5)] },
  { kind: 'cells', symbols: ['SCROLL', d(3, 4), d(4, 6)] },
  { kind: 'cells', symbols: [d(2, 5), 'JACKPOT', d(1, 1)] },
];

/**
 * Builds the full 1920x1080 game screen on the layer stack, renders GameState
 * values and plays the purely visual spin animation over the reel grid.
 */
export class GameScene {
  readonly layers = new LayerStack();
  readonly reelGrid: ReelGrid;
  readonly animator: SpinAnimator;
  readonly presenter: WinPresenter;
  private readonly ticker: Ticker;
  private readonly pulse: TierPulse;
  private readonly hud: Hud;
  private readonly rulesButton: HudButton;
  private readonly jackpotText: Text;
  private lastLineBet: number | null = null;

  constructor(ticker: Ticker, handlers: SceneHandlers, sounds?: SoundPlayer) {
    this.ticker = ticker;
    this.pulse = new TierPulse(ticker);
    this.animator = new SpinAnimator(ticker);
    this.hud = new Hud(ticker, handlers);

    this.addStatic('A003', 'background'); // Background
    this.addStatic('A027', 'frame'); // Temple
    this.addStatic('A026', 'reelBackground'); // SlotMachine3x5

    // The gold win-line core sits behind the symbols but above the reel
    // background (UI/UX 12.1), so its underlay precedes the reel grid.
    const winLineUnderlay = new Container();
    winLineUnderlay.label = 'win-line-underlay';
    this.reelGrid = new ReelGrid(this.pulse);
    this.reelGrid.showFinal(INITIAL_PLANS);
    this.layers.get('symbols').addChild(winLineUnderlay, this.reelGrid.container);
    this.presenter = new WinPresenter(
      ticker,
      this.reelGrid,
      winLineUnderlay,
      this.layers.get('winEffects'),
      sounds,
    );

    this.addStatic('A019', 'header'); // Jackpot label
    this.addStatic('A025', 'header'); // Ra ornament (header bounds)
    // Rules button (UI/UX 8.1): interactive, 96x96 hit area (UI/UX 20.1).
    this.rulesButton = new HudButton(
      'rules',
      staticButtonVisual('A011', 'A012'),
      RULES_HIT_AREA,
      handlers.onRules,
    );
    this.layers.get('header').addChild(this.rulesButton.control);
    this.jackpotText = createValueText(JACKPOT_VALUE_TEXT, {
      fill: COLORS.jackpotCyan,
      shadowColor: COLORS.jackpotShadow,
    });
    this.layers.get('header').addChild(this.jackpotText);

    this.layers.get('hud').addChild(this.hud.container);
  }

  /** Places a static-bounds asset; multi-static assets use their first bounds. */
  private addStatic(id: AssetId, layer: LayerName): void {
    const definition = getAssetDefinition(id);
    let bounds: Rect;
    if (definition.placement.kind === 'static') {
      bounds = definition.placement.bounds;
    } else if (definition.placement.kind === 'multi-static') {
      const first = definition.placement.bounds[0];
      if (first === undefined) throw new Error(`Empty multi-static bounds for ${id}`);
      bounds = first;
    } else {
      throw new Error(`Asset ${id} is not statically placed`);
    }
    const sprite = new Sprite(Assets.get<Texture>(id));
    sprite.position.set(bounds.x, bounds.y);
    sprite.width = bounds.width;
    sprite.height = bounds.height;
    sprite.label = definition.role;
    this.layers.get(layer).addChild(sprite);
  }

  /** Plays the fixed result's spin animation; resolves when all reels stand. */
  async playSpin(result: SpinResult): Promise<void> {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await this.animator.play(this.reelGrid, planColumns(result.grid), reduced);
  }

  /** Resolves once the HUD Balance/Win transition finished (UI/UX 9.3). */
  waitForHudValues(): Promise<void> {
    return this.hud.waitForValueAnimation();
  }

  /** Win presentation over the settled result (UI/UX sections 9.4 and 12). */
  async presentWin(result: SpinResult): Promise<void> {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    await this.presenter.present(result, reduced);
  }

  /** Fallback per plan section 18: show the final grid without animation. */
  showResultInstant(result: SpinResult): void {
    this.reelGrid.showFinal(planColumns(result.grid));
  }

  /** DEV/test hook: accelerates both the spin and the win presentation. */
  setTimeScale(factor: number): void {
    this.animator.timeScale = factor;
    this.presenter.timeScale = factor;
  }

  /** Rejected spin feedback (plan 15.2). */
  flashInsufficientBalance(): void {
    this.hud.flashInsufficientBalance();
  }

  update(state: GameState): void {
    this.hud.update(state);
    // Rules is disabled outside IDLE (UI/UX 8.1).
    this.rulesButton.setEnabled(state.phase === 'IDLE');
    if (this.lastLineBet !== state.lineBet) {
      const isBetChange = this.lastLineBet !== null;
      this.lastLineBet = state.lineBet;
      const jackpot = totalBetOf(state.lineBet) * 100n;
      setValueText(this.jackpotText, formatCoins(jackpot), JACKPOT_VALUE_TEXT);
      if (isBetChange) startFadeIn(this.jackpotText, this.ticker, BET_CHANGE_FADE_MS);
    }
  }

  /**
   * Atbrīvo to, kas nepieder Pixi kokam. `app.destroy()` novāc displeja objektus un
   * ticker'i, bet `TierPulse` ir reģistrējis klausītāju uz `window.matchMedia`, kas
   * pārdzīvotu dialoga aizvēršanu un krātos ar katru atkārtotu atvēršanu.
   */
  destroy(): void {
    this.pulse.destroy();
  }
}
