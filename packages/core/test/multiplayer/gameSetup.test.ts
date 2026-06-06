import { describe, expect, it } from "vitest";

import { tileKey } from "../../src/dominoTile";
import { createMultiplayerGameSetup } from "../../src/multiplayer/gameSetup";

describe("createMultiplayerGameSetup", () => {
  it("stores explicit seed in multiplayer metadata", () => {
    const setup = createMultiplayerGameSetup({
      gameId: "game-1",
      seed: "seed-1"
    });

    expect(setup.metadata.gameId).toBe("game-1");
    expect(setup.metadata.seed).toBe("seed-1");
    expect(setup.metadata.initialDeck).toHaveLength(28);
  });

  it("creates identical initial state for the same seed", () => {
    const first = createMultiplayerGameSetup({
      gameId: "game-1",
      seed: "seed-1"
    });
    const second = createMultiplayerGameSetup({
      gameId: "game-2",
      seed: "seed-1"
    });

    expect(first.metadata.initialDeck.map(tileKey)).toEqual(
      second.metadata.initialDeck.map(tileKey)
    );
    expect(first.metadata.dealerIndex).toBe(second.metadata.dealerIndex);
    expect(first.state.players.map((player) => player.hand.map(tileKey))).toEqual(
      second.state.players.map((player) => player.hand.map(tileKey))
    );
    expect(first.state.currentPlayerIndex).toBe(second.state.currentPlayerIndex);
  });

  it("uses injected seed factory when seed is omitted", () => {
    const setup = createMultiplayerGameSetup({
      gameId: "game-1",
      createSeed: () => "generated-seed"
    });

    expect(setup.metadata.seed).toBe("generated-seed");
  });

  it("allows explicit dealer index override", () => {
    const setup = createMultiplayerGameSetup({
      gameId: "game-1",
      seed: "seed-1",
      dealerIndex: 2
    });

    expect(setup.metadata.dealerIndex).toBe(2);
    expect(setup.state.dealerIndex).toBe(2);
    expect(setup.state.currentPlayerIndex).toBe(3);
  });

  it("defaults to seat 0 human and the rest bots when humanSeatIndices is omitted", () => {
    const setup = createMultiplayerGameSetup({ gameId: "game-1", seed: "seed-1" });
    expect(setup.state.players.map((player) => player.isAI)).toEqual([false, true, true, true]);
  });

  it("marks the given seats as humans and the rest as bots", () => {
    const setup = createMultiplayerGameSetup({
      gameId: "game-1",
      seed: "seed-1",
      humanSeatIndices: [0, 2]
    });

    expect(setup.state.players.map((player) => player.isAI)).toEqual([false, true, false, true]);
    expect(setup.state.players.map((player) => player.playerType)).toEqual([
      "human",
      "cpu",
      "human",
      "cpu"
    ]);
  });

  it("supports an all-bot table (empty humanSeatIndices)", () => {
    const setup = createMultiplayerGameSetup({
      gameId: "game-1",
      seed: "seed-1",
      humanSeatIndices: []
    });
    expect(setup.state.players.every((player) => player.isAI)).toBe(true);
  });

  it("does not change the deal when remapping seat roles", () => {
    const base = createMultiplayerGameSetup({ gameId: "g", seed: "seed-1" });
    const remapped = createMultiplayerGameSetup({
      gameId: "g",
      seed: "seed-1",
      humanSeatIndices: [0, 1, 2, 3]
    });
    expect(remapped.state.players.map((player) => player.hand.map(tileKey))).toEqual(
      base.state.players.map((player) => player.hand.map(tileKey))
    );
  });

  it("rejects out-of-range human seat indices", () => {
    expect(() =>
      createMultiplayerGameSetup({ gameId: "g", seed: "seed-1", humanSeatIndices: [4] })
    ).toThrow("out of range");
  });

  it("rejects empty game ids and seeds", () => {
    expect(() =>
      createMultiplayerGameSetup({
        gameId: " ",
        seed: "seed-1"
      })
    ).toThrow("Multiplayer game id must not be empty.");

    expect(() =>
      createMultiplayerGameSetup({
        gameId: "game-1",
        seed: " "
      })
    ).toThrow("Multiplayer seed must not be empty.");
  });
});
