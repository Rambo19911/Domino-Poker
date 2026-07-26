import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { CELL_POSITIONS, COLUMN_POSITIONS, getAssetDefinition } from '../config/assetManifest';
import type { ColumnPlan } from './spinTimeline';
import { SymbolSprite } from './SymbolSprite';
import type { TierPulse } from './TierPulse';

type ColumnKey = keyof typeof COLUMN_POSITIONS;
type CellKey = keyof typeof CELL_POSITIONS;

/**
 * One reel column: three masked cell symbols or a single full-height stacked
 * Wild (plan section 12.2-12.3). All sprites and masks are created once; a
 * spin only swaps textures and visibility, so nothing leaks across spins.
 */
export class ReelColumn {
  readonly container = new Container();
  private readonly cells: readonly SymbolSprite[];
  private readonly fullWild = new Container();
  private readonly fullWildFinal: Sprite;
  private readonly fullWildBlur: Sprite;
  private readonly fullWildCenter: { readonly x: number; readonly y: number };
  private mode: 'cells' | 'full-wild' = 'cells';

  constructor(columnIndex: number, pulse: TierPulse) {
    this.container.label = `reel-column-${columnIndex}`;

    this.cells = [0, 1, 2].map((row) => {
      const cellKey = `P${row}${columnIndex}` as CellKey;
      const cell = CELL_POSITIONS[cellKey];
      const mask = new Graphics()
        .rect(cell.bounds.x, cell.bounds.y, cell.bounds.width, cell.bounds.height)
        .fill(0xffffff);
      const symbol = new SymbolSprite(pulse, cell.center);
      symbol.container.mask = mask;
      this.container.addChild(mask, symbol.container);
      return symbol;
    });

    const columnKey = `C${columnIndex}` as ColumnKey;
    const column = COLUMN_POSITIONS[columnKey];
    this.fullWildCenter = column.center;
    const columnMask = new Graphics()
      .rect(column.bounds.x, column.bounds.y, column.bounds.width, column.bounds.height)
      .fill(0xffffff);

    const finalDef = getAssetDefinition('A091'); // WildFull-Special
    this.fullWildFinal = new Sprite(Assets.get<Texture>('A091'));
    this.fullWildFinal.anchor.set(0.5);
    if (finalDef.placement.kind === 'column') {
      this.fullWildFinal.width = finalDef.placement.renderSize.width;
      this.fullWildFinal.height = finalDef.placement.renderSize.height;
    }
    this.fullWildBlur = new Sprite(Assets.get<Texture>('A099')); // WildFullBlurred, native
    this.fullWildBlur.anchor.set(0.5);
    this.fullWildBlur.visible = false;

    this.fullWild.position.set(column.center.x, column.center.y);
    this.fullWild.addChild(this.fullWildFinal, this.fullWildBlur);
    this.fullWild.mask = columnMask;
    this.fullWild.visible = false;
    this.container.addChild(columnMask, this.fullWild);
  }

  /** Idle/final display of a column plan; used at boot and at each stop. */
  showFinal(plan: ColumnPlan): void {
    this.mode = plan.kind;
    if (plan.kind === 'cells') {
      this.fullWild.visible = false;
      plan.symbols.forEach((symbolId, row) => {
        const cell = this.cells[row];
        if (cell === undefined) throw new Error(`Missing cell ${row}`);
        cell.setSymbol(symbolId);
        cell.showFinal();
        cell.setStopOffset(0);
        cell.container.visible = true;
        cell.setAlpha(1);
      });
    } else {
      for (const cell of this.cells) cell.container.visible = false;
      this.fullWild.visible = true;
      this.fullWild.alpha = 1;
      this.fullWildFinal.visible = true;
      this.fullWildBlur.visible = false;
      this.fullWildBlur.y = 0;
      this.fullWild.y = this.fullWildCenter.y;
    }
  }

  /** 0..1 fade from the currently shown final textures into their blur pair. */
  setBlurFade(progress: number): void {
    if (this.mode === 'cells') {
      for (const cell of this.cells) cell.setBlurFade(progress);
    } else {
      this.fullWildBlur.visible = true;
      this.fullWildBlur.alpha = Math.min(1, Math.max(0, progress));
      if (progress >= 1) this.fullWildFinal.visible = false;
    }
  }

  /** Vertical wrap offset of the blur textures during motion. */
  setMotionOffset(offsetY: number): void {
    if (this.mode === 'cells') {
      for (const cell of this.cells) cell.setMotionOffset(offsetY);
    } else {
      this.fullWildBlur.y = offsetY;
    }
  }

  /** Switches to the incoming plan's final textures at the stop moment. */
  beginStop(plan: ColumnPlan): void {
    this.showFinal(plan);
  }

  /** Bounce offset applied to the final symbols during the stop transition. */
  setStopOffset(offsetY: number): void {
    if (this.mode === 'cells') {
      for (const cell of this.cells) cell.setStopOffset(offsetY);
    } else {
      this.fullWild.y = this.fullWildCenter.y + offsetY;
    }
  }

  /** Whole-column symbol alpha; used by the reduced-motion fade. */
  setSymbolAlpha(alpha: number): void {
    if (this.mode === 'cells') {
      for (const cell of this.cells) cell.setAlpha(alpha);
    } else {
      this.fullWild.alpha = alpha;
    }
  }

  /** The cell components, for verification and later win presentation. */
  get cellSprites(): readonly SymbolSprite[] {
    return this.cells;
  }

  get currentMode(): 'cells' | 'full-wild' {
    return this.mode;
  }

  /** Hides the static full-wild texture while its win sheet plays (12.4). */
  setFullWildSuppressed(suppressed: boolean): void {
    this.fullWildFinal.visible = !suppressed;
  }
}
