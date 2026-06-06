import { getFullSet } from "../dominoTile";
import { shuffleWithCutAndOverhand, type ShuffleRng } from "../shuffleAlgorithm";
import type { DominoTile } from "../types";

export type MultiplayerRng = ShuffleRng;

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
  return shuffleWithCutAndOverhand(getFullSet(), rng);
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
