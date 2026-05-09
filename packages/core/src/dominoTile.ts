import type { DominoTile } from "./types";

export const TRUMPS: readonly DominoTile[] = [
  { side1: 0, side2: 0 },
  { side1: 1, side2: 1 },
  { side1: 1, side2: 6 },
  { side1: 1, side2: 5 },
  { side1: 1, side2: 4 },
  { side1: 1, side2: 3 },
  { side1: 1, side2: 2 },
  { side1: 1, side2: 0 }
];

export const ACES: readonly DominoTile[] = [
  { side1: 6, side2: 6 },
  { side1: 5, side2: 5 },
  { side1: 4, side2: 4 },
  { side1: 3, side2: 3 },
  { side1: 2, side2: 2 },
  { side1: 0, side2: 6 }
];

export function createTile(side1: number, side2: number): DominoTile {
  assertPip(side1);
  assertPip(side2);
  return { side1, side2 };
}

export function normalizeTile(tile: DominoTile): DominoTile {
  return tile.side1 <= tile.side2
    ? { side1: tile.side1, side2: tile.side2 }
    : { side1: tile.side2, side2: tile.side1 };
}

export function tileKey(tile: DominoTile): string {
  const normalized = normalizeTile(tile);
  return `${normalized.side1}-${normalized.side2}`;
}

export function tileLabel(tile: DominoTile): string {
  return `${tile.side1}-${tile.side2}`;
}

export function tileEquals(a: DominoTile, b: DominoTile): boolean {
  return (
    (a.side1 === b.side1 && a.side2 === b.side2) ||
    (a.side1 === b.side2 && a.side2 === b.side1)
  );
}

export function tileContains(tile: DominoTile, number: number): boolean {
  return tile.side1 === number || tile.side2 === number;
}

export function tileTotalValue(tile: DominoTile): number {
  return tile.side1 + tile.side2;
}

export function isTrump(tile: DominoTile): boolean {
  return TRUMPS.some((trump) => tileEquals(trump, tile));
}

export function isAce(tile: DominoTile): boolean {
  return ACES.some((ace) => tileEquals(ace, tile));
}

export function isSpecialTile(tile: DominoTile): boolean {
  return tileEquals(tile, { side1: 0, side2: 6 });
}

export function trumpPriority(tile: DominoTile): number {
  const index = TRUMPS.findIndex((trump) => tileEquals(trump, tile));
  return index === -1 ? 999 : index;
}

export function getFullSet(): DominoTile[] {
  const tiles: DominoTile[] = [];
  for (let i = 0; i <= 6; i += 1) {
    for (let j = i; j <= 6; j += 1) {
      tiles.push({ side1: i, side2: j });
    }
  }
  return tiles;
}

export function shuffleSet(rng: () => number = Math.random): DominoTile[] {
  const cutTiles = randomCut(getFullSet(), rng);
  const mixedTiles = overhandShuffle(cutTiles, rng);
  return randomCut(mixedTiles, rng);
}

function assertPip(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    throw new Error(`Domino side must be an integer from 0 to 6. Received ${value}.`);
  }
}

function randomCut<T>(items: readonly T[], rng: () => number): T[] {
  if (items.length <= 1) return [...items];
  const cutIndex = Math.floor(rng() * items.length);
  return [...items.slice(cutIndex), ...items.slice(0, cutIndex)];
}

function overhandShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const source = [...items];
  let mixed: T[] = [];
  const minPacketSize = 2;
  const maxPacketSize = 6;

  while (source.length > 0) {
    const packetSize = Math.min(
      source.length,
      minPacketSize + Math.floor(rng() * (maxPacketSize - minPacketSize + 1))
    );
    const packet = source.splice(0, packetSize);
    mixed = rng() < 0.75 ? [...packet, ...mixed] : [...mixed, ...packet];
  }

  return mixed;
}
