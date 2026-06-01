import { describe, expect, it } from "vitest";

import { GameDirector } from "../../src/rooms/GameDirector.js";
import { RoomEngine } from "../../src/rooms/RoomEngine.js";
import { noopTurnTimerScheduler } from "../../src/timers/TurnTimerScheduler.js";

function createGame(gameId: string, seed: string, humanSeatIndices: readonly number[]): RoomEngine {
  const engine = new RoomEngine({ clock: () => 1000, scheduler: noopTurnTimerScheduler });
  const created = engine.dispatch({
    type: "CREATE_GAME",
    gameId,
    requestId: "create",
    seed,
    humanSeatIndices
  });
  expect(created.accepted).toBe(true);
  return engine;
}

describe("GameDirector (6.7 game loop)", () => {
  it("drives an all-bot table to gameEnd in a single advance()", () => {
    const engine = createGame("g1", "seed-1", []);
    const director = new GameDirector({ engine, gameId: "g1" });

    const result = director.advance();

    expect(result.awaitingHuman).toBe(false);
    expect(engine.getGameState().coreState.phase).toBe("gameEnd");
    expect(result.events.some((entry) => entry.event.type === "GAME_OVER")).toBe(true);
  });

  it("stops at the first human turn, auto-playing any leading bots", () => {
    const engine = createGame("g2", "seed-1", [0]);
    const director = new GameDirector({ engine, gameId: "g2" });

    const result = director.advance();

    expect(result.awaitingHuman).toBe(true);
    const state = engine.getGameState();
    const turn = state.currentTurn;
    expect(turn).toBeDefined();
    const actor = state.players.find((player) => player.playerId === turn?.playerId);
    expect(actor?.status).not.toBe("bot");
  });

  it("is idempotent once it is already awaiting a human", () => {
    const engine = createGame("g3", "seed-1", [0]);
    const director = new GameDirector({ engine, gameId: "g3" });

    director.advance();
    const again = director.advance();

    expect(again.awaitingHuman).toBe(true);
    expect(again.events).toHaveLength(0);
  });

  it("is deterministic: same seed yields the same final state", () => {
    const first = createGame("g", "seed-7", []);
    new GameDirector({ engine: first, gameId: "g" }).advance();

    const second = createGame("g", "seed-7", []);
    new GameDirector({ engine: second, gameId: "g" }).advance();

    expect(first.getPublicSnapshot()).toEqual(second.getPublicSnapshot());
  });

  it("emits monotonic turnIds across the game", () => {
    const engine = createGame("g4", "seed-3", []);
    const director = new GameDirector({ engine, gameId: "g4" });

    const result = director.advance();
    const turnIds = result.events
      .filter((entry) => entry.event.type === "TURN_STARTED")
      .map((entry) => (entry.event as { turn: { turnId: string } }).turn.turnId);

    const sequence = turnIds.map((id) => Number.parseInt(id.replace(/^turn-/, ""), 10));
    const sorted = [...sequence].sort((a, b) => a - b);
    expect(sequence).toEqual(sorted);
    expect(new Set(sequence).size).toBe(sequence.length); // bez dublikātiem
  });
});
