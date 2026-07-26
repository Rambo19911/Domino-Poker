import { AUTO_SPIN_OPTIONS } from '../config/presentation';
import { installEscapeToClose } from './RulesDialog';

/** The first autoplay spin starts 150 ms after the dialog closes (UI/UX 14.2). */
export const AUTO_SPIN_START_DELAY_MS = 150;

/** AUTO-10/25/50/100 button centres relative to the panel (UI/UX 14.1). */
const OPTION_CENTERS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 150, y: 180 },
  { x: 390, y: 180 },
  { x: 150, y: 290 },
  { x: 390, y: 290 },
];

export interface AutoSpinDialogActions {
  /** Dialog dismissed without a selection (Cancel, Escape, scrim). */
  readonly onCancel: () => void;
  /** Called AUTO_SPIN_START_DELAY_MS after the dialog closed with a count. */
  readonly onSelect: (count: number) => void;
  /** Returns keyboard focus to the Auto Spin control. */
  readonly returnFocus: () => void;
}

/** Auto Spin count selection dialog (UI/UX section 14). */
export class AutoSpinDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly firstOption: HTMLButtonElement;
  private selected: number | null = null;
  /** Atliktais starts; jāatceļ pie `destroy`, citādi aizvērta spēle noliktu likmi. */
  private startTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(host: HTMLElement, actions: AutoSpinDialogActions) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'modal modal-auto';
    this.dialog.setAttribute('aria-labelledby', 'auto-title');

    const layer = document.createElement('div');
    layer.className = 'design-layer';
    const panel = document.createElement('div');
    panel.className = 'modal-panel auto-panel';

    const title = document.createElement('h2');
    title.id = 'auto-title';
    title.className = 'auto-title';
    title.textContent = 'AUTO SPINS';
    panel.appendChild(title);

    // display:contents at design scale (absolute layout per UI/UX 14.1); a
    // 2x2 grid on small containers where 44 px minimum targets would overlap.
    const grid = document.createElement('div');
    grid.className = 'auto-grid';
    panel.appendChild(grid);

    const options = AUTO_SPIN_OPTIONS.map((count, index) => {
      const offset = OPTION_CENTERS[index];
      if (offset === undefined) throw new Error(`No dialog slot for auto spin option ${count}`);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'modal-button auto-option';
      button.textContent = String(count);
      button.setAttribute('aria-label', `${count} auto spins`);
      button.style.left = `calc(${offset.x} * var(--px))`;
      button.style.top = `calc(${offset.y} * var(--px))`;
      button.addEventListener('click', () => {
        this.selected = count;
        this.dialog.close();
      });
      grid.appendChild(button);
      return button;
    });
    const firstOption = options[0];
    if (firstOption === undefined) throw new Error('Auto spin dialog has no options');
    this.firstOption = firstOption;

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'modal-button auto-cancel';
    cancel.textContent = 'CANCEL';
    cancel.addEventListener('click', () => this.dialog.close());
    panel.appendChild(cancel);

    layer.appendChild(panel);
    this.dialog.appendChild(layer);

    // Scrim click closes without starting spins (UI/UX 14.2).
    this.dialog.addEventListener('click', (event) => {
      if (event.target instanceof Node && !panel.contains(event.target)) this.dialog.close();
    });
    installEscapeToClose(this.dialog);
    this.dialog.addEventListener('close', () => {
      const selected = this.selected;
      this.selected = null;
      if (selected === null) {
        actions.onCancel();
        // Deferred: the native <dialog> focus restore runs after this event
        // and would override an immediate focus() (UI/UX 14.2).
        setTimeout(() => actions.returnFocus(), 0);
        return;
      }
      // Focus returns once autoplay started; before that the Auto control is
      // still disabled (phase AUTOSPIN_CONFIG) and could not take focus.
      this.startTimer = setTimeout(() => {
        this.startTimer = null;
        actions.onSelect(selected);
        actions.returnFocus();
      }, AUTO_SPIN_START_DELAY_MS);
    });

    host.appendChild(this.dialog);
  }

  open(): void {
    this.selected = null;
    this.dialog.showModal();
    this.firstOption.focus();
  }

  /** Closes without a selection, e.g. when portrait shows the rotate overlay. */
  close(): void {
    if (this.dialog.open) this.dialog.close();
  }

  /**
   * Atceļ atlikto startu. Bez šī lietotājs, kas izvēlas Auto Spin un uzreiz aizver
   * spēli, 150 ms vēlāk noliktu ĪSTU likmi uz jau noņemtas komponentes.
   */
  destroy(): void {
    if (this.startTimer !== null) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    this.selected = null;
    this.close();
  }
}
