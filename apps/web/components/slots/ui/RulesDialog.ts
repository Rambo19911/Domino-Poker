import { SYMBOL_ASSET_IDS, getAssetDefinition, type AssetId } from '../config/assetManifest';
import { SLOT_MATH_CONFIG, PAYLINES } from '@domino-poker/core/slots';
import {
  ACE_COMBO_PAY,
  ALL_WILD_PAY,
  EXACT_PAY_HUNDREDTHS,
  MAJOR_BOOST_HUNDREDTHS,
  TIER_COMBO_PAY,
  TRUMP_COMBO_PAY,
  scatterPayHundredths,
  type PayTriplet,
} from '@domino-poker/core/slots';
import { DOMINO_IDS, getDominoRank, getDominoTier, type DominoTier } from '@domino-poker/core/slots';
import type { DominoId } from '@domino-poker/core/slots';

const TIER_LABELS: Readonly<Record<DominoTier, string>> = {
  'royal-trump': 'Royal Trump',
  'high-trump': 'High Trump',
  'low-trump': 'Low Trump',
  ace: 'Ace',
  'high-regular': 'High Regular',
  'mid-regular': 'Mid Regular',
  'low-regular': 'Low Regular',
};

/** Strongest first, matching the paytable hierarchy (docs/01 section 3.2). */
const TIER_ORDER: readonly DominoTier[] = [
  'royal-trump',
  'high-trump',
  'low-trump',
  'ace',
  'high-regular',
  'mid-regular',
  'low-regular',
];

const MAJOR_ORDER = ['SCARAB', 'BOOK', 'SCROLL', 'VASE'] as const;
const MAJOR_LABELS: Readonly<Record<(typeof MAJOR_ORDER)[number], string>> = {
  SCARAB: 'Scarab',
  BOOK: 'Book',
  SCROLL: 'Scroll',
  VASE: 'Vase',
};

/** `190 -> 1.90x`, `1000 -> 10x` (multipliers are stored in hundredths). */
export function formatMultiplier(hundredths: number): string {
  const value = hundredths / 100;
  return Number.isInteger(value) ? `${value}x` : `${value.toFixed(2)}x`;
}

export interface PayRow {
  readonly label: string;
  readonly pays: readonly [string, string, string];
}

export interface PaytableSection {
  readonly title: string;
  readonly rows: readonly PayRow[];
}

function payRow(label: string, triplet: PayTriplet): PayRow {
  return {
    label,
    pays: [
      formatMultiplier(triplet[0]),
      formatMultiplier(triplet[1]),
      formatMultiplier(triplet[2]),
    ],
  };
}

/**
 * The full line-win paytable, generated from the same `paytable.ts` values the
 * math uses (plan section 15.3): never duplicated by hand.
 */
export function buildPaytableModel(): readonly PaytableSection[] {
  return [
    {
      title: 'LINE WINS (x line bet)',
      rows: [
        payRow('All Wild', ALL_WILD_PAY),
        ...TIER_ORDER.map((tier) => payRow(TIER_LABELS[tier], EXACT_PAY_HUNDREDTHS[tier])),
      ],
    },
    {
      title: 'GROUP COMBOS (x line bet)',
      rows: [
        payRow('Trump Combo', TRUMP_COMBO_PAY),
        payRow('Ace Combo', ACE_COMBO_PAY),
        payRow('High Regular Combo', TIER_COMBO_PAY['high-regular']),
        payRow('Mid Regular Combo', TIER_COMBO_PAY['mid-regular']),
        payRow('Low Regular Combo', TIER_COMBO_PAY['low-regular']),
      ],
    },
  ];
}

export interface BoosterRow {
  readonly label: string;
  readonly boost: string;
}

/** Major boosters (math v3): each adds its bonus to a winning run it extends. */
export function buildBoosterModel(): readonly BoosterRow[] {
  return MAJOR_ORDER.map((major) => ({
    label: MAJOR_LABELS[major],
    boost: `+${MAJOR_BOOST_HUNDREDTHS[major]}%`,
  })).reverse(); // weakest (Vase) first
}

export interface ScatterRow {
  readonly label: string;
  readonly pay: string;
}

/** Jackpot scatter payouts as multiples of the total bet. */
export function buildScatterModel(): readonly ScatterRow[] {
  return [3, 4, 5].map((count) => ({
    label: count === 5 ? '5+ Jackpot symbols' : `${count} Jackpot symbols`,
    pay: formatMultiplier(scatterPayHundredths(count)),
  }));
}

export interface DominoTierGroup {
  readonly tier: DominoTier;
  readonly label: string;
  readonly ids: readonly DominoId[];
}

/** The 28 dominoes grouped by strength tier, strongest group and rank first. */
export function dominoTierGroups(): readonly DominoTierGroup[] {
  return TIER_ORDER.map((tier) => ({
    tier,
    label: TIER_LABELS[tier],
    ids: [...DOMINO_IDS.filter((id) => getDominoTier(id) === tier)].sort(
      (a, b) => getDominoRank(a) - getDominoRank(b),
    ),
  }));
}

export interface RulesDialogActions {
  /** Dialog closed by any path (Close, Escape, scrim). */
  readonly onClose: () => void;
  /** Returns keyboard focus to the Rules control. */
  readonly returnFocus: () => void;
}

/**
 * Rules & Paytable dialog (UI/UX section 13). A native `<dialog>` provides the
 * focus trap, Escape handling and the inert background.
 */
export class RulesDialog {
  private readonly dialog: HTMLDialogElement;
  private readonly closeButton: HTMLButtonElement;

  constructor(host: HTMLElement, actions: RulesDialogActions) {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'modal modal-rules';
    this.dialog.setAttribute('aria-labelledby', 'rules-title');

    const layer = document.createElement('div');
    layer.className = 'design-layer';
    const panel = document.createElement('div');
    panel.className = 'modal-panel rules-panel';

    const title = document.createElement('h2');
    title.id = 'rules-title';
    title.className = 'rules-title';
    title.textContent = 'GAME RULES & PAYTABLE';

    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'rules-close';
    this.closeButton.setAttribute('aria-label', 'Close rules');
    this.closeButton.style.backgroundImage = `url("${getAssetDefinition('A015').url}")`;
    const closeGlyph = document.createElement('span');
    closeGlyph.setAttribute('aria-hidden', 'true');
    closeGlyph.textContent = '✕';
    this.closeButton.appendChild(closeGlyph);
    this.closeButton.addEventListener('click', () => this.dialog.close());

    const body = document.createElement('div');
    body.className = 'rules-body';
    body.tabIndex = 0;
    body.setAttribute('role', 'region');
    body.setAttribute('aria-label', 'Game rules and paytable');
    this.buildBody(body);

    // Payout-calculation internals (RTP, formulas) are not shown to the player.
    // Kājene ir tukša: standalone spēles "RESET DEMO BALANCE" ir noņemts, jo
    // DominoPoker bilanci pārvalda serveris — spēle to nedrīkst papildināt.
    panel.append(title, this.closeButton, body);
    layer.appendChild(panel);
    this.dialog.appendChild(layer);

    // Scrim click closes (UI/UX 13.3): any click outside the panel.
    this.dialog.addEventListener('click', (event) => {
      if (event.target instanceof Node && !panel.contains(event.target)) this.dialog.close();
    });
    installEscapeToClose(this.dialog);
    this.dialog.addEventListener('close', () => {
      actions.onClose();
      // Deferred: the native <dialog> focus restore runs after this event and
      // would override an immediate focus() (UI/UX 13.3: focus returns to Rules).
      setTimeout(() => actions.returnFocus(), 0);
    });

    host.append(this.dialog);
  }

  /** Opens modally; focus lands on Close (UI/UX 13.3). */
  open(): void {
    this.dialog.showModal();
    this.closeButton.focus();
  }

  /** Closes the dialog, e.g. when portrait shows the rotate overlay (15.4). */
  close(): void {
    if (this.dialog.open) this.dialog.close();
  }

  // --- content -------------------------------------------------------------

  private buildBody(body: HTMLElement): void {
    const betList = SLOT_MATH_CONFIG.lineBetSteps.map((step) => step.toLocaleString('en-US')).join(', ');

    // 1. RULES
    body.append(
      plate('A107'),
      paragraph(
        `Pick a line bet of ${betList} coins with the MINUS and PLUS buttons, or press ` +
          `MAX BET for the highest bet. All ${SLOT_MATH_CONFIG.activeLines} lines are always active, ` +
          `so the total bet is the line bet times ${SLOT_MATH_CONFIG.activeLines}. Press SPIN to play.`,
      ),
    );

    // 2. PAY LINES
    body.append(
      plate('A106'),
      payLinesFigures(),
      paragraph(
        `${SLOT_MATH_CONFIG.activeLines} pay lines cross the reels: the 3 rows plus 8 patterns ` +
          'that bend across them. A winning combination is 3, 4 or 5 symbols next to each ' +
          'other ANYWHERE on a pay line — it does not have to start on the first reel. Only ' +
          'the single best combination on each line pays.',
      ),
    );

    // 3. MINOR SYMBOLS
    body.append(
      plate('A105'),
      paragraph('Domino tiles pay by strength group, from Royal Trumps down to Low Regular tiles:'),
    );
    for (const group of dominoTierGroups()) {
      const row = document.createElement('div');
      row.className = 'tier-row';
      const label = document.createElement('span');
      label.className = 'tier-label';
      label.textContent = group.label;
      row.appendChild(label);
      for (const id of group.ids) row.appendChild(symbolImage(id, ''));
      body.appendChild(row);
    }

    // 4. COMBINATIONS
    body.append(
      sectionTitle('COMBINATIONS'),
      paragraph(
        'Domino tiles are the heart of every combination. Wild and the major symbols can ' +
          'extend a combination, but never form one on their own.',
      ),
      paragraph(
        'EXACT - a run with at least 2 identical domino tiles; Wild and major symbols may ' +
          'sit between them.',
      ),
      paragraph('TRUMP COMBO - at least 3 mixed trump dominoes.'),
      paragraph('ACE COMBO - at least 3 mixed ace dominoes.'),
      paragraph(
        'TIER COMBO - at least 3 mixed dominoes from one regular group (Low, Mid or High Regular).',
      ),
      paragraph('ALL WILD - a full run of Wild symbols.'),
    );

    // 5. MAJOR SYMBOLS - boosters (math v3)
    body.append(
      plate('A104'),
      paragraph(
        'Major symbols do not pay on their own. Inside a winning domino combination they act ' +
          'like Wild AND boost the win — every major in the combination adds its bonus:',
      ),
    );
    const majorsRow = document.createElement('div');
    majorsRow.className = 'symbol-row';
    for (const major of MAJOR_ORDER) majorsRow.appendChild(symbolImage(major, MAJOR_LABELS[major]));
    body.appendChild(majorsRow);
    body.appendChild(boosterTable(buildBoosterModel()));

    // 6. SPECIAL SYMBOLS
    body.append(plate('A108'));
    body.append(
      specialRow('WILD', 'Wild', 'Substitutes for any domino inside a combination.'),
      specialRow(
        'WILD_FULL',
        'Full Wild reel',
        'Covers a whole reel and acts as Wild on every pay line that crosses it.',
      ),
      specialRow(
        'JACKPOT',
        'Jackpot',
        'Pays as a scatter anywhere on the reels, independent of the pay lines. ' +
          'It does not take part in line wins and is not replaced by Wild.',
      ),
    );

    // 7. PAYTABLE
    body.append(sectionTitle('PAYTABLE'));
    for (const section of buildPaytableModel()) {
      body.appendChild(paytableTable(section));
    }
    body.appendChild(scatterTable(buildScatterModel()));
  }
}

// --- small DOM helpers ------------------------------------------------------

/**
 * Escape closes only this (top-most focused) dialog (UI/UX section 17). The
 * explicit handler keeps the behaviour even where synthetic key events do not
 * produce a native close request; close() on an already-closed dialog is a
 * no-op, so coexisting with the native cancel path is safe.
 */
export function installEscapeToClose(dialog: HTMLDialogElement): void {
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    dialog.close();
  });
}

function paragraph(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function sectionTitle(text: string): HTMLHeadingElement {
  const h3 = document.createElement('h3');
  h3.className = 'section-title';
  h3.textContent = text;
  return h3;
}

/** Section header plate rendered at its native size (UI/UX 13.2). */
function plate(id: AssetId): HTMLImageElement {
  const definition = getAssetDefinition(id);
  const img = document.createElement('img');
  img.className = 'section-plate';
  img.src = definition.url;
  img.alt = '';
  img.style.width = `calc(${definition.sourceSize.width} * var(--px))`;
  return img;
}

function symbolImage(symbolId: string, alt: string): HTMLImageElement {
  const ids = SYMBOL_ASSET_IDS.get(symbolId);
  if (ids === undefined) throw new Error(`Unknown symbol id: ${symbolId}`);
  const img = document.createElement('img');
  img.src = getAssetDefinition(ids.final).url;
  img.alt = alt;
  return img;
}

function specialRow(symbolId: string, name: string, text: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'symbol-row';
  row.append(symbolImage(symbolId, name), paragraph(`${name.toUpperCase()} - ${text}`));
  return row;
}

/** One mini 5x3 diagram per payline pattern (UI/UX 13.2, math v3). */
function payLinesFigures(): HTMLDivElement {
  const svgNs = 'http://www.w3.org/2000/svg';
  const wrap = document.createElement('div');
  wrap.className = 'paylines-grid';
  PAYLINES.forEach((pattern, index) => {
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('viewBox', '0 0 110 70');
    svg.setAttribute('class', 'payline-figure');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Pay line ${index + 1}`);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 5; column++) {
        const cell = document.createElementNS(svgNs, 'rect');
        cell.setAttribute('x', String(4 + column * 21));
        cell.setAttribute('y', String(4 + row * 21));
        cell.setAttribute('width', '18');
        cell.setAttribute('height', '18');
        cell.setAttribute('rx', '3');
        cell.setAttribute('fill', 'rgba(242,193,78,0.08)');
        cell.setAttribute('stroke', 'rgba(242,193,78,0.45)');
        cell.setAttribute('stroke-width', '1');
        svg.appendChild(cell);
      }
    }
    const points = pattern
      .map((row, column) => `${4 + column * 21 + 9},${4 + row * 21 + 9}`)
      .join(' ');
    const line = document.createElementNS(svgNs, 'polyline');
    line.setAttribute('points', points);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#F2C14E');
    line.setAttribute('stroke-width', '3');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(line);
    wrap.appendChild(svg);
  });
  return wrap;
}

function boosterTable(rows: readonly BoosterRow[]): HTMLTableElement {
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const cell of ['MAJOR BOOSTER', 'bonus to the win']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = cell;
    head.appendChild(th);
  }
  const tbody = table.createTBody();
  for (const row of rows) {
    const tr = tbody.insertRow();
    tr.appendChild(rowHeader(row.label));
    tr.insertCell().textContent = row.boost;
  }
  return table;
}

function paytableTable(section: PaytableSection): HTMLTableElement {
  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.className = 'sr-only';
  caption.textContent = section.title;
  table.appendChild(caption);
  const head = table.createTHead().insertRow();
  for (const cell of [section.title, '3', '4', '5']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = cell;
    head.appendChild(th);
  }
  const tbody = table.createTBody();
  for (const row of section.rows) {
    const tr = tbody.insertRow();
    tr.appendChild(rowHeader(row.label));
    for (const pay of row.pays) tr.insertCell().textContent = pay;
  }
  return table;
}

function scatterTable(rows: readonly ScatterRow[]): HTMLTableElement {
  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.className = 'sr-only';
  caption.textContent = 'Jackpot scatter payouts';
  table.appendChild(caption);
  const head = table.createTHead().insertRow();
  for (const cell of ['JACKPOT SCATTER', 'x total bet']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = cell;
    head.appendChild(th);
  }
  const tbody = table.createTBody();
  for (const row of rows) {
    const tr = tbody.insertRow();
    tr.appendChild(rowHeader(row.label));
    tr.insertCell().textContent = row.pay;
  }
  return table;
}

/** Row labels are header cells so AT associates each payout with its row. */
function rowHeader(label: string): HTMLTableCellElement {
  const th = document.createElement('th');
  th.scope = 'row';
  th.textContent = label;
  return th;
}

