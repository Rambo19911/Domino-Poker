export type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Tile = {
  readonly index: number;
  readonly a: Pip;
  readonly b: Pip;
};

export const TILE_COUNT = 28;
export const ALL_TILES_MASK = (1 << TILE_COUNT) - 1;

const tiles: Tile[] = [];
const tileIndexByPips = new Int8Array(7 * 7).fill(-1);

for (let a = 0; a <= 6; a += 1) {
  for (let b = a; b <= 6; b += 1) {
    const index = tiles.length;
    const tile: Tile = { index, a: a as Pip, b: b as Pip };
    tiles.push(tile);
    tileIndexByPips[a * 7 + b] = index;
    tileIndexByPips[b * 7 + a] = index;
  }
}

export const TILES: readonly Tile[] = tiles;

export const TRUMP_RANK = new Int8Array(TILE_COUNT).fill(-1);
export const PIP_RANK: Int8Array[] = Array.from({ length: 7 }, () => new Int8Array(TILE_COUNT).fill(-1));
export const SUIT_MASK: number[] = Array.from({ length: 7 }, () => 0);
export const TRUMP_STRONGER_THAN: number[] = Array.from({ length: 9 }, () => 0);

const trumpRanks: Array<[number, number, number]> = [
  [0, 0, 8],
  [1, 1, 7],
  [1, 6, 6],
  [1, 5, 5],
  [1, 4, 4],
  [1, 3, 3],
  [1, 2, 2],
  [0, 1, 1]
];

for (const [a, b, rank] of trumpRanks) {
  TRUMP_RANK[tileIndex(a, b)] = rank;
}

let trumpMask = 0;
let aceMask = 0;

for (const tile of tiles) {
  const bit = tileBit(tile.index);
  if (TRUMP_RANK[tile.index] !== -1) {
    trumpMask |= bit;
    continue;
  }

  const pips = tile.a === tile.b ? [tile.a] : [tile.a, tile.b];
  for (const pip of pips) {
    SUIT_MASK[pip] = (SUIT_MASK[pip] as number) | bit;
    (PIP_RANK[pip] as Int8Array)[tile.index] = tile.a === tile.b ? 8 : otherPip(tile, pip);
  }
}

for (const [a, b] of [
  [6, 6],
  [5, 5],
  [4, 4],
  [3, 3],
  [2, 2],
  [0, 6]
] as const) {
  aceMask |= tileBit(tileIndex(a, b));
}

for (let threshold = 0; threshold <= 8; threshold += 1) {
  let mask = 0;
  for (let index = 0; index < TILE_COUNT; index += 1) {
    const rank = TRUMP_RANK[index] as number;
    if (rank > threshold) {
      mask |= tileBit(index);
    }
  }
  TRUMP_STRONGER_THAN[threshold] = mask;
}

export const TRUMP_MASK = trumpMask;
export const ACE_MASK = aceMask;

export function tileIndex(a: number, b: number): number {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 6 || b < 0 || b > 6) {
    throw new RangeError(`Tile pips must be integers from 0 to 6: ${a}-${b}`);
  }

  return tileIndexByPips[a * 7 + b] as number;
}

export function tileBit(index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= TILE_COUNT) {
    throw new RangeError(`Tile index must be an integer from 0 to 27: ${index}`);
  }

  return 1 << index;
}

export function tileMask(indices: readonly number[]): number {
  let mask = 0;
  for (const index of indices) {
    mask |= tileBit(index);
  }
  return mask;
}

export function maskToTiles(mask: number): number[] {
  const indices: number[] = [];
  for (let index = 0; index < TILE_COUNT; index += 1) {
    if ((mask & tileBit(index)) !== 0) {
      indices.push(index);
    }
  }
  return indices;
}

export function popcount(mask: number): number {
  let count = 0;
  let value = mask >>> 0;
  while (value !== 0) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

export function tileLabel(index: number): string {
  const tile = getTile(index);
  return `${tile.a}-${tile.b}`;
}

export function getTile(index: number): Tile {
  const tile = TILES[index];
  if (tile === undefined) {
    throw new RangeError(`Tile index must be an integer from 0 to 27: ${index}`);
  }
  return tile;
}

export function isTrump(index: number): boolean {
  return TRUMP_RANK[index] !== -1;
}

function otherPip(tile: Tile, pip: Pip): number {
  return tile.a === pip ? tile.b : tile.a;
}
