import { Application, Assets, type Texture } from 'pixi.js';
import {
  createBundleManifest,
  getAssetDefinition,
  type AssetId,
  type BundleName,
} from '../config/assetManifest';
import { COLORS } from '../config/layout';
import type { SpinResult } from '@domino-poker/core/slots';
import { SoundPlayer, type SoundSettings } from '../audio/SoundPlayer';
import { GameScene } from '../rendering/GameScene';
import { PreloaderScene } from '../rendering/PreloaderScene';
import { ResponsiveViewport } from '../rendering/ResponsiveViewport';
import { AccessibilityBridge } from '../ui/AccessibilityBridge';
import { AutoSpinDialog } from '../ui/AutoSpinDialog';
import { RulesDialog } from '../ui/RulesDialog';
import type { GameController } from './GameController';
import type { GameStore } from './GameStore';

/** Assets the preloader itself needs before any progress can be shown (plan 13.3). */
const PRELOADER_ASSET_IDS: readonly AssetId[] = ['A003', 'A027', 'A025', 'A020', 'A021', 'A022'];

export interface GameAppOptions {
  readonly host: HTMLElement;
  readonly store: GameStore;
  readonly controller: GameController;
  /** Konta bilance, ar ko sākt sesiju (serveris paliek autoritāte). */
  readonly initialBalance: number;
  /** Globālie skaņas iestatījumi; lasīti pie katras atskaņošanas. */
  readonly getSoundSettings?: () => SoundSettings;
  /** Atceļ startēšanu, ja komponente tika noņemta, kamēr assets vēl ielādējās. */
  readonly isCancelled?: () => boolean;
}

/**
 * Owns the PixiJS application and the BOOT/LOADING phases (plan step 4): asset
 * bundles load behind the preloader, texture dimensions are asserted against
 * the manifest, then the static scene mounts and the controller boots.
 *
 * DominoPoker atšķirības no standalone versijas:
 *   - `destroy()` novāc VISU (Pixi app, katrs klausītājs, audio konteksts), jo dialogs
 *     tiek atvērts un aizvērts atkārtoti vienā lapas sesijā.
 *   - `isCancelled` ļauj atmest startēšanu, kas pabeidzas jau pēc noņemšanas
 *     (React Strict Mode dubultā montāža + asinhronā `Application.init`).
 *   - DEV globāļi (`__PIXI_APP__`, `__GAME__` fixture) ir noņemti: to vienīgie
 *     patērētāji bija standalone repo Playwright testi, kas netiek pārnesti.
 */
export class GameApp {
  private constructor(
    readonly app: Application,
    readonly scene: GameScene,
    private readonly disposers: readonly (() => void)[]
  ) {}

  private destroyed = false;

  /** Idempotenti novāc visu, ko `start` izveidoja, apgrieztā izveides secībā. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const dispose of [...this.disposers].reverse()) {
      try {
        dispose();
      } catch (error) {
        console.error('Slot teardown step failed', error);
      }
    }
  }

  static async start(options: GameAppOptions): Promise<GameApp | null> {
    const disposers: (() => void)[] = [];
    const runDisposers = (): void => {
      for (const dispose of disposers.reverse()) {
        try {
          dispose();
        } catch (error) {
          console.error('Slot teardown step failed', error);
        }
      }
      disposers.length = 0;
    };
    try {
      return await GameApp.startInternal(options, disposers);
    } catch (error) {
      // Jebkurš izņēmums PĒC `Application.init` (assets, tekstūru pārbaude, aina)
      // citādi atstātu canvas, observer un audio kontekstu karājamies host'ā.
      runDisposers();
      throw error;
    }
  }

  private static async startInternal(
    options: GameAppOptions,
    disposers: (() => void)[]
  ): Promise<GameApp | null> {
    const { host, store, controller, initialBalance } = options;
    const cancelled = options.isCancelled ?? ((): boolean => false);
    const abort = (): null => {
      for (const dispose of [...disposers].reverse()) dispose();
      disposers.length = 0;
      return null;
    };

    const app = new Application();
    await app.init({
      background: COLORS.pageBackground,
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    // `init` ir asinhrona: komponente var būt noņemta, kamēr tā strādāja.
    if (cancelled()) {
      app.destroy(true, { children: true });
      return null;
    }
    host.appendChild(app.canvas);
    disposers.push(() => app.destroy(true, { children: true }));

    const viewport = new ResponsiveViewport(app, host);
    viewport.attach();
    disposers.push(() => viewport.detach());

    store.patch({ phase: 'LOADING' });

    const manifest = createBundleManifest();
    await Assets.init({
      manifest: {
        bundles: manifest.bundles.map((bundle) => ({
          name: bundle.name,
          assets: bundle.assets.map((asset) => ({ alias: asset.alias, src: asset.src })),
        })),
      },
    });

    await Assets.load([...PRELOADER_ASSET_IDS]);
    if (cancelled()) return abort();
    const preloader = new PreloaderScene();
    app.stage.addChild(preloader.container);

    // Sequential bundle loads; the bar advances by real per-asset progress,
    // weighted by each bundle's asset count so 0..1 spans the whole load.
    const totalAssets = manifest.bundles.reduce((sum, bundle) => sum + bundle.assets.length, 0);
    let loadedAssets = 0;
    const order: readonly BundleName[] = ['shell', 'symbols', 'blur', 'fx'];
    for (const name of order) {
      const bundle = manifest.bundles.find((candidate) => candidate.name === name);
      if (bundle === undefined || bundle.assets.length === 0) continue;
      await Assets.loadBundle(name, (progress) => {
        preloader.setProgress((loadedAssets + progress * bundle.assets.length) / totalAssets);
      });
      if (cancelled()) return abort();
      loadedAssets += bundle.assets.length;
    }

    assertTextureDimensions(manifest.bundles.flatMap((bundle) => bundle.assets));

    await preloader.complete(app);
    app.stage.removeChild(preloader.container);
    preloader.destroy();
    if (cancelled()) return abort();

    // Decorative sound effects; loading failures never block the game.
    const sounds = new SoundPlayer(options.getSoundSettings);
    sounds.preload();
    disposers.push(() => sounds.destroy());

    // Pointer clicks and keyboard share one 250 ms debounce (plan 15.2); the
    // phase machine remains the real guard, this only filters double inputs.
    let lastSpinRequestAt = Number.NEGATIVE_INFINITY;
    const portraitQuery = window.matchMedia('(orientation: portrait)');
    const tryRequestSpin = (): void => {
      // Portrait shows the Rotate Device overlay; no new spin starts (UI/UX 15.4).
      if (portraitQuery.matches) return;
      const now = performance.now();
      if (now - lastSpinRequestAt < 250) return;
      lastSpinRequestAt = now;
      void controller.requestSpin().then((started) => {
        if (started) {
          // The Spin control plays the coin spend instead of the button click.
          sounds.play('spin');
        } else if (store.getState().error === 'NOT_ENOUGH_COINS') {
          // Rejected spin feedback (plan 15.2, UI/UX 8.4).
          scene.flashInsufficientBalance();
          bridge.toast('error', 'NOT ENOUGH COINS');
        }
      });
    };
    const openRules = (): void => {
      sounds.click();
      if (controller.openRules()) rulesDialog.open();
    };
    const openAutoSpinConfig = (): void => {
      sounds.click();
      if (controller.openAutoSpinConfig()) autoDialog.open();
    };
    const clickThen = (action: () => void): (() => void) => {
      return () => {
        sounds.click();
        action();
      };
    };

    const scene = new GameScene(
      app.ticker,
      {
        onSpin: tryRequestSpin,
        onBetMinus: clickThen(() => void controller.betMinus()),
        onBetPlus: clickThen(() => void controller.betPlus()),
        onMaxBet: clickThen(() => void controller.maxBet()),
        onAutoOpen: openAutoSpinConfig,
        onAutoStop: clickThen(() => controller.requestAutoStop()),
        onRules: openRules,
      },
      sounds
    );
    app.stage.addChild(scene.layers.root);
    disposers.push(() => scene.destroy());

    // Step 7 DOM layer: keyboard/AT proxies, dialogs, toasts (UI/UX 13-18).
    const bridge = new AccessibilityBridge(host, {
      onRules: openRules,
      onBetMinus: clickThen(() => void controller.betMinus()),
      onBetPlus: clickThen(() => void controller.betPlus()),
      onMaxBet: clickThen(() => void controller.maxBet()),
      onSpin: tryRequestSpin,
      onAuto: () => {
        if (store.getState().autoSpin !== null) {
          sounds.click();
          controller.requestAutoStop();
        } else {
          openAutoSpinConfig();
        }
      },
    });
    const rulesDialog = new RulesDialog(host, {
      onClose: () => controller.closeRules(),
      returnFocus: () => bridge.focusRules(),
    });
    const autoDialog = new AutoSpinDialog(host, {
      onCancel: () => controller.cancelAutoSpinConfig(),
      onSelect: (count) => {
        // The tab may have been hidden or the device rotated to portrait
        // during the 150 ms delay (plan 10.5, UI/UX 15.4: no new spin starts).
        if (document.hidden || portraitQuery.matches) {
          controller.cancelAutoSpinConfig();
          return;
        }
        void controller.selectAutoSpin(count).then((started) => {
          if (!started && store.getState().error === 'NOT_ENOUGH_COINS') {
            scene.flashInsufficientBalance();
            bridge.toast('error', 'NOT ENOUGH COINS');
          }
        });
      },
      returnFocus: () => bridge.focusAuto(),
    });
    disposers.push(() => autoDialog.destroy());

    // One delegated listener covers every DOM dialog button (Rules close,
    // Auto Spin options and cancel) without touching the dialogs.
    const onHostClick = (event: MouseEvent): void => {
      if (event.target instanceof Element && event.target.closest('dialog button') !== null) {
        sounds.click();
      }
    };
    host.addEventListener('click', onHostClick);
    disposers.push(() => host.removeEventListener('click', onHostClick));

    // Visual spin flow (plan section 8): the server result drives the
    // animation, the settled totals show once the reels stand, then the win
    // presentation (UI/UX sections 9.4 and 12) closes the loop.
    let lastPlayedSpinId: string | null = null;
    const runSpinPresentation = async (result: SpinResult): Promise<void> => {
      try {
        await scene.playSpin(result);
      } catch (error) {
        // Plan section 18: an animation error must never void the settled
        // result — show the final grid and settle immediately.
        console.error('Spin animation failed; showing the final grid', error);
        scene.showResultInstant(result);
      }
      controller.onReelsStopped();
      // Any settled win sounds together with the Balance/Win count-up.
      if (result.totalWin > 0n) sounds.play('payout');
      // UI/UX 9.3 sequence: the Balance/Win count-up completes before the
      // winning lines are presented; the wait shares the HUD's own ticker so
      // a throttled tab pauses both together.
      await scene.waitForHudValues();
      try {
        await scene.presentWin(result);
      } catch (error) {
        // A presentation error never blocks the settled game (plan section 18).
        console.error('Win presentation failed', error);
      }
      controller.onPresentationComplete();
    };

    const unsubscribe = store.subscribe((state) => {
      scene.update(state);
      bridge.update(state);
      if (
        state.phase === 'SPINNING' &&
        state.pendingSpin !== null &&
        state.pendingSpin.spinId !== lastPlayedSpinId
      ) {
        lastPlayedSpinId = state.pendingSpin.spinId;
        void runSpinPresentation(state.pendingSpin);
      }
    });
    disposers.push(unsubscribe);

    controller.boot(initialBalance);
    scene.update(store.getState());
    bridge.update(store.getState());

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space' && event.code !== 'Enter' && event.code !== 'NumpadEnter') return;
      // The shortcut is skipped when focus sits on a form control or dialog,
      // where Space/Enter already activate natively (UI/UX section 17).
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('button, input, select, a, dialog')) {
        return;
      }
      // Dialogā tastatūra pieder spēlei tikai tad, kad fokuss ir tās iekšienē.
      if (!host.contains(active)) return;
      event.preventDefault();
      tryRequestSpin();
    };
    window.addEventListener('keydown', onKeydown);
    disposers.push(() => window.removeEventListener('keydown', onKeydown));

    const onVisibilityChange = (): void => {
      if (document.hidden) controller.notifyTabHidden();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    disposers.push(() => document.removeEventListener('visibilitychange', onVisibilityChange));

    // Rotating to portrait behaves like hiding the tab: open dialogs close
    // (only the rotate overlay may show, UI/UX 15.4/20.5), the active spin
    // finishes, Auto Spin stops, no new spin starts.
    const onPortraitChange = (event: MediaQueryListEvent): void => {
      if (event.matches) {
        rulesDialog.close();
        autoDialog.close();
        controller.requestAutoStop();
      }
      bridge.setPortrait(event.matches);
    };
    portraitQuery.addEventListener('change', onPortraitChange);
    disposers.push(() => portraitQuery.removeEventListener('change', onPortraitChange));
    bridge.setPortrait(portraitQuery.matches);

    return new GameApp(app, scene, disposers);
  }
}

/**
 * Plan section 13.6: after loading, every texture must match the manifest
 * source size; a mismatch means wrong or corrupted assets and blocks the game.
 * Raw PNG pixels are compared, so a texture resolution can never mask a
 * wrong-size file.
 */
function assertTextureDimensions(assets: readonly { readonly alias: AssetId }[]): void {
  for (const { alias } of assets) {
    const definition = getAssetDefinition(alias);
    const texture = Assets.get<Texture>(alias);
    if (texture === undefined) {
      throw new Error(`Texture ${alias} (${definition.filePath}) did not load`);
    }
    const { pixelWidth, pixelHeight } = texture.source;
    const { width, height } = definition.sourceSize;
    if (pixelWidth !== width || pixelHeight !== height) {
      throw new Error(
        `Texture ${alias} (${definition.filePath}) is ${pixelWidth}x${pixelHeight}, expected ${width}x${height}`
      );
    }
  }
}
