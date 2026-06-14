import { describe, expect, it } from "vitest";
import { createNewGame, makeBid } from "@domino-poker/core";
import type { GameState } from "@domino-poker/core";

import { resolveAiMove, safetyMove, tryAdvance } from "../lib/bot/liveness";

// Deterministisks izspēles-fāzes stāvoklis: jauna spēle ar fiksētu rng, tad visi 4 nosola.
function playingState(): GameState {
  let state = createNewGame({ numberOfRounds: 1, rng: () => 0.42 });
  let guard = 0;
  while (state.phase === "bidding" && guard++ < 10) {
    state = makeBid(state, 1);
  }
  return state;
}

const key = (t: { side1: number; side2: number }) => `${t.side1}-${t.side2}`;

// Kauliņš, kas NAV pašreizējā spēlētāja rokā (cita spēlētāja kauliņš) → nelegāls gājiens.
function foreignTile(state: GameState) {
  const seat = state.currentPlayerIndex;
  const ownHand = new Set((state.players[seat]?.hand ?? []).map(key));
  const foreign = state.players.flatMap((p) => p.hand).find((t) => !ownHand.has(key(t)));
  if (!foreign) throw new Error("test setup: nav sveša kauliņa");
  return foreign;
}

describe("bot liveness net", () => {
  it("sasniedz izspēles fāzi", () => {
    expect(playingState().phase).toBe("playing");
  });

  it("safetyMove dod gājienu, kas virza spēli", () => {
    const state = playingState();
    const actor = state.players[state.currentPlayerIndex]!;
    const move = safetyMove(actor, state);
    expect(move).not.toBeNull();
    expect(tryAdvance(state, move)).not.toBeNull();
  });

  it("tryAdvance atgriež null nelegālam gājienam (kauliņš nav rokā)", () => {
    const state = playingState();
    expect(tryAdvance(state, { tile: foreignTile(state), declaredNumber: undefined })).toBeNull();
  });

  it("tryAdvance atgriež null null-gājienam", () => {
    expect(tryAdvance(playingState(), null)).toBeNull();
  });

  it("resolveAiMove virza spēli caur drošības gājienu, ja bots atgriež NELEGĀLU gājienu", () => {
    const state = playingState();
    const next = resolveAiMove(state, { tile: foreignTile(state), declaredNumber: undefined });
    expect(next).not.toBe(state); // kārta nav iestrēgusi
  });

  it("resolveAiMove virza spēli caur drošības gājienu, ja bots atgriež null", () => {
    const state = playingState();
    expect(resolveAiMove(state, null)).not.toBe(state);
  });

  it("resolveAiMove pielieto legālu bota gājienu kā tādu", () => {
    const state = playingState();
    const actor = state.players[state.currentPlayerIndex]!;
    const legal = safetyMove(actor, state)!;
    const next = resolveAiMove(state, legal);
    expect(next).not.toBe(state);
    const played =
      next.currentTrick.some((p) => key(p.tile) === key(legal.tile)) ||
      next.completedTricks.length > state.completedTricks.length;
    expect(played).toBe(true);
  });
});
