import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { SYMBOL_ASSET_IDS, getAssetDefinition, type Point } from '../config/assetManifest';
import { DOMINO_RENDER_SCALE, TIER_PULSE, TIER_STYLES } from '../config/layout';
import type { SymbolId } from '@domino-poker/core/slots';
import type { TierPulse } from './TierPulse';

/**
 * One reel cell symbol as a state component (UI/UX sections 6.4, 6.4.1, 22.4):
 * the final state renders dominoes at 1.3x with their tier tint and pulsing
 * perimeter outline; the blur state renders at the same scale without tint or
 * outline. Textures are swapped in place, so spins never allocate sprites.
 */
export class SymbolSprite {
  readonly container = new Container();
  private readonly finalSprite = new Sprite();
  private readonly blurSprite = new Sprite();
  private outline: Graphics | null = null;
  private symbolId: SymbolId | null = null;

  constructor(
    private readonly pulse: TierPulse,
    private readonly center: Point,
  ) {
    this.container.position.set(center.x, center.y);
    this.finalSprite.anchor.set(0.5);
    this.blurSprite.anchor.set(0.5);
    this.blurSprite.visible = false;
    this.container.addChild(this.finalSprite, this.blurSprite);
  }

  get currentSymbol(): SymbolId | null {
    return this.symbolId;
  }

  setSymbol(symbolId: SymbolId): void {
    if (symbolId === this.symbolId) return;
    this.symbolId = symbolId;
    const ids = SYMBOL_ASSET_IDS.get(symbolId);
    if (ids === undefined) throw new Error(`Unknown symbol: ${symbolId}`);
    const definition = getAssetDefinition(ids.final);
    if (definition.placement.kind !== 'cell') {
      throw new Error(`Symbol ${symbolId} is not cell-placed`);
    }

    this.finalSprite.scale.set(1);
    this.finalSprite.texture = Assets.get<Texture>(ids.final);
    this.blurSprite.scale.set(1);
    this.blurSprite.texture = Assets.get<Texture>(ids.blur);

    if (definition.placement.renderSize !== 'native') {
      this.finalSprite.width = definition.placement.renderSize.width;
      this.finalSprite.height = definition.placement.renderSize.height;
      // Major/special blur assets are authored at cell size and stay native.
    } else if (definition.math?.kind === 'domino') {
      this.finalSprite.scale.set(DOMINO_RENDER_SCALE);
      this.blurSprite.scale.set(DOMINO_RENDER_SCALE);
    }

    const tint =
      definition.math?.kind === 'domino' ? TIER_STYLES[definition.math.tier]?.tint : undefined;
    this.finalSprite.tint = tint ?? 0xffffff;
    this.rebuildOutline(
      definition.math?.kind === 'domino' ? TIER_STYLES[definition.math.tier] : undefined,
    );
    this.container.label = symbolId;
  }

  private rebuildOutline(style: { readonly outline: number } | undefined): void {
    if (this.outline !== null) {
      this.pulse.unregister(this.outline);
      this.outline.destroy();
      this.outline = null;
    }
    if (style === undefined) return;
    const width = this.finalSprite.width;
    const height = this.finalSprite.height;
    this.outline = new Graphics()
      .roundRect(-width / 2, -height / 2, width, height, TIER_PULSE.cornerRadius)
      .stroke({ color: style.outline, width: TIER_PULSE.strokeWidth });
    this.outline.visible = this.finalSprite.visible;
    this.container.addChild(this.outline);
    this.pulse.register(this.outline);
  }

  /** Final state: sharp texture, tier tint and outline; blur hidden. */
  showFinal(): void {
    this.finalSprite.visible = true;
    if (this.outline !== null) this.outline.visible = true;
    this.blurSprite.visible = false;
    this.blurSprite.alpha = 1;
    this.blurSprite.y = 0;
  }

  /** SPINNING state: blur texture only, no tint/outline (UI/UX 6.4.1). */
  showBlur(): void {
    this.finalSprite.visible = false;
    if (this.outline !== null) this.outline.visible = false;
    this.blurSprite.visible = true;
  }

  /** 0..1 fade of the blur texture over the still-visible final symbol. */
  setBlurFade(progress: number): void {
    this.blurSprite.visible = true;
    this.blurSprite.alpha = Math.min(1, Math.max(0, progress));
    if (progress >= 1) {
      this.finalSprite.visible = false;
      if (this.outline !== null) this.outline.visible = false;
    }
  }

  /** Vertical wrap offset of the blur texture during motion. */
  setMotionOffset(offsetY: number): void {
    this.blurSprite.y = offsetY;
  }

  /** Vertical bounce offset of the whole symbol during the stop transition. */
  setStopOffset(offsetY: number): void {
    this.container.y = this.center.y + offsetY;
  }

  setAlpha(alpha: number): void {
    this.container.alpha = alpha;
  }

  /** Win-presentation scale pulse around the cell centre (UI/UX 12.1). */
  setScaleFactor(scale: number): void {
    this.container.scale.set(scale);
  }

  /**
   * Hides the static texture while a win sheet animation plays in its place
   * (UI/UX 12.4); layout and symbol assignment stay untouched.
   */
  setSuppressed(suppressed: boolean): void {
    this.finalSprite.visible = !suppressed;
    if (this.outline !== null) this.outline.visible = !suppressed;
  }

  destroy(): void {
    if (this.outline !== null) this.pulse.unregister(this.outline);
    this.container.destroy({ children: true });
  }
}
