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
  let sessionSeq = 0;
  const rooms = new RoomManager({
    clock: () => 1000,
    displayIds,
    createRoomId: () => "room-1",
    createRoomCode: () => "CODE1",
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

function startHostGame(gateway: WebSocketGateway): FakeConnection {
  const host = connect(gateway, "c1", "host");
  send(gateway, host, { type: "CREATE_ROOM" });
  send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
  send(gateway, host, { type: "START_GAME" });
  return host;
}

describe("REQUEST_SNAPSHOT recovery routing (6.7)", () => {
  it("replays the missing GAME_EVENTs incrementally for an in-buffer lastSeq", () => {
    const { gateway } = buildHarness();
    const host = startHostGame(gateway);
    host.sent.length = 0;

    send(gateway, host, { type: "REQUEST_SNAPSHOT", roomId: "room-1", lastSeq: 0 });

    const events = host.typed("GAME_EVENT");
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.seq).toBe(1); // sākot no pirmā eventa
    expect(host.typed("STATE_SNAPSHOT")).toHaveLength(0); // inkrementāli, ne pilns
  });

  it("sends a full STATE_SNAPSHOT when no lastSeq is provided", () => {
    const { gateway } = buildHarness();
    const host = startHostGame(gateway);
    host.sent.length = 0;

    send(gateway, host, { type: "REQUEST_SNAPSHOT", roomId: "room-1" });

    const snapshot = host.lastTyped("STATE_SNAPSHOT");
    expect(snapshot?.snapshot.viewerPlayerId).toBe("1");
    expect(snapshot?.snapshot.hand).toHaveLength(7);
    expect(host.typed("GAME_EVENT")).toHaveLength(0);
  });

  it("rejects a snapshot request for a room the player is not in", () => {
    const { gateway } = buildHarness();
    startHostGame(gateway);
    const outsider = connect(gateway, "c2", "outsider");

    send(gateway, outsider, { type: "REQUEST_SNAPSHOT", roomId: "room-1", lastSeq: 0 });

    expect(outsider.lastTyped("ERROR")).toMatchObject({ code: "FORBIDDEN" });
  });
});
