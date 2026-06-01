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

describe("PLAYER_RESUME routing (6.7)", () => {
  it("emits PLAYER_RESUMED and resyncs the returning player with a snapshot", () => {
    const { gateway } = buildHarness();
    const host = startHostGame(gateway);
    host.sent.length = 0;

    send(gateway, host, { type: "PLAYER_RESUME", roomId: "room-1" });

    const resumed = host.typed("GAME_EVENT").filter((entry) => entry.event.type === "PLAYER_RESUMED");
    expect(resumed).toHaveLength(1);
    expect(host.lastTyped("STATE_SNAPSHOT")?.snapshot.hand).toHaveLength(7);
  });

  it("is idempotent for repeated resume on the same connection (resync only)", () => {
    const { gateway } = buildHarness();
    const host = startHostGame(gateway);
    send(gateway, host, { type: "PLAYER_RESUME", roomId: "room-1" });
    host.sent.length = 0;

    send(gateway, host, { type: "PLAYER_RESUME", roomId: "room-1" });

    expect(host.typed("GAME_EVENT")).toHaveLength(0); // PLAYER_RESUMED netiek atkārtots
    expect(host.lastTyped("STATE_SNAPSHOT")).toBeDefined();
    expect(host.typed("ERROR")).toHaveLength(0);
  });

  it("rejects resume for a room the player is not in", () => {
    const { gateway } = buildHarness();
    startHostGame(gateway);
    const outsider = connect(gateway, "c2", "outsider");

    send(gateway, outsider, { type: "PLAYER_RESUME", roomId: "room-1" });

    expect(outsider.lastTyped("ERROR")).toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects resume before the game has started", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    host.sent.length = 0;

    send(gateway, host, { type: "PLAYER_RESUME", roomId: "room-1" });

    expect(host.lastTyped("ERROR")).toMatchObject({ code: "ROOM_NOT_FOUND" });
  });
});
