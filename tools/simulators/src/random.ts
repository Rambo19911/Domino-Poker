import { createSeededRng, type MultiplayerRng } from "@domino-poker/core/multiplayer";

/**
 * Deterministisks nejaušības avots simulatoriem. Tas izmanto **to pašu** MP
 * zonas sēklas RNG, tāpēc viss simulācijas determinisms paliek multiplayer
 * zonā — simulatori paši nedublē maisīšanas/RNG loģiku.
 */
export function createSimulationRng(seed: string): MultiplayerRng {
  return createSeededRng(seed);
}

/** Izvēlas vienu elementu no nepamata saraksta ar doto RNG. */
export function pick<T>(rng: MultiplayerRng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("pick() requires a non-empty list of options.");
  }
  const index = Math.floor(rng() * items.length);
  const chosen = items[Math.min(index, items.length - 1)];
  if (chosen === undefined) {
    throw new Error("pick() resolved to an undefined option.");
  }
  return chosen;
}
