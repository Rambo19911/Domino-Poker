import type { RoomSummary, RoomView, ServerEvent } from "@domino-poker/shared";
import { describe, expect, it } from "vitest";

import { initialClientView, reduceServerEvent } from "../../lib/mp/clientView";

function summary(id: string, overrides: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id,
    code: "CODE",
    visibility: "public",
    isPrivate: false,
    status: "WAITING",
    seatsFilled: 1,
    seatsTotal: 4,
    hostDisplayId: "#00001",
    createdAt: 0,
    expiresAt: 0,
    numberOfRounds: 7,
    ...overrides
  };
}

function roomView(id: string): RoomView {
  return { ...summary(id), seats: [] };
}

/** STATE_SNAPSHOT events ietver core PlayerSnapshot; testam pietiek ar opaku objektu. */
function snapshotEvent(seq: number, snapshot: unknown): ServerEvent {
  return { type: "STATE_SNAPSHOT", roomId: "r1", seq, snapshot, serverNow: 1 } as ServerEvent;
}

function gameEvent(seq: number): ServerEvent {
  return {
    type: "GAME_EVENT",
    roomId: "r1",
    seq,
    event: { type: "BID_ACCEPTED", gameId: "r1", eventSeq: seq, playerId: "1", turnId: "t1", bid: 3 },
    serverNow: 1
  } as ServerEvent;
}

describe("reduceServerEvent (8.2)", () => {
  it("WELCOME marks the connection connected and stores identity", () => {
    const view = reduceServerEvent(initialClientView, {
      type: "WELCOME",
      sessionId: "s1",
      playerId: "p1",
      displayId: "#00001",
      reconnectToken: "tok",
      serverNow: 1
    });
    expect(view.connection).toBe("connected");
    expect(view.identity).toEqual({
      sessionId: "s1",
      playerId: "p1",
      displayId: "#00001",
      reconnectToken: "tok"
    });
  });

  it("LOBBY_STATE updates rooms and onlineCount", () => {
    const view = reduceServerEvent(initialClientView, {
      type: "LOBBY_STATE",
      rooms: [summary("r1"), summary("r2")],
      onlineCount: 3
    });
    expect(view.lobby.rooms.map((room) => room.id)).toEqual(["r1", "r2"]);
    expect(view.lobby.onlineCount).toBe(3);
  });

  it("ROOM_VIEW/ROOM_JOINED set the current room and ROOM_LEFT clears it", () => {
    let view = reduceServerEvent(initialClientView, { type: "ROOM_VIEW", room: roomView("r1") });
    expect(view.room?.id).toBe("r1");

    view = reduceServerEvent(view, { type: "ROOM_JOINED", room: roomView("r1") });
    expect(view.room?.id).toBe("r1");

    view = reduceServerEvent(view, { type: "ROOM_LEFT", roomId: "other" });
    expect(view.room?.id).toBe("r1"); // cita istaba — nemaina

    view = reduceServerEvent(view, { type: "ROOM_LEFT", roomId: "r1" });
    expect(view.room).toBeUndefined();
  });

  it("STATE_SNAPSHOT stores the authoritative snapshot; GAME_EVENT only advances seq", () => {
    const snapshot = { gameId: "r1", phase: "bidding", viewerPlayerId: "1", hand: [] };
    let view = reduceServerEvent(initialClientView, snapshotEvent(5, snapshot));
    expect(view.game.seq).toBe(5);
    expect(view.game.snapshot).toBe(snapshot);

    view = reduceServerEvent(view, gameEvent(6));
    expect(view.game.seq).toBe(6);
    expect(view.game.snapshot).toBe(snapshot); // snapshot paliek autoritatīvs
  });

  it("GAME_EVENT never lowers the seq", () => {
    let view = reduceServerEvent(initialClientView, snapshotEvent(10, {}));
    view = reduceServerEvent(view, gameEvent(7)); // vecāks seq
    expect(view.game.seq).toBe(10);
  });

  it("tracks the active turnId from TURN_STARTED and keeps it across a snapshot", () => {
    const turnStarted = {
      type: "GAME_EVENT",
      roomId: "r1",
      seq: 3,
      event: {
        type: "TURN_STARTED",
        gameId: "r1",
        eventSeq: 3,
        turn: {
          turnId: "turn-9",
          playerId: "1",
          startedAt: 0,
          deadlineAt: 10,
          allowedActionTypes: ["SUBMIT_BID"],
          phase: "bidding"
        }
      },
      serverNow: 1
    } as ServerEvent;

    let view = reduceServerEvent(initialClientView, turnStarted);
    expect(view.game.turnId).toBe("turn-9");

    view = reduceServerEvent(view, snapshotEvent(4, { hand: [] }));
    expect(view.game.turnId).toBe("turn-9"); // snapshot bez turnId — saglabājam
  });

  it("adopts the active turnId from a snapshot (reconnect without TURN_STARTED)", () => {
    // Pēc reconnect klients saņem snapshot ar turnId, nevis TURN_STARTED.
    const view = reduceServerEvent(initialClientView, snapshotEvent(7, { hand: [], turnId: "turn-42" }));
    expect(view.game.turnId).toBe("turn-42");
  });

  it("GAME_STARTING stores the pre-game startsAt and TURN_STARTED clears it", () => {
    let view = reduceServerEvent(initialClientView, {
      type: "GAME_STARTING",
      roomId: "r1",
      startsAt: 10_000,
      serverNow: 1
    });
    expect(view.game.startsAt).toBe(10_000);

    // Pirmais TURN_STARTED beidz pirms-spēles atskaiti.
    view = reduceServerEvent(view, {
      type: "GAME_EVENT",
      roomId: "r1",
      seq: 1,
      event: {
        type: "TURN_STARTED",
        gameId: "r1",
        eventSeq: 1,
        turn: {
          turnId: "turn-1",
          playerId: "1",
          startedAt: 10_000,
          deadlineAt: 20_000,
          allowedActionTypes: ["SUBMIT_BID"],
          phase: "bidding"
        }
      },
      serverNow: 2
    } as ServerEvent);
    expect(view.game.startsAt).toBeUndefined();
    expect(view.game.turnId).toBe("turn-1");
  });

  it("CHAT_HISTORY sets the feed and CHAT_MESSAGE appends to it", () => {
    let view = reduceServerEvent(initialClientView, {
      type: "CHAT_HISTORY",
      messages: [{ id: "m1", authorDisplayId: "#1", text: "hi", serverNow: 1 }]
    });
    expect(view.lobby.chat).toHaveLength(1);

    view = reduceServerEvent(view, {
      type: "CHAT_MESSAGE",
      id: "m2",
      authorDisplayId: "#2",
      text: "yo",
      serverNow: 2
    });
    expect(view.lobby.chat.map((message) => message.id)).toEqual(["m1", "m2"]);
  });

  it("ERROR records the last error with its requestId", () => {
    const view = reduceServerEvent(initialClientView, {
      type: "ERROR",
      code: "RATE_LIMITED",
      message: "too fast",
      requestId: "r9"
    });
    expect(view.lastError).toEqual({ code: "RATE_LIMITED", message: "too fast", requestId: "r9" });
  });

  it("ROOM_LEFT clears a stale lastError (no sticky error leaking into the lobby)", () => {
    let view = reduceServerEvent(initialClientView, { type: "ROOM_JOINED", room: roomView("r1") });
    view = reduceServerEvent(view, {
      type: "ERROR",
      code: "NOT_YOUR_TURN",
      message: "Player 4 does not own the current turn."
    });
    expect(view.lastError).toBeDefined();

    view = reduceServerEvent(view, { type: "ROOM_LEFT", roomId: "r1" });
    expect(view.room).toBeUndefined();
    expect(view.lastError).toBeUndefined(); // kļūda nenoplūst lobby
  });

  it("does not mutate the previous view (pure reducer)", () => {
    const before = initialClientView;
    reduceServerEvent(before, { type: "LOBBY_STATE", rooms: [summary("r1")], onlineCount: 1 });
    expect(before.lobby.rooms).toHaveLength(0);
  });
});
