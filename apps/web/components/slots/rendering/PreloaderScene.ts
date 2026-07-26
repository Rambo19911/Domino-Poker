import { Assets, Container, Graphics, Sprite, Text, type Application, type Texture } from 'pixi.js';
import { DESIGN_SIZE, getAssetDefinition, type AssetId, type Rect } from '../config/assetManifest';
import { COLORS, FONTS, PRELOADER_LAYOUT } from '../config/layout';

const STILL_LOADING_AFTER_MS = 8000;
const HOLD_AT_FULL_MS = 200;
const FADE_OUT_MS = 250;

function staticSprite(id: AssetId, bounds: Rect): Sprite {
  const sprite = new Sprite(Assets.get<Texture>(id));
  sprite.position.set(bounds.x, bounds.y);
  sprite.width = bounds.width;
  sprite.height = bounds.height;
  return sprite;
}

/**
 * Loading screen per UI/UX section 10: dimmed background, Ra mark, load bar
 * whose fill mask width follows real bundle progress, percent and status text.
 */
export class PreloaderScene {
  readonly container = new Container();
  private readonly fillMask: Sprite;
  private readonly percentText: Text;
  private readonly statusText: Text;
  private readonly stillLoadingTimer: number;
  private progress = 0;

  constructor() {
    this.container.label = 'preloader';

    const background = staticSprite('A003', { x: 0, y: 0, ...DESIGN_SIZE });
    const dim = new Graphics()
      .rect(0, 0, DESIGN_SIZE.width, DESIGN_SIZE.height)
      .fill({ color: 0x000000, alpha: 0.35 });
    const ra = staticSprite('A025', PRELOADER_LAYOUT.ra);
    const barEmpty = staticSprite('A020', PRELOADER_LAYOUT.bar);
    const barFull = staticSprite('A021', PRELOADER_LAYOUT.bar);

    // The native-size LoadBarMask clips the fill; its width follows progress 0..1
    // (plan section 13.5). A mask must itself be part of the display list.
    const maskDef = getAssetDefinition('A022');
    this.fillMask = new Sprite(Assets.get<Texture>('A022'));
    this.fillMask.position.set(PRELOADER_LAYOUT.barMask.x, PRELOADER_LAYOUT.barMask.y);
    this.fillMask.width = 0;
    this.fillMask.height = maskDef.sourceSize.height;
    barFull.mask = this.fillMask;

    this.percentText = new Text({
      text: '0%',
      style: {
        fontFamily: [...FONTS.numbers],
        fontSize: 32,
        fontWeight: '700',
        fill: COLORS.gold100,
        dropShadow: { color: COLORS.brown900, alpha: 1, angle: Math.PI / 2, blur: 2, distance: 2 },
      },
    });
    this.percentText.anchor.set(0.5);
    this.percentText.position.set(
      PRELOADER_LAYOUT.percent.x + PRELOADER_LAYOUT.percent.width / 2,
      PRELOADER_LAYOUT.percent.y + PRELOADER_LAYOUT.percent.height / 2,
    );

    this.statusText = new Text({
      text: 'LOADING GAME ASSETS',
      style: {
        fontFamily: [...FONTS.dialog],
        fontSize: 22,
        fontWeight: '700',
        fill: COLORS.gold100,
        letterSpacing: 2,
      },
    });
    this.statusText.anchor.set(0.5);
    this.statusText.position.set(
      PRELOADER_LAYOUT.status.x + PRELOADER_LAYOUT.status.width / 2,
      PRELOADER_LAYOUT.status.y + PRELOADER_LAYOUT.status.height / 2,
    );

    this.container.addChild(
      background,
      dim,
      ra,
      barEmpty,
      barFull,
      this.fillMask,
      this.percentText,
      this.statusText,
    );

    this.stillLoadingTimer = window.setTimeout(() => {
      this.statusText.text = 'STILL LOADING...';
    }, STILL_LOADING_AFTER_MS);
  }

  /** Monotonic progress: a later, smaller value never moves the bar backwards. */
  setProgress(value: number): void {
    this.progress = Math.min(1, Math.max(this.progress, value));
    this.fillMask.width = PRELOADER_LAYOUT.barMask.width * this.progress;
    this.percentText.text = `${Math.round(this.progress * 100)}%`;
  }

  /** Holds the full bar for 200 ms, then fades out over 250 ms (UI/UX 10.2). */
  async complete(app: Application): Promise<void> {
    this.setProgress(1);
    window.clearTimeout(this.stillLoadingTimer);
    await new Promise((resolve) => setTimeout(resolve, HOLD_AT_FULL_MS));
    await new Promise<void>((resolve) => {
      const startedAt = performance.now();
      const tick = (): void => {
        const t = (performance.now() - startedAt) / FADE_OUT_MS;
        this.container.alpha = Math.max(1 - t, 0);
        if (t >= 1) {
          app.ticker.remove(tick);
          resolve();
        }
      };
      app.ticker.add(tick);
    });
  }

  destroy(): void {
    window.clearTimeout(this.stillLoadingTimer);
    this.container.destroy({ children: true });
  }
}
