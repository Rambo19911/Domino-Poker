import { describe, expect, it } from "vitest";

import {
  applyCommand,
  assertInvariants,
  type MultiplayerGameState
} from "../../src/multiplayer";

const seed = "disconnect-seed";

function createGame(): MultiplayerGameState {
  const result = applyCommand(undefined, {
    type: "CREATE_GAME",
    gameId: "game-1",
    requestId: "request-create",
    seed
  });

  if (!result.nextState) {
    throw new Error("Expected multiplayer game to be created.");
  }

  return result.nextState;
}

function connectionStateOf(
  state: MultiplayerGameState,
  playerId: string
): string | undefined {
  return state.players.find((player) => player.playerId === playerId)?.connectionState;
}

describe("multiplayer PLAYER_DISCONNECT", () => {
  it("marks a human player disconnected and emits PLAYER_DISCONNECTED", () => {
    const game = createGame();

    const result = applyCommand(game, {
      type: "PLAYER_DISCONNECT",
      gameId: game.gameId,
      requestId: "request-disconnect",
      playerId: "1"
    });

    expect(result.errors).toEqual([]);
    expect(result.nextState).toBeDefined();
    expect(connectionStateOf(result.nextState!, "1")).toBe("disconnected");
    expect(result.events).toEqual([
      {
        type: "PLAYER_DISCONNECTED",
        gameId: game.gameId,
        eventSeq: game.eventSeq + 1,
        playerId: "1"
      }
    ]);
    assertInvariants(result.nextState!);
  });

  it("does not change inactivity score or status on disconnect", () => {
    const game = createGame();

    const result = applyCommand(game, {
      type: "PLAYER_DISCONNECT",
      gameId: game.gameId,
      requestId: "request-disconnect",
      playerId: "1"
    });

    const before = game.players.find((player) => player.playerId === "1")!;
    const after = result.nextState!.players.find((player) => player.playerId === "1")!;
    expect(after.inactiveScore).toBe(before.inactiveScore);
    expect(after.status).toBe(before.status);
    expect(after.autoPlayEnabled).toBe(before.autoPlayEnabled);
  });

  it("round-trips back to connected via PLAYER_RESUME", () => {
    const game = createGame();

    const disconnected = applyCommand(game, {
      type: "PLAYER_DISCONNECT",
      gameId: game.gameId,
      requestId: "request-disconnect",
      playerId: "1"
    }).nextState!;
    expect(connectionStateOf(disconnected, "1")).toBe("disconnected");

    const resumed = applyCommand(disconnected, {
      type: "PLAYER_RESUME",
      gameId: game.gameId,
      requestId: "request-resume",
      playerId: "1"
    }).nextState!;

    expect(connectionStateOf(resumed, "1")).toBe("connected");
    assertInvariants(resumed);
  });

  it("rejects disconnecting a bot seat", () => {
    const game = createGame();

    const result = applyCommand(game, {
      type: "PLAYER_DISCONNECT",
      gameId: game.gameId,
      requestId: "request-disconnect-bot",
      playerId: "2"
    });

    expect(result.errors[0]?.code).toBe("player_is_bot");
    expect(result.events).toEqual([]);
  });

  it("rejects disconnecting an unknown player", () => {
    const game = createGame();

    const result = applyCommand(game, {
      type: "PLAYER_DISCONNECT",
      gameId: game.gameId,
      requestId: "request-disconnect-unknown",
      playerId: "does-not-exist"
    });

    expect(result.errors[0]?.code).toBe("player_not_found");
    expect(result.events).toEqual([]);
  });
});
