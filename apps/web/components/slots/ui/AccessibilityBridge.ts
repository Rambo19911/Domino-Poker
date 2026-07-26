import { totalBetOf, type GameState, type SpinError } from '../app/gameState';
import { getAssetDefinition, type Rect } from '../config/assetManifest';
import { SLOT_MATH_CONFIG } from '@domino-poker/core/slots';
import { HUD_HIT_AREAS, RULES_HIT_AREA } from '../config/layout';

export type ToastKind = 'info' | 'warning' | 'error';

/**
 * Toast teksts uz grieziena atteikuma iemeslu. `NOT_ENOUGH_COINS` nav sarakstā:
 * to rāda GameApp kopā ar bilances mirgošanu (UI/UX 8.4).
 */
const SPIN_ERROR_MESSAGES: Partial<Record<SpinError, string>> = {
  SESSION_EXPIRED: 'SESSION EXPIRED — PLEASE LOG IN AGAIN',
  RATE_LIMITED: 'TOO MANY SPINS — PLEASE WAIT',
  SPIN_FAILED: 'CONNECTION PROBLEM — SPIN NOT PLACED',
};

/** Toast durations per type (UI/UX section 15.1). */
export const TOAST_DURATION_MS: Readonly<Record<ToastKind, number>> = {
  info: 1800,
  warning: 2200,
  error: 3000,
};

export function formatCoins(value: bigint): string {
  return value.toLocaleString('en-US');
}

/** One summary per spin for assistive technology (UI/UX section 18.1). */
export function formatSpinSummary(win: bigint, balance: bigint): string {
  return `Spin complete. Win ${formatCoins(win)} coins. Balance ${formatCoins(balance)} coins.`;
}

export interface UiHandlers {
  readonly onRules: () => void;
  readonly onBetMinus: () => void;
  readonly onBetPlus: () => void;
  readonly onMaxBet: () => void;
  readonly onSpin: () => void;
  readonly onAuto: () => void;
}

type ProxyName = 'rules' | 'minus' | 'plus' | 'maxBet' | 'spin' | 'auto';

/**
 * Semantic DOM alongside the canvas (plan section 17, UI/UX sections 17-18):
 * keyboard/AT proxy buttons in the documented Tab order, a hidden game-status
 * region, a polite spin announcer, the toast slot and the portrait rotate
 * overlay. Pointer input stays on the canvas; the proxies carry keyboard
 * focus, ARIA names and disabled state.
 */
export class AccessibilityBridge {
  private readonly layer: HTMLDivElement;
  private readonly proxies: Record<ProxyName, HTMLButtonElement>;
  private readonly statusLines: {
    readonly totalBet: HTMLParagraphElement;
    readonly balance: HTMLParagraphElement;
    readonly lastWin: HTMLParagraphElement;
  };
  private readonly announcer: HTMLDivElement;
  private readonly toastSlot: HTMLDivElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private prevState: GameState | null = null;

  constructor(host: HTMLElement, handlers: UiHandlers) {
    // The canvas pixels are decorative for AT; this DOM is the accessible UI.
    host.querySelector('canvas')?.setAttribute('aria-hidden', 'true');

    this.layer = document.createElement('div');
    this.layer.className = 'ui-layer design-layer';

    const proxy = (
      name: ProxyName,
      className: string,
      label: string,
      rect: Rect,
      onActivate: () => void,
    ): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `proxy proxy-${className}`;
      button.setAttribute('aria-label', label);
      button.disabled = true;
      // Centre on the canvas hit area, but clamp so the >=44 px minimum box
      // never leaves the design layer — an edge-hugging control (Rules) would
      // otherwise be clipped at small viewports (UI/UX 18.3, 20.5).
      const halfWidth = `max(22px, calc(${rect.width / 2} * var(--px)))`;
      const halfHeight = `max(22px, calc(${rect.height / 2} * var(--px)))`;
      button.style.left = `clamp(${halfWidth}, calc(${rect.x + rect.width / 2} / 1920 * 100%), calc(100% - ${halfWidth}))`;
      button.style.top = `clamp(${halfHeight}, calc(${rect.y + rect.height / 2} / 1080 * 100%), calc(100% - ${halfHeight}))`;
      button.style.width = `max(44px, calc(${rect.width} * var(--px)))`;
      button.style.height = `max(44px, calc(${rect.height} * var(--px)))`;
      button.addEventListener('click', onActivate);
      this.layer.appendChild(button);
      return button;
    };

    // Documented main-screen Tab order (UI/UX section 17).
    this.proxies = {
      rules: proxy('rules', 'rules', 'Game rules and paytable', RULES_HIT_AREA, handlers.onRules),
      minus: proxy('minus', 'minus', 'Decrease bet', HUD_HIT_AREAS.minus, handlers.onBetMinus),
      plus: proxy('plus', 'plus', 'Increase bet', HUD_HIT_AREAS.plus, handlers.onBetPlus),
      maxBet: proxy('maxBet', 'max', 'Maximum bet', HUD_HIT_AREAS.maxBet, handlers.onMaxBet),
      spin: proxy('spin', 'spin', 'Spin', HUD_HIT_AREAS.spin, handlers.onSpin),
      auto: proxy('auto', 'auto', 'Auto spin', HUD_HIT_AREAS.auto, handlers.onAuto),
    };

    // Arrow keys adjust the bet while focus is inside the bet group (UI/UX 17).
    for (const button of [this.proxies.minus, this.proxies.plus, this.proxies.maxBet]) {
      button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          handlers.onBetMinus();
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          handlers.onBetPlus();
        }
      });
    }

    // Hidden game-status block (UI/UX 18.1); not live, read on demand.
    const status = document.createElement('div');
    status.className = 'sr-only';
    const statusHeading = document.createElement('h2');
    statusHeading.textContent = 'Game status';
    const linesLine = document.createElement('p');
    linesLine.textContent = `Lines: ${SLOT_MATH_CONFIG.activeLines}`;
    const totalBet = document.createElement('p');
    const balance = document.createElement('p');
    const lastWin = document.createElement('p');
    status.append(statusHeading, linesLine, totalBet, balance, lastWin);
    this.statusLines = { totalBet, balance, lastWin };

    this.announcer = document.createElement('div');
    this.announcer.className = 'sr-only';
    this.announcer.setAttribute('role', 'status');
    this.announcer.setAttribute('aria-live', 'polite');

    this.toastSlot = document.createElement('div');
    this.toastSlot.className = 'toast-slot';
    this.toastSlot.setAttribute('role', 'status');

    this.layer.append(status, this.announcer, this.toastSlot);
    host.appendChild(this.layer);
    host.appendChild(createRotateOverlay());
  }

  /**
   * Portrait shows the Rotate Device overlay (UI/UX 15.4): the game controls
   * behind it must not be reachable by keyboard or assistive technology.
   */
  setPortrait(portrait: boolean): void {
    this.layer.inert = portrait;
  }

  /** Moves keyboard focus back to the Rules control (dialog close, UI/UX 13.3). */
  focusRules(): void {
    this.proxies.rules.focus();
  }

  /** Moves keyboard focus back to the Auto Spin control (UI/UX 14.2). */
  focusAuto(): void {
    this.proxies.auto.focus();
  }

  /** Shows one toast (UI/UX 15.1); a new toast replaces the previous one. */
  toast(kind: ToastKind, text: string): void {
    this.toastSlot.className = `toast-slot toast-${kind} toast-visible`;
    this.toastSlot.textContent = text;
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastSlot.classList.remove('toast-visible');
      this.toastTimer = null;
    }, TOAST_DURATION_MS[kind]);
  }

  update(state: GameState): void {
    const prev = this.prevState;
    this.prevState = state;

    const idle = state.phase === 'IDLE';
    const noAuto = state.autoSpin === null;
    const steps = SLOT_MATH_CONFIG.lineBetSteps;
    const maxBet = steps[steps.length - 1] as number;
    this.proxies.rules.disabled = !idle;
    this.proxies.minus.disabled = !(idle && noAuto && state.lineBet > (steps[0] as number));
    this.proxies.plus.disabled = !(idle && noAuto && state.lineBet < maxBet);
    this.proxies.maxBet.disabled = !(idle && noAuto && state.lineBet < maxBet);
    this.proxies.spin.disabled = !idle;
    // The active Hold control keeps working through the whole autoplay.
    this.proxies.auto.disabled = !(idle || !noAuto);
    this.proxies.auto.setAttribute('aria-label', noAuto ? 'Auto spin' : 'Stop auto spin');
    this.proxies.auto.setAttribute('aria-pressed', noAuto ? 'false' : 'true');

    this.statusLines.totalBet.textContent = `Total bet: ${formatCoins(totalBetOf(state.lineBet))} coins`;
    this.statusLines.balance.textContent = `Balance: ${formatCoins(state.balance)} coins`;
    this.statusLines.lastWin.textContent = `Last win: ${formatCoins(state.lastWin)} coins`;

    if (prev === null) return;
    // One polite summary per settled spin; reel intermediate frames are never
    // announced (UI/UX 18.1).
    if (state.phase === 'PRESENTING_WIN' && prev.phase !== 'PRESENTING_WIN') {
      this.announcer.textContent = formatSpinSummary(state.lastWin, state.balance);
    }
    // Autoplay ended early (stop request, low balance, error, tab hidden).
    if (prev.autoSpin !== null && state.autoSpin === null && prev.autoSpin.remaining > 0) {
      this.toast('info', 'AUTO SPIN STOPPED');
    }
    // Servera atteikums. NOT_ENOUGH_COINS apzināti nav sarakstā — to jau rāda
    // GameApp kopā ar bilances mirgošanu, lai nebūtu divi toast par vienu notikumu.
    if (state.error !== null && state.error !== prev.error) {
      const message = SPIN_ERROR_MESSAGES[state.error];
      if (message !== undefined) this.toast('error', message);
    }
  }
}

/** Full-screen portrait overlay (UI/UX 15.4); CSS shows it in portrait only. */
function createRotateOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'rotate-overlay';
  const ra = document.createElement('img');
  ra.src = getAssetDefinition('A025').url;
  ra.alt = '';
  const title = document.createElement('h2');
  title.textContent = 'ROTATE YOUR DEVICE';
  const body = document.createElement('p');
  body.textContent = 'This game is designed for landscape mode.';
  overlay.append(ra, title, body);
  return overlay;
}
