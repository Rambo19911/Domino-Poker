import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  isProtocolCompatible,
  protocolErrorCodes,
  errorPayloadSchema,
  clientMessageSchema,
  maxIdentifierLength,
  maxChatTextLength,
  parseClientMessage,
  parseServerEvent,
  parseServerEventFanout
} from "../src/index.js";
import type { RoomSummary, ServerEvent } from "../src/index.js";

describe("protocol version", () => {
  it("accepts the current version and rejects others", () => {
    expect(isProtocolCompatible(PROTOCOL_VERSION)).toBe(true);
    expect(isProtocolCompatible("0")).toBe(false);
    expect(isProtocolCompatible("2")).toBe(false);
    expect(isProtocolCompatible("")).toBe(false);
  });
});

describe("error payloads", () => {
  it("validates a safe error payload and rejects unknown codes", () => {
    expect(
      errorPayloadSchema.safeParse({ code: "RATE_LIMITED", message: "Slow down" }).success
    ).toBe(true);
    expect(
      errorPayloadSchema.safeParse({ code: "NOPE", message: "x" }).success
    ).toBe(false);
  });

  it("includes the protocol/lobby/turn codes the gateway needs", () => {
    for (const code of [
      "PROTOCOL_VERSION_MISMATCH",
      "INVALID_MESSAGE",
      "RATE_LIMITED",
      "ROOM_NOT_FOUND",
      "ALREADY_IN_ROOM",
      "NOT_YOUR_TURN"
    ]) {
      expect(protocolErrorCodes).toContain(code);
    }
  });
});

describe("client message schemas", () => {
  it("accepts well-formed messages and discriminates by type", () => {
    const hello = clientMessageSchema.parse({
      type: "HELLO",
      protocolVersion: "1",
      clientBuild: "dev",
      clientId: "c1"
    });
    expect(hello.type).toBe("HELLO");

    const bid = clientMessageSchema.parse({
      type: "SUBMIT_BID",
      requestId: "r1",
      roomId: "room-1",
      turnId: "t1",
      bid: 3
    });
    expect(bid.type).toBe("SUBMIT_BID");

    const move = clientMessageSchema.parse({
      type: "SUBMIT_MOVE",
      requestId: "r2",
      roomId: "room-1",
      turnId: "t1",
      move: { tile: { side1: 0, side2: 6 }, declaredNumber: 6 }
    });
    expect(move.type).toBe("SUBMIT_MOVE");
  });

  it("rejects an out-of-range bid", () => {
    expect(parseClientMessage({
      type: "SUBMIT_BID",
      requestId: "r",
      roomId: "room-1",
      turnId: "t1",
      bid: 8
    }).success).toBe(false);
  });

  it("rejects a tile with an out-of-range pip", () => {
    expect(parseClientMessage({
      type: "SUBMIT_MOVE",
      requestId: "r",
      roomId: "room-1",
      turnId: "t1",
      move: { tile: { side1: 7, side2: 0 } }
    }).success).toBe(false);
  });

  it("rejects an unknown message type", () => {
    expect(parseClientMessage({ type: "TOTALLY_UNKNOWN" }).success).toBe(false);
  });

  it("bounds clientId/reconnectToken length (M4)", () => {
    const base = { type: "HELLO", protocolVersion: "1", clientBuild: "dev" } as const;
    // Robežas garumā joprojām pieņemts; pārsniegts → noraidīts.
    expect(parseClientMessage({ ...base, clientId: "c".repeat(maxIdentifierLength) }).success).toBe(true);
    expect(parseClientMessage({ ...base, clientId: "c".repeat(maxIdentifierLength + 1) }).success).toBe(false);
    expect(parseClientMessage({ ...base, clientId: "" }).success).toBe(false); // joprojām non-empty
    expect(
      parseClientMessage({
        ...base,
        clientId: "c1",
        reconnectToken: "t".repeat(maxIdentifierLength + 1)
      }).success
    ).toBe(false);
  });

  it("bounds clientBuild, identifiers, and chat text length (F4)", () => {
    // clientBuild robežots ar maxIdentifierLength.
    const helloBase = { type: "HELLO", protocolVersion: "1", clientId: "c1" } as const;
    expect(parseClientMessage({ ...helloBase, clientBuild: "b".repeat(maxIdentifierLength) }).success).toBe(true);
    expect(parseClientMessage({ ...helloBase, clientBuild: "b".repeat(maxIdentifierLength + 1) }).success).toBe(false);

    // nonEmpty identifikatori (roomId/turnId) robežoti ar maxIdentifierLength.
    const bidBase = { type: "SUBMIT_BID", requestId: "r", roomId: "room-1", turnId: "t1", bid: 3 } as const;
    expect(parseClientMessage({ ...bidBase, turnId: "t".repeat(maxIdentifierLength) }).success).toBe(true);
    expect(parseClientMessage({ ...bidBase, turnId: "t".repeat(maxIdentifierLength + 1) }).success).toBe(false);
    expect(parseClientMessage({ ...bidBase, roomId: "r".repeat(maxIdentifierLength + 1) }).success).toBe(false);

    // Čata teksts robežots ar maxChatTextLength.
    const chatBase = { type: "SEND_CHAT", requestId: "r" } as const;
    expect(parseClientMessage({ ...chatBase, text: "x".repeat(maxChatTextLength) }).success).toBe(true);
    expect(parseClientMessage({ ...chatBase, text: "x".repeat(maxChatTextLength + 1) }).success).toBe(false);
  });

  it("rejects a message missing a required field", () => {
    expect(parseClientMessage({ type: "JOIN_ROOM" }).success).toBe(false); // roomId/code missing
    const ok = parseClientMessage({ type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    expect(ok.success).toBe(true);
    expect(parseClientMessage({ type: "JOIN_ROOM", code: "ABC123", seatIndex: 2 }).success).toBe(true);
    expect(parseClientMessage({ type: "VIEW_ROOM", roomId: "room-1" }).success).toBe(true);
  });

  it("parseClientMessage returns the typed message on success", () => {
    const result = parseClientMessage({ type: "PING", clientTime: 123 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.type).toBe("PING");
    }
  });

  it("accepts CREATE_ROOM options and rejects invalid round counts", () => {
    const ok = parseClientMessage({
      type: "CREATE_ROOM",
      visibility: "private",
      numberOfRounds: 12,
      fillWithBots: true
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.message).toMatchObject({
        type: "CREATE_ROOM",
        visibility: "private",
        numberOfRounds: 12,
        fillWithBots: true
      });
    }

    expect(parseClientMessage({ type: "CREATE_ROOM", numberOfRounds: 0 }).success).toBe(false);
    expect(parseClientMessage({ type: "CREATE_ROOM", numberOfRounds: 51 }).success).toBe(false);
  });
});

describe("server event types", () => {
  it("compose into the ServerEvent discriminated union", () => {
    const summary: RoomSummary = {
      id: "room-1",
      code: "ABC123",
      visibility: "public",
      isPrivate: false,
      status: "WAITING",
      seatsFilled: 1,
      seatsTotal: 4,
      hostDisplayId: "#04217",
      createdAt: 0,
      expiresAt: 3_600_000,
      numberOfRounds: 7
    };

    const events: ServerEvent[] = [
      {
        type: "WELCOME",
        sessionId: "s1",
        playerId: "p1",
        displayId: "#04217",
        reconnectToken: "tok",
        serverNow: 1
      },
      { type: "ROOM_LIST", rooms: [summary] },
      { type: "ROOM_VIEW", room: { ...summary, seats: [] } },
      { type: "ROOM_LEFT", roomId: "room-1" },
      { type: "LOBBY_STATE", rooms: [summary], onlineCount: 3 },
      { type: "CHAT_MESSAGE", id: "m1", authorDisplayId: "#04217", text: "hi", serverNow: 2 },
      { type: "ERROR", code: "RATE_LIMITED", message: "slow down" },
      { type: "PONG", clientTime: 10, serverNow: 11 }
    ];

    expect(events.map((event) => event.type)).toEqual([
      "WELCOME",
      "ROOM_LIST",
      "ROOM_VIEW",
      "ROOM_LEFT",
      "LOBBY_STATE",
      "CHAT_MESSAGE",
      "ERROR",
      "PONG"
    ]);
  });
});

describe("server event runtime validation", () => {
  it("accepts well-formed server events (envelope) across types", () => {
    const valid: unknown[] = [
      {
        type: "WELCOME",
        sessionId: "s1",
        playerId: "c1",
        displayId: "#1",
        reconnectToken: "t",
        serverNow: 1
      },
      { type: "STATE_SNAPSHOT", roomId: "r1", seq: 3, snapshot: { any: "shape" }, serverNow: 2 },
      { type: "GAME_EVENT", roomId: "r1", seq: 4, event: { type: "TURN_STARTED" }, serverNow: 2 },
      { type: "ERROR", code: "RATE_LIMITED", message: "slow" }
    ];
    for (const event of valid) {
      expect(parseServerEvent(event).success).toBe(true);
    }
  });

  it("rejects unknown types, missing scalar fields, and non-objects", () => {
    expect(parseServerEvent({ type: "NONSENSE" }).success).toBe(false);
    expect(parseServerEvent({ type: "WELCOME" }).success).toBe(false); // trūkst lauku
    expect(parseServerEvent({ type: "STATE_SNAPSHOT", roomId: "r1", serverNow: 1 }).success).toBe(
      false
    ); // trūkst seq/snapshot
    expect(parseServerEvent(null).success).toBe(false);
    expect(parseServerEvent("string").success).toBe(false);
  });

  it("validates and rejects cross-instance fanout messages", () => {
    expect(
      parseServerEventFanout({
        kind: "broadcast",
        event: { type: "PONG", clientTime: 1, serverNow: 2 }
      }).success
    ).toBe(true);
    expect(parseServerEventFanout({ kind: "player", playerId: "c1" }).success).toBe(false); // trūkst event
    expect(parseServerEventFanout({ kind: "broadcast", event: { type: "X" } }).success).toBe(false);
  });
});
