import {
  AnimatedSprite,
  Assets,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
  type Container,
  type Ticker,
} from 'pixi.js';
import {
  ASSET_MANIFEST,
  CELL_POSITIONS,
  COLUMN_POSITIONS,
  SYMBOL_ASSET_IDS,
  getAssetDefinition,
  type AssetId,
} from '../config/assetManifest';
import type { SoundPlayer } from '../audio/SoundPlayer';
import { COLORS, FONTS } from '../config/layout';
import type { SpinResult } from '@domino-poker/core/slots';
import type { ReelGrid } from './ReelGrid';
import {
  planPresentation,
  runCells,
  winLinePoints,
  type LineHighlight,
  type ScatterCell,
} from './winTimeline';

const LINE_DIM_ALPHA = 0.48; // UI/UX 12.1
const SCATTER_DIM_ALPHA = 0.4; // UI/UX 12.3
const PULSE_PERIOD_MS = 320; // UI/UX 12.1
const PULSE_MAX_SCALE = 1.04;
const SHEET_FPS = 24; // UI/UX 12.4
const COIN_FPS = 12;
const PANEL_TEXT_CENTER = { x: 960, y: 600 }; // UI/UX 9.4

const PANEL_ASSET: Record<'huge' | 'mega' | 'jackpot', AssetId> = {
  huge: 'A101',
  mega: 'A103',
  jackpot: 'A102',
};

/** final asset id -> its 24-frame win sheet (from the manifest stateOf links). */
const WIN_SHEET_BY_FINAL: ReadonlyMap<AssetId, AssetId> = (() => {
  const map = new Map<AssetId, AssetId>();
  for (const definition of Object.values(ASSET_MANIFEST)) {
    if (definition.placement.kind === 'atlas' && definition.stateOf !== undefined) {
      map.set(definition.stateOf, definition.id);
    }
  }
  return map;
})();

const sheetTextureCache = new Map<AssetId, readonly Texture[]>();

/** Slices an atlas sheet into its frame textures (row-major, UI/UX 12.4). */
function getSheetTextures(id: AssetId): readonly Texture[] {
  const cached = sheetTextureCache.get(id);
  if (cached !== undefined) return cached;
  const definition = getAssetDefinition(id);
  if (definition.placement.kind !== 'atlas') throw new Error(`Asset ${id} is not an atlas`);
  const base = Assets.get<Texture>(id);
  const { frameSize, frameCount, columns } = definition.placement;
  const frames: Texture[] = [];
  for (let n = 0; n < frameCount; n++) {
    frames.push(
      new Texture({
        source: base.source,
        frame: new Rectangle(
          (n % columns) * frameSize.width,
          Math.floor(n / columns) * frameSize.height,
          frameSize.width,
          frameSize.height,
        ),
      }),
    );
  }
  sheetTextureCache.set(id, frames);
  return frames;
}

/**
 * Plays the win presentation over a settled result (UI/UX sections 9.4, 12):
 * gold floating-run polylines behind the symbols, dimming, scale pulses, 24-frame sheet
 * animations for majors/specials, the scatter phase and the win panels with
 * coin particles. Purely visual — amounts come from the fixed SpinResult.
 */
export class WinPresenter {
  /** DEV/test hook shared with the spin animator via GameScene. */
  timeScale = 1;
  private readonly activeTickers = new Set<() => void>();
  /** Sheet/coin sprites advanced from the owned ticker (autoUpdate off). */
  private readonly liveAnimations = new Set<AnimatedSprite>();
  private animationDriver: (() => void) | null = null;

  constructor(
    private readonly ticker: Ticker,
    private readonly grid: ReelGrid,
    /** Below the symbols (gold line core, UI/UX 12.1). */
    private readonly underlay: Container,
    /** Above the symbols (glows, sheets, panels, particles). */
    private readonly effects: Container,
    /** Optional: the big-win sequence sounds with the overlay panels. */
    private readonly sounds?: SoundPlayer,
  ) {}

  async present(result: SpinResult, reducedMotion: boolean): Promise<void> {
    try {
      for (const phase of planPresentation(result)) {
        switch (phase.kind) {
          case 'idle-pause':
            await this.delay(phase.durationMs);
            break;
          case 'scatter':
            this.beginScatter(phase.cells, reducedMotion);
            this.showPanel('jackpot', phase.amount, phase.durationMs, reducedMotion);
            await this.delay(phase.durationMs);
            this.clearPhase();
            break;
          case 'line':
            this.beginLines([phase.line], phase.glow, reducedMotion);
            await this.delay(phase.durationMs);
            this.clearPhase();
            break;
          case 'all-lines':
            this.beginLines(phase.lines, phase.glow, reducedMotion);
            await this.delay(phase.durationMs);
            this.clearPhase();
            break;
          case 'panel':
            this.showPanel(phase.panel, phase.amount, phase.durationMs, reducedMotion);
            await this.delay(phase.durationMs);
            this.clearPhase();
            break;
        }
      }
    } finally {
      this.clearPhase();
    }
  }

  /** Gold line + glow, run highlighting, dimming and pulses (UI/UX 12.1). */
  private beginLines(lines: readonly LineHighlight[], glow: boolean, reducedMotion: boolean): void {
    for (const line of lines) this.drawWinLine(line, glow);
    const pulseTargets: { setScaleFactor(scale: number): void }[] = [];

    // Every cell covered by any winning run (math v3: runs float on paylines).
    const winningKeys = new Set<string>();
    for (const line of lines) {
      for (const cell of runCells(line)) winningKeys.add(`${cell.row}${cell.column}`);
    }

    this.grid.columns.forEach((column, columnIndex) => {
      if (column.currentMode === 'full-wild') {
        const winning =
          winningKeys.has(`0${columnIndex}`) ||
          winningKeys.has(`1${columnIndex}`) ||
          winningKeys.has(`2${columnIndex}`);
        column.setSymbolAlpha(winning ? 1 : LINE_DIM_ALPHA);
        if (winning && !reducedMotion) {
          const columnPos = COLUMN_POSITIONS[`C${columnIndex}` as 'C0'];
          this.playSheet('A116', columnPos.center, columnPos.bounds);
          column.setFullWildSuppressed(true);
        }
        return;
      }
      column.cellSprites.forEach((cell, row) => {
        const winning = winningKeys.has(`${row}${columnIndex}`);
        cell.setAlpha(winning ? 1 : LINE_DIM_ALPHA);
        if (!winning) return;
        const symbol = cell.currentSymbol;
        const ids = symbol === null ? undefined : SYMBOL_ASSET_IDS.get(symbol);
        const isDomino = ids !== undefined && getAssetDefinition(ids.final).math?.kind === 'domino';
        if (isDomino) {
          // Dominoes keep the scale pulse (UI/UX 12.4); no sheet exists.
          if (!reducedMotion) pulseTargets.push(cell);
        } else if (ids !== undefined && !reducedMotion) {
          const sheet = WIN_SHEET_BY_FINAL.get(ids.final);
          if (sheet !== undefined) {
            const cellPos = CELL_POSITIONS[`P${row}${columnIndex}` as 'P00'];
            this.playSheet(sheet, cellPos.center, cellPos.bounds);
            cell.setSuppressed(true);
          }
        }
      });
    });

    if (pulseTargets.length > 0) this.startPulse(pulseTargets);
  }

  /** Scatter phase: glow + sheet on every Jackpot cell, others dim (12.3). */
  private beginScatter(cells: readonly ScatterCell[], reducedMotion: boolean): void {
    const winningKeys = new Set(cells.map((cell) => `${cell.row}${cell.column}`));
    this.grid.columns.forEach((column, columnIndex) => {
      if (column.currentMode === 'full-wild') {
        column.setSymbolAlpha(SCATTER_DIM_ALPHA);
        return;
      }
      column.cellSprites.forEach((cell, row) => {
        const winning = winningKeys.has(`${row}${columnIndex}`);
        cell.setAlpha(winning ? 1 : SCATTER_DIM_ALPHA);
      });
    });
    for (const cell of cells) {
      const center = CELL_POSITIONS[`P${cell.row}${cell.column}` as 'P00'].center;
      const glow = new Graphics()
        .roundRect(center.x - 107.5, center.y - 107.5, 215, 215, 16)
        .stroke({ color: COLORS.cyan400, width: 5, alpha: 0.9 })
        .roundRect(center.x - 101.5, center.y - 101.5, 203, 203, 14)
        .stroke({ color: COLORS.gold400, width: 3, alpha: 0.8 });
      this.effects.addChild(glow);
      if (!reducedMotion) {
        const cellPos = CELL_POSITIONS[`P${cell.row}${cell.column}` as 'P00'];
        this.playSheet('A111', cellPos.center, cellPos.bounds); // Jackpot sheet
        const column = this.grid.columns[cell.column];
        column?.cellSprites[cell.row]?.setSuppressed(true);
      }
    }
  }

  private drawWinLine(line: LineHighlight, glow: boolean): void {
    const points = winLinePoints(line);
    const graphics = new Graphics();
    const tracePath = (): Graphics => {
      const first = points[0] as { x: number; y: number };
      graphics.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i++) {
        const point = points[i] as { x: number; y: number };
        graphics.lineTo(point.x, point.y);
      }
      return graphics;
    };
    // Approximated 14 px outer glow (UI/UX 12.1) with layered strokes; the
    // glow is reserved for wins of at least the total bet (UI/UX 9.4), the
    // 8 px core line always sits below the symbols in the underlay container.
    if (glow) {
      for (const [width, alpha] of [
        [26, 0.1],
        [18, 0.18],
        [12, 0.28],
      ] as const) {
        tracePath().stroke({ color: 0xff8a1d, width, alpha, cap: 'round', join: 'round' });
      }
    }
    tracePath().stroke({ color: 0xffd45a, width: 8, cap: 'round', join: 'round' });
    this.underlay.addChild(graphics);
  }

  /** Win overlay panel with the amount text and coin particles (9.4, 12.4). */
  private showPanel(
    panel: 'huge' | 'mega' | 'jackpot',
    amount: bigint,
    durationMs: number,
    reducedMotion: boolean,
  ): void {
    const id = PANEL_ASSET[panel];
    // HUGE WIN / MEGA WIN / JACKPOT all sound the moment their panel shows.
    this.sounds?.play('bigWin');
    const definition = getAssetDefinition(id);
    if (definition.placement.kind !== 'static') throw new Error(`Panel ${id} is not static`);
    const { bounds } = definition.placement;
    const sprite = new Sprite(Assets.get<Texture>(id));
    sprite.position.set(bounds.x, bounds.y);
    sprite.width = bounds.width;
    sprite.height = bounds.height;
    this.effects.addChild(sprite);

    const amountText = new Text({
      text: amount.toLocaleString('en-US'),
      style: {
        fontFamily: [...FONTS.numbers],
        fontSize: 48,
        fontWeight: '700',
        fill: COLORS.gold100,
        dropShadow: { color: COLORS.brown900, alpha: 1, angle: Math.PI / 2, blur: 3, distance: 3 },
      },
    });
    amountText.anchor.set(0.5);
    amountText.position.set(PANEL_TEXT_CENTER.x, PANEL_TEXT_CENTER.y);
    this.effects.addChild(amountText);

    if (!reducedMotion) this.startCoins(durationMs);
  }

  /** 8..16 spinning coins over the panel, 12 fps, random paths (UI/UX 12.4). */
  private startCoins(durationMs: number): void {
    const textures = getSheetTextures('A110');
    const coins: { sprite: AnimatedSprite; vx: number; vy: number }[] = [];
    const count = 8 + Math.floor(Math.random() * 9);
    for (let i = 0; i < count; i++) {
      const coin = this.createAnimation([...textures], COIN_FPS);
      coin.gotoAndPlay(Math.floor(Math.random() * textures.length));
      coin.position.set(760 + Math.random() * 400, 430 + Math.random() * 60);
      coin.scale.set(0.7 + Math.random() * 0.5);
      this.effects.addChild(coin);
      coins.push({
        sprite: coin,
        vx: (Math.random() - 0.5) * 0.24,
        vy: -0.28 - Math.random() * 0.2,
      });
    }
    let elapsed = 0;
    const update = (): void => {
      const dt = this.ticker.deltaMS * this.timeScale;
      elapsed += dt;
      for (const coin of coins) {
        coin.vy += 0.0009 * dt;
        coin.sprite.x += coin.vx * dt;
        coin.sprite.y += coin.vy * dt;
      }
      if (elapsed >= durationMs) this.removeTicker(update);
    };
    this.addTicker(update);
  }

  /** Looping 1 -> 1.04 -> 1 scale pulse for winning dominoes (UI/UX 12.1). */
  private startPulse(targets: readonly { setScaleFactor(scale: number): void }[]): void {
    let elapsed = 0;
    const update = (): void => {
      elapsed += this.ticker.deltaMS * this.timeScale;
      const phase = (elapsed % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
      const scale = 1 + (PULSE_MAX_SCALE - 1) * Math.sin(phase * Math.PI);
      for (const target of targets) target.setScaleFactor(scale);
    };
    this.addTicker(update);
  }

  /**
   * 24 fps looping sheet animation clipped to the symbol's own cell/column
   * bounds (12.4); frames advance from the owned ticker, not Ticker.shared.
   */
  private playSheet(
    sheetId: AssetId,
    center: { readonly x: number; readonly y: number },
    clip: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    },
  ): void {
    const sprite = this.createAnimation([...getSheetTextures(sheetId)], SHEET_FPS);
    sprite.position.set(center.x, center.y);
    sprite.play();
    const mask = new Graphics().rect(clip.x, clip.y, clip.width, clip.height).fill(0xffffff);
    sprite.mask = mask;
    this.effects.addChild(mask, sprite);
  }

  /** Registers an AnimatedSprite driven by the owned ticker (autoUpdate off). */
  private createAnimation(textures: Texture[], fps: number): AnimatedSprite {
    const sprite = new AnimatedSprite(textures, false);
    sprite.anchor.set(0.5);
    // timeScale (DEV/test) accelerates frame playback like everything else.
    sprite.animationSpeed = (fps / 60) * this.timeScale;
    this.liveAnimations.add(sprite);
    if (this.animationDriver === null) {
      const driver = (): void => {
        for (const animation of this.liveAnimations) animation.update(this.ticker);
      };
      this.animationDriver = driver;
      this.addTicker(driver);
    }
    return sprite;
  }

  /**
   * A frame exception must never stall the ticker or strand present() in
   * PRESENTING_WIN (plan section 18): the callback detaches itself and the
   * error is contained to the purely visual layer.
   */
  private addTicker(update: () => void): void {
    const safe = (): void => {
      try {
        update();
      } catch (error) {
        this.removeTicker(safe);
        console.error('Win presentation effect failed', error);
      }
    };
    this.activeTickers.add(safe);
    this.tickerBySource.set(update, safe);
    this.ticker.add(safe);
  }

  private readonly tickerBySource = new Map<() => void, () => void>();

  private removeTicker(update: () => void): void {
    const safe = this.tickerBySource.get(update) ?? update;
    this.tickerBySource.delete(update);
    if (this.activeTickers.delete(safe)) this.ticker.remove(safe);
  }

  /** Removes every effect and restores alphas, scales and static textures. */
  private clearPhase(): void {
    for (const safe of [...this.activeTickers]) {
      this.activeTickers.delete(safe);
      this.ticker.remove(safe);
    }
    this.tickerBySource.clear();
    this.animationDriver = null;
    this.liveAnimations.clear();
    for (const child of [...this.underlay.children]) child.destroy();
    for (const child of [...this.effects.children]) child.destroy();
    for (const column of this.grid.columns) {
      // Best-effort reset (plan section 18): one broken column must not stop
      // the others from being restored or mask the original failure.
      try {
        column.setSymbolAlpha(1);
        column.setFullWildSuppressed(false);
        for (const cell of column.cellSprites) {
          cell.setAlpha(1);
          cell.setScaleFactor(1);
          cell.setSuppressed(false);
        }
      } catch (error) {
        console.error('Presentation reset failed', error);
      }
    }
  }

  /** Ticker-driven delay; always settles, even if a frame errors out. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let elapsed = 0;
      const update = (): void => {
        try {
          elapsed += this.ticker.deltaMS * this.timeScale;
          if (elapsed >= ms) {
            this.removeTicker(update);
            resolve();
          }
        } catch (error) {
          this.removeTicker(update);
          console.error('Presentation delay failed', error);
          resolve();
        }
      };
      this.addTicker(update);
    });
  }
}
