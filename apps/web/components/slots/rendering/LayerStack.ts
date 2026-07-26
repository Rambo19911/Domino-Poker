import { Container } from 'pixi.js';

/** Canvas layer order from plan section 12.1 / UI/UX section 5. */
export const LAYER_NAMES = [
  'background',
  'frame',
  'reelBackground',
  'symbols',
  'winEffects',
  'header',
  'hud',
] as const;

export type LayerName = (typeof LAYER_NAMES)[number];

/** Fixed z-ordered containers; children are added to a named layer, never to the stage. */
export class LayerStack {
  private readonly layers: ReadonlyMap<LayerName, Container>;
  readonly root = new Container();

  constructor() {
    const layers = new Map<LayerName, Container>();
    for (const name of LAYER_NAMES) {
      const layer = new Container();
      layer.label = name;
      this.root.addChild(layer);
      layers.set(name, layer);
    }
    this.layers = layers;
  }

  get(name: LayerName): Container {
    const layer = this.layers.get(name);
    if (layer === undefined) throw new Error(`Unknown layer: ${name}`);
    return layer;
  }
}
