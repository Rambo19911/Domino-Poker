import type { Application } from 'pixi.js';
import { DESIGN_SIZE } from '../config/assetManifest';

export interface ViewportFit {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Uniform letterbox fit of the 1920x1080 design surface (plan section 11). */
export function fitViewport(viewportWidth: number, viewportHeight: number): ViewportFit {
  const scale = Math.min(viewportWidth / DESIGN_SIZE.width, viewportHeight / DESIGN_SIZE.height);
  return {
    scale,
    offsetX: (viewportWidth - DESIGN_SIZE.width * scale) / 2,
    offsetY: (viewportHeight - DESIGN_SIZE.height * scale) / 2,
  };
}

/**
 * Keeps the renderer sized to its host box and the stage letterbox-centred.
 *
 * The standalone game owned the whole window and listened to `window resize`. Inside
 * a DominoPoker dialog it owns only the dialog's content box, which can change size
 * without the window changing at all (open/close animation, host layout), so the
 * observed element is the host and not the window.
 */
export class ResponsiveViewport {
  private observer: ResizeObserver | null = null;

  constructor(
    private readonly app: Application,
    private readonly host: HTMLElement
  ) {}

  attach(): void {
    this.observer = new ResizeObserver(() => this.apply());
    this.observer.observe(this.host);
    this.apply();
  }

  detach(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private apply(): void {
    // A collapsed box (dialog still animating in) would divide by zero in fitViewport.
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.app.renderer.resize(width, height);
    const fit = fitViewport(width, height);
    this.app.stage.scale.set(fit.scale);
    this.app.stage.position.set(fit.offsetX, fit.offsetY);
  }
}
