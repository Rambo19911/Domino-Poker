import { Container } from 'pixi.js';
import { ReelColumn } from './ReelColumn';
import type { ColumnPlan } from './spinTimeline';
import type { TierPulse } from './TierPulse';

/** The five reel columns on the symbols layer (plan step 5). */
export class ReelGrid {
  readonly container = new Container();
  readonly columns: readonly ReelColumn[];

  constructor(pulse: TierPulse) {
    this.container.label = 'reel-grid';
    this.columns = [0, 1, 2, 3, 4].map((index) => {
      const column = new ReelColumn(index, pulse);
      this.container.addChild(column.container);
      return column;
    });
  }

  /** Shows five column plans in their final state (boot, instant fallback). */
  showFinal(plans: readonly ColumnPlan[]): void {
    plans.forEach((plan, index) => {
      const column = this.columns[index];
      if (column === undefined) throw new Error(`Missing reel column ${index}`);
      column.showFinal(plan);
    });
  }
}
