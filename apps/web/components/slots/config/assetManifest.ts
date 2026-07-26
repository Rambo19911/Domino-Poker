import { getDominoRank, getDominoTier, type DominoTier } from '@domino-poker/core/slots';
import { createDominoId } from '@domino-poker/core/slots';
import {
  CELL_SYMBOL_WEIGHTS,
  COLUMN_TOKEN_TOTAL,
  DOMINO_CELL_WEIGHT,
  FULL_WILD_WEIGHT,
} from '@domino-poker/core/slots';

export const EXPECTED_ASSET_COUNT = 116;

export type { DominoTier };

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect extends Point, Size {}

export const DESIGN_SIZE = { width: 1920, height: 1080 } as const;

export const CELL_POSITIONS = {
  P00: { bounds: { x: 423, y: 255, width: 215, height: 215 }, center: { x: 530.5, y: 362.5 } },
  P01: { bounds: { x: 638, y: 255, width: 215, height: 215 }, center: { x: 745.5, y: 362.5 } },
  P02: { bounds: { x: 853, y: 255, width: 215, height: 215 }, center: { x: 960.5, y: 362.5 } },
  P03: { bounds: { x: 1068, y: 255, width: 215, height: 215 }, center: { x: 1175.5, y: 362.5 } },
  P04: { bounds: { x: 1283, y: 255, width: 215, height: 215 }, center: { x: 1390.5, y: 362.5 } },
  P10: { bounds: { x: 423, y: 470, width: 215, height: 215 }, center: { x: 530.5, y: 577.5 } },
  P11: { bounds: { x: 638, y: 470, width: 215, height: 215 }, center: { x: 745.5, y: 577.5 } },
  P12: { bounds: { x: 853, y: 470, width: 215, height: 215 }, center: { x: 960.5, y: 577.5 } },
  P13: { bounds: { x: 1068, y: 470, width: 215, height: 215 }, center: { x: 1175.5, y: 577.5 } },
  P14: { bounds: { x: 1283, y: 470, width: 215, height: 215 }, center: { x: 1390.5, y: 577.5 } },
  P20: { bounds: { x: 423, y: 685, width: 215, height: 215 }, center: { x: 530.5, y: 792.5 } },
  P21: { bounds: { x: 638, y: 685, width: 215, height: 215 }, center: { x: 745.5, y: 792.5 } },
  P22: { bounds: { x: 853, y: 685, width: 215, height: 215 }, center: { x: 960.5, y: 792.5 } },
  P23: { bounds: { x: 1068, y: 685, width: 215, height: 215 }, center: { x: 1175.5, y: 792.5 } },
  P24: { bounds: { x: 1283, y: 685, width: 215, height: 215 }, center: { x: 1390.5, y: 792.5 } },
} as const;

export const COLUMN_POSITIONS = {
  C0: { bounds: { x: 423, y: 255, width: 215, height: 645 }, center: { x: 530.5, y: 577.5 } },
  C1: { bounds: { x: 638, y: 255, width: 215, height: 645 }, center: { x: 745.5, y: 577.5 } },
  C2: { bounds: { x: 853, y: 255, width: 215, height: 645 }, center: { x: 960.5, y: 577.5 } },
  C3: { bounds: { x: 1068, y: 255, width: 215, height: 645 }, center: { x: 1175.5, y: 577.5 } },
  C4: { bounds: { x: 1283, y: 255, width: 215, height: 645 }, center: { x: 1390.5, y: 577.5 } },
} as const;

export type AssetLayer =
  | 'background'
  | 'frame'
  | 'reel-background'
  | 'symbol'
  | 'header'
  | 'hud'
  | 'loader'
  | 'modal'
  | 'win-overlay'
  | 'qa-overlay';

export type AssetUsage = 'runtime' | 'conditional' | 'reserved' | 'qa-only';

export type AssetState =
  | 'always'
  | 'default'
  | 'hover'
  | 'pressed'
  | 'spinning'
  | 'autoplay-active'
  | 'loading'
  | 'modal-open'
  | 'win-presentation'
  | 'not-mounted'
  | 'qa-only';

export type Placement =
  | {
      readonly kind: 'static';
      readonly bounds: Rect;
      readonly scale: number;
    }
  | {
      readonly kind: 'multi-static';
      readonly bounds: readonly Rect[];
      readonly scale: number;
    }
  | {
      readonly kind: 'cell';
      readonly positionSet: 'P_CELL';
      readonly anchor: Point;
      readonly renderSize: 'native' | Size;
      readonly clipSize: Size;
    }
  | {
      readonly kind: 'column';
      readonly positionSet: 'P_COLUMN';
      readonly anchor: Point;
      readonly renderSize: Size;
      readonly clipSize: Size;
    }
  | {
      readonly kind: 'atlas';
      readonly frameSize: Size;
      readonly frameCount: number;
      readonly columns: number;
      readonly positionSet: 'P_CELL' | 'P_COLUMN' | 'OVERLAY';
    }
  | {
      readonly kind: 'flow';
      readonly container: 'RULES-BODY';
      readonly renderSize: 'native' | Size;
    }
  | {
      readonly kind: 'not-mounted';
      readonly intendedBounds: Rect;
      readonly reason: string;
    };

export type MathMetadata =
  | {
      readonly kind: 'domino';
      readonly symbolId: string;
      readonly rank: number;
      readonly tier: DominoTier;
      readonly pips: readonly [number, number];
      readonly cellWeight: 3;
    }
  | {
      readonly kind: 'major';
      readonly symbolId: 'BOOK' | 'SCARAB' | 'SCROLL' | 'VASE';
      readonly cellWeight: 6 | 7 | 8 | 9;
    }
  | {
      readonly kind: 'wild';
      readonly symbolId: 'WILD';
      readonly cellWeight: 7;
    }
  | {
      readonly kind: 'jackpot';
      readonly symbolId: 'JACKPOT';
      readonly cellWeight: 3;
    }
  | {
      readonly kind: 'full-wild';
      readonly symbolId: 'WILD_FULL';
      readonly columnWeight: 4;
      readonly columnWeightTotal: 128;
    };

// prettier-ignore
const ASSET_ID_LIST = [
  'A001', 'A002', 'A003', 'A004', 'A005', 'A006', 'A007', 'A008', 'A009', 'A010',
  'A011', 'A012', 'A013', 'A014', 'A015', 'A016', 'A017', 'A018', 'A019', 'A020',
  'A021', 'A022', 'A023', 'A024', 'A025', 'A026', 'A027', 'A028', 'A029', 'A030',
  'A031', 'A032', 'A033', 'A034', 'A035', 'A036', 'A037', 'A038', 'A039', 'A040',
  'A041', 'A042', 'A043', 'A044', 'A045', 'A046', 'A047', 'A048', 'A049', 'A050',
  'A051', 'A052', 'A053', 'A054', 'A055', 'A056', 'A057', 'A058', 'A059', 'A060',
  'A061', 'A062', 'A063', 'A064', 'A065', 'A066', 'A067', 'A068', 'A069', 'A070',
  'A071', 'A072', 'A073', 'A074', 'A075', 'A076', 'A077', 'A078', 'A079', 'A080',
  'A081', 'A082', 'A083', 'A084', 'A085', 'A086', 'A087', 'A088', 'A089', 'A090',
  'A091', 'A092', 'A093', 'A094', 'A095', 'A096', 'A097', 'A098', 'A099', 'A100',
  'A101', 'A102', 'A103', 'A104', 'A105', 'A106', 'A107', 'A108', 'A109', 'A110',
  'A111', 'A112', 'A113', 'A114', 'A115', 'A116',
] as const;

/** Closed literal union of the 116 registered asset ids (UI/UX section 22). */
export type AssetId = (typeof ASSET_ID_LIST)[number];

export interface AssetDefinition {
  readonly id: AssetId;
  readonly filePath: `assets/${string}.png`;
  /** Publiskais URL zem `/assets/slots/`; segmenti ir procentkodēti (skat. `toPublicUrl`). */
  readonly url: string;
  readonly sourceSize: Size;
  readonly placement: Placement;
  readonly layer: AssetLayer;
  readonly usage: AssetUsage;
  readonly state: AssetState;
  readonly role: string;
  readonly stateOf?: AssetId;
  readonly math?: MathMetadata;
}

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});
const size = (width: number, height: number): Size => ({ width, height });

const staticPlacement = (bounds: Rect, scale = 1): Placement => ({ kind: 'static', bounds, scale });
const multiStaticPlacement = (bounds: readonly Rect[], scale = 1): Placement => ({
  kind: 'multi-static',
  bounds,
  scale,
});

const NATIVE_CELL_PLACEMENT: Placement = {
  kind: 'cell',
  positionSet: 'P_CELL',
  anchor: { x: 0.5, y: 0.5 },
  renderSize: 'native',
  clipSize: { width: 215, height: 215 },
};

const BLUR_CELL_PLACEMENT: Placement = NATIVE_CELL_PLACEMENT;

const fullWildPlacement = (renderSize: Size): Placement => ({
  kind: 'column',
  positionSet: 'P_COLUMN',
  anchor: { x: 0.5, y: 0.5 },
  renderSize,
  clipSize: { width: 215, height: 645 },
});

const cellPlacement = (renderSize: Size): Placement => ({
  kind: 'cell',
  positionSet: 'P_CELL',
  anchor: { x: 0.5, y: 0.5 },
  renderSize,
  clipSize: { width: 215, height: 215 },
});

type AssetInput = Omit<AssetDefinition, 'url'>;

/** Publiskā bāze DominoPoker `apps/web/public/` iekšienē (integrācijas plāns, Fāze 4). */
const PUBLIC_BASE = '/assets/slots';

/**
 * `assets/dominoes tiles/0-0.png` -> `/assets/slots/dominoes%20tiles/0-0.png`.
 *
 * Vairākās mapēs nosaukumos ir ATSTARPES (`dominoes tiles`, `Blurr-tiles` vecāks,
 * `Coin Spin`, `Wild Full`). Katrs segments tiek kodēts TIEŠI VIENREIZ, saglabājot `/`:
 * `encodeURIComponent` pār visu ceļu sakodētu arī slīpsvītras, bet jau kodēta virkne,
 * palaista otrreiz, dotu `%2520`. Abi varianti dotu 404.
 */
function toPublicUrl(filePath: string): string {
  const relative = filePath.startsWith('assets/') ? filePath.slice('assets/'.length) : filePath;
  return `${PUBLIC_BASE}/${relative.split('/').map(encodeURIComponent).join('/')}`;
}

const defineAsset = (input: AssetInput): AssetDefinition => ({
  ...input,
  url: toPublicUrl(input.filePath),
});

// Rank, tier and pips are derived from the domain tables so the manifest can
// never drift from the production math (single source of truth).
const dominoAsset = (id: AssetId, symbolId: string, sourceSize: Size): AssetDefinition => {
  const [a, b] = symbolId.split('-').map(Number) as [number, number];
  const dominoId = createDominoId(a, b);
  const rank = getDominoRank(dominoId);
  const tier = getDominoTier(dominoId);
  return defineAsset({
    id,
    filePath: `assets/dominoes tiles/${symbolId}.png`,
    sourceSize,
    placement: NATIVE_CELL_PLACEMENT,
    layer: 'symbol',
    usage: 'conditional',
    state: 'default',
    role: `${symbolId} final domino; rank ${rank}; ${tier} exact and group-combo participant`,
    math: { kind: 'domino', symbolId, rank, tier, pips: [a, b], cellWeight: DOMINO_CELL_WEIGHT },
  });
};

const blurDominoAsset = (
  id: AssetId,
  symbolId: string,
  sourceSize: Size,
  stateOf: AssetId,
): AssetDefinition =>
  defineAsset({
    id,
    filePath: `assets/dominoes tiles/Blurr-tiles/${symbolId}.png`,
    sourceSize,
    placement: BLUR_CELL_PLACEMENT,
    layer: 'symbol',
    usage: 'conditional',
    state: 'spinning',
    role: `${symbolId} vertical motion/blur state`,
    stateOf,
  });

const definitions: readonly AssetDefinition[] = [
  defineAsset({
    id: 'A001',
    filePath: 'assets/AutoSpin-hover.png',
    sourceSize: size(94, 59),
    placement: staticPlacement(rect(1014, 962, 188, 118), 2),
    layer: 'hud',
    usage: 'conditional',
    state: 'hover',
    role: 'Auto Spin hover/pressed visual before autoplay starts',
    stateOf: 'A002',
  }),
  defineAsset({
    id: 'A002',
    filePath: 'assets/AutoSpin.png',
    sourceSize: size(94, 59),
    placement: staticPlacement(rect(1014, 962, 188, 118), 2),
    layer: 'hud',
    usage: 'runtime',
    state: 'default',
    role: 'Opens the Auto Spin amount dialog',
  }),
  defineAsset({
    id: 'A003',
    filePath: 'assets/Background.png',
    sourceSize: size(960, 540),
    placement: staticPlacement(rect(0, 0, 1920, 1080), 2),
    layer: 'background',
    usage: 'runtime',
    state: 'always',
    role: 'Full-screen Egyptian landscape background',
  }),
  defineAsset({
    id: 'A004',
    filePath: 'assets/Balance.png',
    sourceSize: size(154, 62),
    placement: staticPlacement(rect(1182, 948, 308, 124), 2),
    layer: 'hud',
    usage: 'runtime',
    state: 'always',
    role: 'Balance value panel frame',
  }),
  defineAsset({
    id: 'A005',
    filePath: 'assets/Button Spin-hover.png',
    sourceSize: size(152, 61),
    placement: staticPlacement(rect(809, 951, 304, 122), 2),
    layer: 'hud',
    usage: 'conditional',
    state: 'hover',
    role: 'Primary Spin hover/pressed visual',
    stateOf: 'A006',
  }),
  defineAsset({
    id: 'A006',
    filePath: 'assets/Button Spin.png',
    sourceSize: size(152, 61),
    placement: staticPlacement(rect(809, 951, 304, 122), 2),
    layer: 'hud',
    usage: 'runtime',
    state: 'default',
    role: 'Primary Spin button',
  }),
  defineAsset({
    id: 'A007',
    filePath: 'assets/ButtonMinus.png',
    sourceSize: size(48, 50),
    placement: staticPlacement(rect(469, 987, 48, 50)),
    layer: 'hud',
    usage: 'runtime',
    state: 'default',
    role: 'Decreases line bet by one configured step',
  }),
  defineAsset({
    id: 'A008',
    filePath: 'assets/ButtonMinusHover.png',
    sourceSize: size(48, 50),
    placement: staticPlacement(rect(469, 987, 48, 50)),
    layer: 'hud',
    usage: 'conditional',
    state: 'hover',
    role: 'Minus button hover/pressed visual',
    stateOf: 'A007',
  }),
  defineAsset({
    id: 'A009',
    filePath: 'assets/ButtonPlus.png',
    sourceSize: size(48, 50),
    placement: staticPlacement(rect(654, 987, 48, 50)),
    layer: 'hud',
    usage: 'runtime',
    state: 'default',
    role: 'Increases line bet by one configured step',
  }),
  defineAsset({
    id: 'A010',
    filePath: 'assets/ButtonPlusHover.png',
    sourceSize: size(48, 50),
    placement: staticPlacement(rect(654, 987, 48, 50)),
    layer: 'hud',
    usage: 'conditional',
    state: 'hover',
    role: 'Plus button hover/pressed visual',
    stateOf: 'A009',
  }),
  defineAsset({
    id: 'A011',
    filePath: 'assets/ButtonRules.png',
    sourceSize: size(79, 80),
    placement: staticPlacement(rect(1819, 8, 79, 80)),
    layer: 'header',
    usage: 'runtime',
    state: 'default',
    role: 'Opens the Rules and Paytable dialog',
  }),
  defineAsset({
    id: 'A012',
    filePath: 'assets/ButtonRulesHover.png',
    sourceSize: size(79, 80),
    placement: staticPlacement(rect(1819, 8, 79, 80)),
    layer: 'header',
    usage: 'conditional',
    state: 'hover',
    role: 'Rules button hover/pressed visual',
    stateOf: 'A011',
  }),
  defineAsset({
    id: 'A013',
    filePath: 'assets/ButtonSpin.png',
    sourceSize: size(305, 158),
    placement: {
      kind: 'not-mounted',
      intendedBounds: rect(808, 922, 305, 158),
      reason: 'Reserved localized Spin background; opaque brown canvas is not used in v1',
    },
    layer: 'hud',
    usage: 'reserved',
    state: 'not-mounted',
    role: 'Alternative blank Spin button background for future redraw/localization',
  }),
  defineAsset({
    id: 'A014',
    filePath: 'assets/ButtonSpinHover.png',
    sourceSize: size(305, 158),
    placement: {
      kind: 'not-mounted',
      intendedBounds: rect(808, 922, 305, 158),
      reason: 'Reserved pair for A013; not mounted in v1',
    },
    layer: 'hud',
    usage: 'reserved',
    state: 'not-mounted',
    role: 'Alternative localized Spin hover background',
    stateOf: 'A013',
  }),
  defineAsset({
    id: 'A015',
    filePath: 'assets/CloseButton.png',
    sourceSize: size(41, 42),
    placement: staticPlacement(rect(1535, 165, 82, 84), 2),
    layer: 'modal',
    usage: 'conditional',
    state: 'modal-open',
    role: 'Rules dialog close-button background; the white X is drawn programmatically',
  }),
  defineAsset({
    id: 'A016',
    filePath: 'assets/Game Screen Horizontal-web-full.png',
    sourceSize: size(1920, 1080),
    placement: staticPlacement(rect(0, 0, 1920, 1080)),
    layer: 'qa-overlay',
    usage: 'qa-only',
    state: 'qa-only',
    role: '1920x1080 visual reference used only by screenshot comparison tests',
  }),
  defineAsset({
    id: 'A017',
    filePath: 'assets/Hold-hover.png',
    sourceSize: size(63, 38),
    placement: staticPlacement(rect(1045, 983, 126, 76), 2),
    layer: 'hud',
    usage: 'conditional',
    state: 'hover',
    role: 'Active Auto Spin stop-after-current-spin hover visual; it does not hold reels',
    stateOf: 'A018',
  }),
  defineAsset({
    id: 'A018',
    filePath: 'assets/Hold-normal.png',
    sourceSize: size(63, 38),
    placement: staticPlacement(rect(1045, 983, 126, 76), 2),
    layer: 'hud',
    usage: 'conditional',
    state: 'autoplay-active',
    role: 'Replaces Auto Spin while autoplay is active and requests stop after the current spin',
  }),
  defineAsset({
    id: 'A019',
    filePath: 'assets/Jackpot.png',
    sourceSize: size(184, 45),
    placement: staticPlacement(rect(781, 37, 368, 90), 2),
    layer: 'header',
    usage: 'runtime',
    state: 'always',
    role: 'Jackpot header label above the dynamic scatter value',
  }),
  defineAsset({
    id: 'A020',
    filePath: 'assets/LoadBarEmpty.png',
    sourceSize: size(148, 35),
    placement: staticPlacement(rect(812, 520, 296, 70), 2),
    layer: 'loader',
    usage: 'runtime',
    state: 'loading',
    role: 'Empty loading-bar frame',
  }),
  defineAsset({
    id: 'A021',
    filePath: 'assets/LoadBarFull.png',
    sourceSize: size(148, 35),
    placement: staticPlacement(rect(812, 520, 296, 70), 2),
    layer: 'loader',
    usage: 'runtime',
    state: 'loading',
    role: 'Loading progress fill clipped by A022',
  }),
  defineAsset({
    id: 'A022',
    filePath: 'assets/LoadBarMask.png',
    sourceSize: size(297, 72),
    placement: staticPlacement(rect(811, 519, 297, 72)),
    layer: 'loader',
    usage: 'runtime',
    state: 'loading',
    role: 'Native-size clipping mask for A021 loading progress',
  }),
  defineAsset({
    id: 'A023',
    filePath: 'assets/Max Bet-hover.png',
    sourceSize: size(94, 59),
    placement: staticPlacement(rect(719, 962, 188, 118), 2),
    layer: 'hud',
    usage: 'conditional',
    state: 'hover',
    role: 'Max Bet hover/pressed visual',
    stateOf: 'A024',
  }),
  defineAsset({
    id: 'A024',
    filePath: 'assets/Max Bet.png',
    sourceSize: size(94, 59),
    placement: staticPlacement(rect(719, 962, 188, 118), 2),
    layer: 'hud',
    usage: 'runtime',
    state: 'default',
    role: 'Sets line bet to 1000 without starting a spin',
  }),
  defineAsset({
    id: 'A025',
    filePath: 'assets/Ra.png',
    sourceSize: size(209, 46),
    placement: multiStaticPlacement([rect(750, 163, 418, 92), rect(751, 420, 418, 92)], 2),
    layer: 'header',
    usage: 'runtime',
    state: 'always',
    role: 'Header ornament and loading-screen brand mark',
  }),
  defineAsset({
    id: 'A026',
    filePath: 'assets/SlotMachine3x5.png',
    sourceSize: size(1075, 645),
    placement: staticPlacement(rect(423, 255, 1075, 645)),
    layer: 'reel-background',
    usage: 'runtime',
    state: 'always',
    role: 'Native-size dark 5x3 reel background and viewport',
  }),
  defineAsset({
    id: 'A027',
    filePath: 'assets/Temple.png',
    sourceSize: size(846, 540),
    placement: staticPlacement(rect(114, 0, 1692, 1080), 2),
    layer: 'frame',
    usage: 'runtime',
    state: 'always',
    role: 'Temple frame and lower HUD foundation',
  }),
  defineAsset({
    id: 'A028',
    filePath: 'assets/Total Bet.png',
    sourceSize: size(154, 66),
    placement: staticPlacement(rect(431, 947, 308, 132), 2),
    layer: 'hud',
    usage: 'runtime',
    state: 'always',
    role: 'Total Bet panel frame including the plus/minus visual slots',
  }),
  defineAsset({
    id: 'A029',
    filePath: 'assets/win.png',
    sourceSize: size(134, 62),
    placement: staticPlacement(rect(1468, 948, 268, 124), 2),
    layer: 'hud',
    usage: 'runtime',
    state: 'always',
    role: 'Last-spin win value panel frame',
  }),

  dominoAsset('A030', '0-0', size(82, 157)),
  dominoAsset('A031', '0-1', size(84, 160)),
  dominoAsset('A032', '0-2', size(84, 161)),
  dominoAsset('A033', '0-3', size(84, 159)),
  dominoAsset('A034', '0-4', size(86, 161)),
  dominoAsset('A035', '0-5', size(84, 161)),
  dominoAsset('A036', '0-6', size(84, 159)),
  dominoAsset('A037', '1-1', size(83, 162)),
  dominoAsset('A038', '1-2', size(84, 160)),
  dominoAsset('A039', '1-3', size(84, 159)),
  dominoAsset('A040', '1-4', size(84, 161)),
  dominoAsset('A041', '1-5', size(84, 162)),
  dominoAsset('A042', '1-6', size(84, 161)),
  dominoAsset('A043', '2-2', size(84, 161)),
  dominoAsset('A044', '2-3', size(84, 160)),
  dominoAsset('A045', '2-4', size(84, 160)),
  dominoAsset('A046', '2-5', size(85, 161)),
  dominoAsset('A047', '2-6', size(84, 160)),
  dominoAsset('A048', '3-3', size(84, 161)),
  dominoAsset('A049', '3-4', size(83, 160)),
  dominoAsset('A050', '3-5', size(84, 160)),
  dominoAsset('A051', '3-6', size(83, 160)),
  dominoAsset('A052', '4-4', size(84, 160)),
  dominoAsset('A053', '4-5', size(84, 159)),
  dominoAsset('A054', '4-6', size(84, 160)),
  dominoAsset('A055', '5-5', size(84, 160)),
  dominoAsset('A056', '5-6', size(84, 159)),
  dominoAsset('A057', '6-6', size(84, 160)),

  blurDominoAsset('A058', '0-0', size(82, 157), 'A030'),
  blurDominoAsset('A059', '0-1', size(84, 160), 'A031'),
  blurDominoAsset('A060', '0-2', size(84, 161), 'A032'),
  blurDominoAsset('A061', '0-3', size(84, 159), 'A033'),
  blurDominoAsset('A062', '0-4', size(86, 161), 'A034'),
  blurDominoAsset('A063', '0-5', size(84, 161), 'A035'),
  blurDominoAsset('A064', '0-6', size(84, 159), 'A036'),
  blurDominoAsset('A065', '1-1', size(83, 162), 'A037'),
  blurDominoAsset('A066', '1-2', size(84, 160), 'A038'),
  blurDominoAsset('A067', '1-3', size(84, 159), 'A039'),
  blurDominoAsset('A068', '1-4', size(84, 161), 'A040'),
  blurDominoAsset('A069', '1-5', size(84, 162), 'A041'),
  blurDominoAsset('A070', '1-6', size(84, 161), 'A042'),
  blurDominoAsset('A071', '2-2', size(84, 161), 'A043'),
  blurDominoAsset('A072', '2-3', size(84, 160), 'A044'),
  blurDominoAsset('A073', '2-4', size(84, 160), 'A045'),
  blurDominoAsset('A074', '2-5', size(85, 161), 'A046'),
  blurDominoAsset('A075', '2-6', size(84, 160), 'A047'),
  blurDominoAsset('A076', '3-3', size(84, 161), 'A048'),
  blurDominoAsset('A077', '3-4', size(83, 160), 'A049'),
  blurDominoAsset('A078', '3-5', size(84, 160), 'A050'),
  blurDominoAsset('A079', '3-6', size(83, 160), 'A051'),
  blurDominoAsset('A080', '4-4', size(84, 160), 'A052'),
  blurDominoAsset('A081', '4-5', size(84, 159), 'A053'),
  blurDominoAsset('A082', '4-6', size(84, 160), 'A054'),
  blurDominoAsset('A083', '5-5', size(84, 160), 'A055'),
  blurDominoAsset('A084', '5-6', size(84, 159), 'A056'),
  blurDominoAsset('A085', '6-6', size(84, 160), 'A057'),

  defineAsset({
    id: 'A086',
    filePath: 'assets/dominoes tiles/Book-Major.png',
    sourceSize: size(108, 107),
    placement: cellPlacement(size(216, 214)),
    layer: 'symbol',
    usage: 'conditional',
    state: 'default',
    role: 'Book major booster symbol (substitutes and boosts a domino run)',
    math: { kind: 'major', symbolId: 'BOOK', cellWeight: 7 },
  }),
  defineAsset({
    id: 'A087',
    filePath: 'assets/dominoes tiles/Jackpot-Special.png',
    sourceSize: size(108, 108),
    placement: cellPlacement(size(216, 216)),
    layer: 'symbol',
    usage: 'conditional',
    state: 'default',
    role: 'Jackpot scatter symbol; never part of line combinations',
    math: { kind: 'jackpot', symbolId: 'JACKPOT', cellWeight: 3 },
  }),
  defineAsset({
    id: 'A088',
    filePath: 'assets/dominoes tiles/Scarab-Major.png',
    sourceSize: size(108, 100),
    placement: cellPlacement(size(216, 200)),
    layer: 'symbol',
    usage: 'conditional',
    state: 'default',
    role: 'Scarab, the strongest major booster symbol',
    math: { kind: 'major', symbolId: 'SCARAB', cellWeight: 6 },
  }),
  defineAsset({
    id: 'A089',
    filePath: 'assets/dominoes tiles/Scroll-Major.png',
    sourceSize: size(107, 108),
    placement: cellPlacement(size(214, 216)),
    layer: 'symbol',
    usage: 'conditional',
    state: 'default',
    role: 'Scroll major booster symbol (substitutes and boosts a domino run)',
    math: { kind: 'major', symbolId: 'SCROLL', cellWeight: 8 },
  }),
  defineAsset({
    id: 'A090',
    filePath: 'assets/dominoes tiles/Vase-Major.png',
    sourceSize: size(107, 108),
    placement: cellPlacement(size(214, 216)),
    layer: 'symbol',
    usage: 'conditional',
    state: 'default',
    role: 'Vase major booster symbol (substitutes and boosts a domino run)',
    math: { kind: 'major', symbolId: 'VASE', cellWeight: 9 },
  }),
  defineAsset({
    id: 'A091',
    filePath: 'assets/dominoes tiles/WildFull-Special.png',
    sourceSize: size(108, 323),
    placement: fullWildPlacement(size(216, 646)),
    layer: 'symbol',
    usage: 'conditional',
    state: 'default',
    role: 'Stacked Wild covering all three rows in one column',
    math: { kind: 'full-wild', symbolId: 'WILD_FULL', columnWeight: 4, columnWeightTotal: 128 },
  }),
  defineAsset({
    id: 'A092',
    filePath: 'assets/dominoes tiles/Wild-Special.png',
    sourceSize: size(108, 108),
    placement: cellPlacement(size(216, 216)),
    layer: 'symbol',
    usage: 'conditional',
    state: 'default',
    role: 'Line Wild substitute; never substitutes for Jackpot scatter',
    math: { kind: 'wild', symbolId: 'WILD', cellWeight: 7 },
  }),

  defineAsset({
    id: 'A093',
    filePath: 'assets/dominoes tiles/Blurr-tiles/BookBlurred.png',
    sourceSize: size(215, 258),
    placement: BLUR_CELL_PLACEMENT,
    layer: 'symbol',
    usage: 'conditional',
    state: 'spinning',
    role: 'Book vertical motion/blur state',
    stateOf: 'A086',
  }),
  defineAsset({
    id: 'A094',
    filePath: 'assets/dominoes tiles/Blurr-tiles/JackpotBlurred.png',
    sourceSize: size(215, 258),
    placement: BLUR_CELL_PLACEMENT,
    layer: 'symbol',
    usage: 'conditional',
    state: 'spinning',
    role: 'Jackpot vertical motion/blur state',
    stateOf: 'A087',
  }),
  defineAsset({
    id: 'A095',
    filePath: 'assets/dominoes tiles/Blurr-tiles/ScarabBlurred.png',
    sourceSize: size(215, 258),
    placement: BLUR_CELL_PLACEMENT,
    layer: 'symbol',
    usage: 'conditional',
    state: 'spinning',
    role: 'Scarab vertical motion/blur state',
    stateOf: 'A088',
  }),
  defineAsset({
    id: 'A096',
    filePath: 'assets/dominoes tiles/Blurr-tiles/ScrollBlurred.png',
    sourceSize: size(215, 258),
    placement: BLUR_CELL_PLACEMENT,
    layer: 'symbol',
    usage: 'conditional',
    state: 'spinning',
    role: 'Scroll vertical motion/blur state',
    stateOf: 'A089',
  }),
  defineAsset({
    id: 'A097',
    filePath: 'assets/dominoes tiles/Blurr-tiles/VaseBlurred.png',
    sourceSize: size(215, 258),
    placement: BLUR_CELL_PLACEMENT,
    layer: 'symbol',
    usage: 'conditional',
    state: 'spinning',
    role: 'Vase vertical motion/blur state',
    stateOf: 'A090',
  }),
  defineAsset({
    id: 'A098',
    filePath: 'assets/dominoes tiles/Blurr-tiles/WildBlurred.png',
    sourceSize: size(215, 258),
    placement: BLUR_CELL_PLACEMENT,
    layer: 'symbol',
    usage: 'conditional',
    state: 'spinning',
    role: 'Wild vertical motion/blur state',
    stateOf: 'A092',
  }),
  defineAsset({
    id: 'A099',
    filePath: 'assets/dominoes tiles/Blurr-tiles/WildFullBlurred.png',
    sourceSize: size(215, 774),
    placement: fullWildPlacement(size(215, 774)),
    layer: 'symbol',
    usage: 'conditional',
    state: 'spinning',
    role: 'Full-height Wild vertical motion/blur state clipped to one 215x645 column',
    stateOf: 'A091',
  }),

  defineAsset({
    id: 'A100',
    filePath: 'assets/FreeSpinPanel.png',
    sourceSize: size(651, 320),
    placement: {
      kind: 'not-mounted',
      intendedBounds: rect(634, 417, 651, 320),
      reason: 'Reserved FREE SPIN overlay; the v1 math has no free spin mechanic',
    },
    layer: 'win-overlay',
    usage: 'reserved',
    state: 'not-mounted',
    role: 'FREE SPIN papyrus panel reserved for a future free spin feature',
  }),
  defineAsset({
    id: 'A101',
    filePath: 'assets/HugeWinPanel.png',
    sourceSize: size(650, 320),
    placement: staticPlacement(rect(635, 417, 650, 320)),
    layer: 'win-overlay',
    usage: 'conditional',
    state: 'win-presentation',
    role: 'HUGE WIN overlay panel for wins >= 10x total bet; amount drawn on the empty papyrus area',
  }),
  defineAsset({
    id: 'A102',
    filePath: 'assets/JackpotWinPanel.png',
    sourceSize: size(650, 320),
    placement: staticPlacement(rect(635, 417, 650, 320)),
    layer: 'win-overlay',
    usage: 'conditional',
    state: 'win-presentation',
    role: 'JACKPOT overlay panel for scatter wins; scatter amount drawn on the empty papyrus area',
  }),
  defineAsset({
    id: 'A103',
    filePath: 'assets/MegaWinPanel.png',
    sourceSize: size(650, 320),
    placement: staticPlacement(rect(635, 417, 650, 320)),
    layer: 'win-overlay',
    usage: 'conditional',
    state: 'win-presentation',
    role: 'MEGA WIN overlay panel for wins >= 100x total bet; amount drawn on the empty papyrus area',
  }),
  defineAsset({
    id: 'A104',
    filePath: 'assets/TitleMajorSymbols.png',
    sourceSize: size(514, 75),
    placement: { kind: 'flow', container: 'RULES-BODY', renderSize: 'native' },
    layer: 'modal',
    usage: 'conditional',
    state: 'modal-open',
    role: 'MAJOR SYMBOLS section header plate in the Rules dialog',
  }),
  defineAsset({
    id: 'A105',
    filePath: 'assets/TitleMinorSymbols.png',
    sourceSize: size(540, 76),
    placement: { kind: 'flow', container: 'RULES-BODY', renderSize: 'native' },
    layer: 'modal',
    usage: 'conditional',
    state: 'modal-open',
    role: 'MINOR SYMBOLS (domino tiers) section header plate in the Rules dialog',
  }),
  defineAsset({
    id: 'A106',
    filePath: 'assets/TitlePayLines.png',
    sourceSize: size(333, 76),
    placement: { kind: 'flow', container: 'RULES-BODY', renderSize: 'native' },
    layer: 'modal',
    usage: 'conditional',
    state: 'modal-open',
    role: 'PAY LINES section header plate in the Rules dialog',
  }),
  defineAsset({
    id: 'A107',
    filePath: 'assets/TitleRules.png',
    sourceSize: size(218, 76),
    placement: { kind: 'flow', container: 'RULES-BODY', renderSize: 'native' },
    layer: 'modal',
    usage: 'conditional',
    state: 'modal-open',
    role: 'RULES section header plate in the Rules dialog',
  }),
  defineAsset({
    id: 'A108',
    filePath: 'assets/TitleSpecialSymbols.png',
    sourceSize: size(547, 75),
    placement: { kind: 'flow', container: 'RULES-BODY', renderSize: 'native' },
    layer: 'modal',
    usage: 'conditional',
    state: 'modal-open',
    role: 'SPECIAL SYMBOLS section header plate in the Rules dialog',
  }),

  defineAsset({
    id: 'A109',
    filePath: 'assets/Animations/Book/BookSheet.png',
    sourceSize: size(2580, 430),
    placement: {
      kind: 'atlas',
      frameSize: { width: 215, height: 215 },
      frameCount: 24,
      columns: 12,
      positionSet: 'P_CELL',
    },
    layer: 'symbol',
    usage: 'conditional',
    state: 'win-presentation',
    role: 'Book 24-frame win animation sheet played in the winning cell',
    stateOf: 'A086',
  }),
  defineAsset({
    id: 'A110',
    filePath: 'assets/Animations/Coin Spin/CoinSheet.png',
    sourceSize: size(600, 100),
    placement: {
      kind: 'atlas',
      frameSize: { width: 100, height: 100 },
      frameCount: 6,
      columns: 6,
      positionSet: 'OVERLAY',
    },
    layer: 'win-overlay',
    usage: 'conditional',
    state: 'win-presentation',
    role: 'Spinning coin 6-frame sheet used as celebration particles with the win overlay panels',
  }),
  defineAsset({
    id: 'A111',
    filePath: 'assets/Animations/Jackpot/JackpotSheet.png',
    sourceSize: size(2580, 430),
    placement: {
      kind: 'atlas',
      frameSize: { width: 215, height: 215 },
      frameCount: 24,
      columns: 12,
      positionSet: 'P_CELL',
    },
    layer: 'symbol',
    usage: 'conditional',
    state: 'win-presentation',
    role: 'Jackpot scatter 24-frame win animation sheet played in each scatter cell',
    stateOf: 'A087',
  }),
  defineAsset({
    id: 'A112',
    filePath: 'assets/Animations/Scarab/ScarabSheet.png',
    sourceSize: size(2580, 430),
    placement: {
      kind: 'atlas',
      frameSize: { width: 215, height: 215 },
      frameCount: 24,
      columns: 12,
      positionSet: 'P_CELL',
    },
    layer: 'symbol',
    usage: 'conditional',
    state: 'win-presentation',
    role: 'Scarab 24-frame win animation sheet played in the winning cell',
    stateOf: 'A088',
  }),
  defineAsset({
    id: 'A113',
    filePath: 'assets/Animations/Scroll/ScrollSheet.png',
    sourceSize: size(2580, 430),
    placement: {
      kind: 'atlas',
      frameSize: { width: 215, height: 215 },
      frameCount: 24,
      columns: 12,
      positionSet: 'P_CELL',
    },
    layer: 'symbol',
    usage: 'conditional',
    state: 'win-presentation',
    role: 'Scroll 24-frame win animation sheet played in the winning cell',
    stateOf: 'A089',
  }),
  defineAsset({
    id: 'A114',
    filePath: 'assets/Animations/Vase/VaseSheet.png',
    sourceSize: size(2580, 430),
    placement: {
      kind: 'atlas',
      frameSize: { width: 215, height: 215 },
      frameCount: 24,
      columns: 12,
      positionSet: 'P_CELL',
    },
    layer: 'symbol',
    usage: 'conditional',
    state: 'win-presentation',
    role: 'Vase 24-frame win animation sheet played in the winning cell',
    stateOf: 'A090',
  }),
  defineAsset({
    id: 'A115',
    filePath: 'assets/Animations/Wild/WildSheet.png',
    sourceSize: size(2580, 430),
    placement: {
      kind: 'atlas',
      frameSize: { width: 215, height: 215 },
      frameCount: 24,
      columns: 12,
      positionSet: 'P_CELL',
    },
    layer: 'symbol',
    usage: 'conditional',
    state: 'win-presentation',
    role: 'Wild 24-frame win animation sheet played in the winning cell',
    stateOf: 'A092',
  }),
  defineAsset({
    id: 'A116',
    filePath: 'assets/Animations/Wild Full/WildFullSheet.png',
    sourceSize: size(2580, 1290),
    placement: {
      kind: 'atlas',
      frameSize: { width: 215, height: 645 },
      frameCount: 24,
      columns: 12,
      positionSet: 'P_COLUMN',
    },
    layer: 'symbol',
    usage: 'conditional',
    state: 'win-presentation',
    role: 'Full-column Wild 24-frame win animation sheet played over the whole winning column',
    stateOf: 'A091',
  }),
];

export const ASSET_MANIFEST: Readonly<Record<AssetId, AssetDefinition>> = Object.freeze(
  Object.fromEntries(definitions.map((asset) => [asset.id, Object.freeze(asset)])),
) as Readonly<Record<AssetId, AssetDefinition>>;

export const ASSET_IDS = Object.freeze(definitions.map((asset) => asset.id));
export const ASSET_URLS = Object.freeze(definitions.map((asset) => asset.url));

/** URLs the game may actually load: excludes qa-only and reserved assets. */
export const RUNTIME_ASSET_URLS = Object.freeze(
  definitions
    .filter((asset) => asset.usage !== 'qa-only' && asset.usage !== 'reserved')
    .map((asset) => asset.url),
);

/** Safe manifest lookup under noUncheckedIndexedAccess; the id set is closed. */
export function getAssetDefinition(id: AssetId): AssetDefinition {
  const definition = ASSET_MANIFEST[id];
  if (definition === undefined) throw new Error(`Unknown asset id: ${id}`);
  return definition;
}

/** Loading bundles from plan section 13: shell, symbols, blur, fx. */
export type BundleName = 'shell' | 'symbols' | 'blur' | 'fx';

export function bundleOfAsset(asset: AssetDefinition): BundleName {
  if (
    asset.layer === 'win-overlay' ||
    asset.placement.kind === 'atlas' ||
    asset.placement.kind === 'flow'
  ) {
    return 'fx';
  }
  if (asset.layer === 'symbol') {
    return asset.state === 'spinning' ? 'blur' : 'symbols';
  }
  return 'shell';
}

export interface BundleManifest {
  readonly bundles: readonly {
    readonly name: BundleName;
    readonly assets: readonly { readonly alias: AssetId; readonly src: string }[];
  }[];
}

/** PixiJS Assets manifest keyed by asset id; excludes qa-only and reserved files. */
export function createBundleManifest(): BundleManifest {
  const names: readonly BundleName[] = ['shell', 'symbols', 'blur', 'fx'];
  const loadable = definitions.filter(
    (asset) => asset.usage !== 'qa-only' && asset.usage !== 'reserved',
  );
  return {
    bundles: names.map((name) => ({
      name,
      assets: loadable
        .filter((asset) => bundleOfAsset(asset) === name)
        .map((asset) => ({ alias: asset.id, src: asset.url })),
    })),
  };
}

export interface SymbolAssetIds {
  readonly final: AssetId;
  readonly blur: AssetId;
}

/** Maps every math symbol id (28 dominoes + 7 specials) to its final and blur asset. */
export const SYMBOL_ASSET_IDS: ReadonlyMap<string, SymbolAssetIds> = (() => {
  const blurByFinal = new Map<string, AssetId>();
  definitions.forEach((asset) => {
    if (asset.stateOf && asset.state === 'spinning') blurByFinal.set(asset.stateOf, asset.id);
  });
  const map = new Map<string, SymbolAssetIds>();
  definitions.forEach((asset) => {
    if (!asset.math) return;
    const blur = blurByFinal.get(asset.id);
    if (blur === undefined) {
      throw new Error(`Missing blur asset for symbol ${asset.math.symbolId}`);
    }
    map.set(asset.math.symbolId, { final: asset.id, blur });
  });
  return map;
})();

export function validateAssetManifest(): true {
  const ids = Object.keys(ASSET_MANIFEST);
  if (ids.length !== EXPECTED_ASSET_COUNT) {
    throw new Error(`Expected ${EXPECTED_ASSET_COUNT} assets, received ${ids.length}`);
  }

  const expectedIds = Array.from(
    { length: EXPECTED_ASSET_COUNT },
    (_, index) => `A${String(index + 1).padStart(3, '0')}`,
  );
  const uniquePaths = new Set<string>();

  if (ASSET_ID_LIST.length !== EXPECTED_ASSET_COUNT) {
    throw new Error(
      `Asset id list has ${ASSET_ID_LIST.length} ids, expected ${EXPECTED_ASSET_COUNT}`,
    );
  }
  expectedIds.forEach((expectedId, index) => {
    const asset = definitions[index];
    if (asset === undefined) {
      throw new Error(`Missing asset definition at index ${index}`);
    }
    if (asset.id !== expectedId || ASSET_ID_LIST[index] !== expectedId) {
      throw new Error(
        `Asset sequence mismatch at index ${index}: expected ${expectedId}, received ${asset.id}`,
      );
    }
    if (ASSET_MANIFEST[asset.id] !== asset) {
      throw new Error(`Manifest lookup mismatch for ${expectedId}`);
    }
  });

  definitions.forEach((asset) => {
    if (uniquePaths.has(asset.filePath)) {
      throw new Error(`Duplicate asset path: ${asset.filePath}`);
    }
    uniquePaths.add(asset.filePath);

    // URL bāze ir `/assets/slots/` ar per-segmenta kodējumu (sk. `toPublicUrl`),
    // nevis vairs `/${filePath}`; validators to pārbauda pret to pašu funkciju.
    if (asset.url !== toPublicUrl(asset.filePath)) {
      throw new Error(`Runtime URL mismatch for ${asset.id}: ${asset.url}`);
    }
    if (asset.sourceSize.width <= 0 || asset.sourceSize.height <= 0) {
      throw new Error(`Invalid source dimensions for ${asset.id}`);
    }
    if (asset.role.trim().length === 0) {
      throw new Error(`Missing role for ${asset.id}`);
    }
    if (asset.stateOf && !ASSET_MANIFEST[asset.stateOf]) {
      throw new Error(`Missing state target ${asset.stateOf} for ${asset.id}`);
    }
  });

  // Math metadata must agree with the authoritative weights in mathConfig.
  definitions.forEach((asset) => {
    const math = asset.math;
    if (!math) return;
    if (math.kind === 'domino') {
      if (math.cellWeight !== DOMINO_CELL_WEIGHT) {
        throw new Error(`Domino weight mismatch for ${asset.id}`);
      }
    } else if (math.kind === 'full-wild') {
      if (math.columnWeight !== FULL_WILD_WEIGHT || math.columnWeightTotal !== COLUMN_TOKEN_TOTAL) {
        throw new Error(`Full wild weight mismatch for ${asset.id}`);
      }
    } else if (CELL_SYMBOL_WEIGHTS.get(math.symbolId) !== math.cellWeight) {
      throw new Error(`Cell weight mismatch for ${asset.id} (${math.symbolId})`);
    }
  });

  const mathAssets = definitions.filter((asset) => asset.math);
  const blurAssets = definitions.filter((asset) => asset.stateOf && asset.state === 'spinning');
  const winSheetAssets = definitions.filter(
    (asset) => asset.stateOf && asset.state === 'win-presentation',
  );
  if (mathAssets.length !== 35) {
    throw new Error(`Expected 35 final math symbols, received ${mathAssets.length}`);
  }
  if (blurAssets.length !== 35) {
    throw new Error(`Expected 35 symbol blur assets, received ${blurAssets.length}`);
  }
  if (winSheetAssets.length !== 7) {
    throw new Error(`Expected 7 win animation sheets, received ${winSheetAssets.length}`);
  }

  return true;
}

export const ASSET_MANIFEST_VALID = validateAssetManifest();
