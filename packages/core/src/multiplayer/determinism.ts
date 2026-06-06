import { getFullSet } from "../dominoTile";
import type { DominoTile } from "../types";

export type MultiplayerRng = () => number;

export function createSeededRng(seed: string): MultiplayerRng {
  let state = hashSeed(seed);

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleMultiplayerDominoSet(seed: string): DominoTile[] {
  const rng = createSeededRng(seed);
  const cutTiles = randomCut(getFullSet(), rng);
  const mixedTiles = overhandShuffle(cutTiles, rng);
  return randomCut(mixedTiles, rng);
}

function hashSeed(seed: string): number {
  if (seed.length === 0) {
    throw new Error("Multiplayer seed must not be empty.");
  }

  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function randomCut<T>(items: readonly T[], rng: MultiplayerRng): T[] {
  if (items.length <= 1) return [...items];
  const cutIndex = Math.floor(rng() * items.length);
  return [...items.slice(cutIndex), ...items.slice(0, cutIndex)];
}

function overhandShuffle<T>(items: readonly T[], rng: MultiplayerRng): T[] {
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
