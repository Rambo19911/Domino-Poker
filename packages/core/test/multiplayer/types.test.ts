import { describe, expect, it } from "vitest";

import { createMultiplayerGameSetup } from "../../src/multiplayer/gameSetup";
import { createInitialMultiplayerGameState } from "../../src/multiplayer/types";

describe("createInitialMultiplayerGameState", () => {
  it("wraps core state with multiplayer metadata", () => {
    const setup = createMultiplayerGameSetup({
      gameId: "game-1",
      seed: "seed-1"
    });

    const state = createInitialMultiplayerGameState(setup);

    expect(state.gameId).toBe("game-1");
    expect(state.seed).toBe("seed-1");
    expect(state.coreState).toBe(setup.state);
    expect(state.eventSeq).toBe(0);
    expect(state.currentTurn).toBeUndefined();
  });

  it("creates multiplayer player state without mutating core players", () => {
    const setup = createMultiplayerGameSetup({
      gameId: "game-1",
      seed: "seed-1"
    });

    const state = createInitialMultiplayerGameState(setup);

    expect(state.players).toEqual([
      {
        playerId: "1",
        seatIndex: 0,
        status: "active",
        inactiveScore: 0,
        autoPlayEnabled: false,
        connectionState: "connected"
      },
      {
        playerId: "2",
        seatIndex: 1,
        status: "bot",
        inactiveScore: 0,
        autoPlayEnabled: false,
        connectionState: "disconnected"
      },
      {
        playerId: "3",
        seatIndex: 2,
        status: "bot",
        inactiveScore: 0,
        autoPlayEnabled: false,
        connectionState: "disconnected"
      },
      {
        playerId: "4",
        seatIndex: 3,
        status: "bot",
        inactiveScore: 0,
        autoPlayEnabled: false,
        connectionState: "disconnected"
      }
    ]);

    expect("seatIndex" in setup.state.players[0]!).toBe(false);
    expect("connectionState" in setup.state.players[0]!).toBe(false);
  });
});
