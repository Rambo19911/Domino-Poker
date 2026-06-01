import type { ServerEvent } from "@domino-poker/shared";
import { describe, expect, it } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import type { GatewayConnection } from "../../src/net/GatewayConnection.js";
import { CoreMessageRouter } from "../../src/net/messageRouter.js";
import { WebSocketGateway } from "../../src/net/WebSocketGateway.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";

class FakeConnection implements GatewayConnection {
  readonly id: string;
  readonly sent: ServerEvent[] = [];

  constructor(id: string) {
    this.id = id;
  }

  send(event: ServerEvent): void {
    this.sent.push(event);
  }

  close(): void {
    /* no-op */
  }

  typed<T extends ServerEvent["type"]>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.sent.filter((event): event is Extract<ServerEvent, { type: T }> => event.type === type);
  }

  lastTyped<T extends ServerEvent["type"]>(type: T): Extract<ServerEvent, { type: T }> | undefined {
    const matches = this.typed(type);
    return matches[matches.length - 1];
  }
}

function buildHarness() {
  const displayIds = new DisplayIdRegistry();
  let roomSeq = 0;
  let codeSeq = 0;
  let sessionSeq = 0;
  const rooms = new RoomManager({
    clock: () => 1000,
    displayIds,
    createRoomId: () => `room-${(roomSeq += 1)}`,
    createRoomCode: () => `CODE${(codeSeq += 1)}`,
    createSeed: () => "seed-fixed"
  });
  const chat = new LobbyChat({ clock: () => 1000 });
  const gateway = new WebSocketGateway({
    clock: () => 1000,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat }),
    createSessionId: () => `session-${(sessionSeq += 1)}`,
    createReconnectToken: () => `token-${sessionSeq}`
  });
  return { gateway };
}

function connect(gateway: WebSocketGateway, id: string, clientId: string): FakeConnection {
  const conn = new FakeConnection(id);
  gateway.open(conn);
  gateway.message(conn, JSON.stringify({ type: "HELLO", protocolVersion: "1", clientBuild: "t", clientId }));
  conn.sent.length = 0;
  return conn;
}

function send(gateway: WebSocketGateway, conn: FakeConnection, message: Record<string, unknown>): void {
  gateway.message(conn, JSON.stringify(message));
}

/** Istaba ar host (cilvēks) + 3 botiem, spēle sākta; atgriež host savienojumu. */
function startHostGame(gateway: WebSocketGateway): FakeConnection {
  const host = connect(gateway, "c1", "host");
  send(gateway, host, { type: "CREATE_ROOM" });
  send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
  send(gateway, host, { type: "START_GAME" });
  return host;
}

/** Pēdējais turnId, kas piederēja core spēlētājam (no piegādātajiem TURN_STARTED). */
function turnIdForPlayer(conn: FakeConnection, corePlayerId: string): string {
  const starts = conn
    .typed("GAME_EVENT")
    .filter((entry) => entry.event.type === "TURN_STARTED")
    .map((entry) => (entry.event as { turn: { turnId: string; playerId: string } }).turn)
    .filter((turn) => turn.playerId === corePlayerId);
  const last = starts[starts.length - 1];
  if (!last) {
    throw new Error(`No TURN_STARTED found for player ${corePlayerId}.`);
  }
  return last.turnId;
}

describe("SUBMIT_BID / SUBMIT_MOVE routing (6.7)", () => {
  it("accepts the host's legal bid and delivers BID_ACCEPTED + a fresh snapshot", () => {
    const { gateway } = buildHarness();
    const host = startHostGame(gateway);
    const turnId = turnIdForPlayer(host, "1"); // host = seat 0 = core player "1"
    host.sent.length = 0;

    send(gateway, host, { type: "SUBMIT_BID", requestId: "b1", roomId: "room-1", turnId, bid: 0 });

    expect(host.typed("ERROR")).toHaveLength(0);
    const bids = host.typed("GAME_EVENT").filter((entry) => entry.event.type === "BID_ACCEPTED");
    expect(bids.some((entry) => (entry.event as { playerId: string; bid: number }).playerId === "1")).toBe(true);
    expect(host.lastTyped("STATE_SNAPSHOT")).toBeDefined();
  });

  it("rejects a stale/wrong turnId with NOT_YOUR_TURN", () => {
    const { gateway } = buildHarness();
    const host = startHostGame(gateway);
    host.sent.length = 0;

    send(gateway, host, { type: "SUBMIT_BID", requestId: "x", roomId: "room-1", turnId: "bogus", bid: 0 });

    expect(host.lastTyped("ERROR")).toMatchObject({ code: "NOT_YOUR_TURN", requestId: "x" });
  });

  it("rejects a submit for a room the player is not in with FORBIDDEN", () => {
    const { gateway } = buildHarness();
    startHostGame(gateway);
    const outsider = connect(gateway, "c2", "outsider");

    send(gateway, outsider, { type: "SUBMIT_BID", requestId: "y", roomId: "room-1", turnId: "t", bid: 0 });

    expect(outsider.lastTyped("ERROR")).toMatchObject({ code: "FORBIDDEN", requestId: "y" });
  });

  it("treats a duplicate requestId as an idempotent replay (resync only)", () => {
    const { gateway } = buildHarness();
    const host = startHostGame(gateway);
    const turnId = turnIdForPlayer(host, "1");

    send(gateway, host, { type: "SUBMIT_BID", requestId: "dup", roomId: "room-1", turnId, bid: 0 });
    host.sent.length = 0;
    send(gateway, host, { type: "SUBMIT_BID", requestId: "dup", roomId: "room-1", turnId, bid: 0 });

    expect(host.lastTyped("STATE_SNAPSHOT")).toBeDefined();
    expect(host.typed("GAME_EVENT")).toHaveLength(0); // nekas netiek atkārtoti izsūtīts
    expect(host.typed("ERROR")).toHaveLength(0);
  });

  it("rejects a SUBMIT_MOVE during the bidding phase with MOVE_REJECTED", () => {
    const { gateway } = buildHarness();
    const host = startHostGame(gateway);
    const turnId = turnIdForPlayer(host, "1");
    host.sent.length = 0;

    send(gateway, host, {
      type: "SUBMIT_MOVE",
      requestId: "m",
      roomId: "room-1",
      turnId,
      move: { tile: { side1: 0, side2: 0 } }
    });

    expect(host.lastTyped("ERROR")).toMatchObject({ code: "MOVE_REJECTED", requestId: "m" });
  });
});
