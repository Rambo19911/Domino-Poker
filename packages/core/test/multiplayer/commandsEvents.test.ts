import { describe, expect, it } from "vitest";

import {
  multiplayerCommandTypes,
  type MultiplayerCommand,
  multiplayerEventTypes,
  type MultiplayerEvent
} from "../../src/multiplayer";

describe("multiplayer command and event types", () => {
  it("exports all planned command types", () => {
    expect(multiplayerCommandTypes).toEqual([
      "CREATE_GAME",
      "ADD_PLAYER",
      "ADD_BOT",
      "FILL_SEATS_WITH_BOTS",
      "START_GAME",
      "START_NEXT_ROUND",
      "START_TURN",
      "SUBMIT_BID",
      "SUBMIT_MOVE",
      "TURN_TIMEOUT",
      "ENABLE_AUTO_PLAY",
      "DISABLE_AUTO_PLAY",
      "PLAYER_DISCONNECT",
      "PLAYER_RESUME",
      "PLAYER_FORFEIT",
      "REQUEST_SNAPSHOT"
    ]);
  });

  it("exports all planned event types", () => {
    expect(multiplayerEventTypes).toEqual([
      "TURN_STARTED",
      "BID_ACCEPTED",
      "MOVE_ACCEPTED",
      "TURN_TIMEOUT",
      "TRICK_COMPLETED",
      "ROUND_RESULT",
      "GAME_OVER",
      "PLAYER_JOINED",
      "PLAYER_LEFT",
      "PLAYER_DISCONNECTED",
      "PLAYER_RESUMED",
      "AUTO_PLAY_ENABLED",
      "AUTO_PLAY_DISABLED",
      "AUTO_MOVE_FALLBACK"
    ]);
  });

  it("requires requestId on commands for future idempotence", () => {
    const command = {
      type: "SUBMIT_BID",
      gameId: "game-1",
      requestId: "request-1",
      playerId: "player-1",
      turnId: "turn-1",
      now: 1000,
      bid: 4
    } satisfies MultiplayerCommand;

    expect(command.requestId).toBe("request-1");
  });

  it("requires injected now on TURN_TIMEOUT commands", () => {
    const command = {
      type: "TURN_TIMEOUT",
      gameId: "game-1",
      requestId: "request-timeout-1",
      turnId: "turn-1",
      now: 11001
    } satisfies MultiplayerCommand;

    expect(command.now).toBe(11001);
  });

  it("carries eventSeq on events for future replay ordering", () => {
    const event = {
      type: "BID_ACCEPTED",
      gameId: "game-1",
      eventSeq: 1,
      playerId: "player-1",
      turnId: "turn-1",
      bid: 4
    } satisfies MultiplayerEvent;

    expect(event.eventSeq).toBe(1);
  });
});
