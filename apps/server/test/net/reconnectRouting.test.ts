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
  isClosed = false;
  closedCode: number | undefined;

  constructor(id: string) {
    this.id = id;
  }

  send(event: ServerEvent): void {
    this.sent.push(event);
  }

  close(code?: number): void {
    this.isClosed = true;
    this.closedCode = code;
  }

  typed<T extends ServerEvent["type"]>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.sent.filter((event): event is Extract<ServerEvent, { type: T }> => event.type === type);
  }

  lastTyped<T extends ServerEvent["type"]>(type: T): Extract<ServerEvent, { type: T }> | undefined {
    const matches = this.typed(type);
    return matches[matches.length - 1];
  }

  gameEventTypes(): string[] {
    return this.typed("GAME_EVENT").map((entry) => entry.event.type);
  }
}

function buildHarness() {
  const displayIds = new DisplayIdRegistry();
  let tokenSeq = 0;
  let sessionSeq = 0;
  const rooms = new RoomManager({
    clock: () => 1000,
    displayIds,
    createRoomId: () => "room-1",
    createRoomCode: () => "CODE1",
    createSeed: () => "seed-fixed"
    // botPaceMs noklusējums 0 → sinhrona izspēle (testiem)
  });
  const chat = new LobbyChat({ clock: () => 1000 });
  const gateway = new WebSocketGateway({
    clock: () => 1000,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat }),
    createSessionId: () => `session-${(sessionSeq += 1)}`,
    createReconnectToken: () => `token-${(tokenSeq += 1)}`
  });
  return { gateway };
}

function connect(gateway: WebSocketGateway, id: string, clientId: string, reconnectToken?: string): FakeConnection {
  const conn = new FakeConnection(id);
  gateway.open(conn);
  gateway.message(
    conn,
    JSON.stringify({
      type: "HELLO",
      protocolVersion: "1",
      clientBuild: "t",
      clientId,
      ...(reconnectToken !== undefined ? { reconnectToken } : {})
    })
  );
  return conn;
}

function send(gateway: WebSocketGateway, conn: FakeConnection, message: Record<string, unknown>): void {
  gateway.message(conn, JSON.stringify(message));
}

describe("Reconnect + disconnect routing (9.2 / 9.3-a)", () => {
  it("restores the room view and a fresh snapshot when a seated player reconnects", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host"); // token-1
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    gateway.close(host); // atvienojas (refresh)

    const back = connect(gateway, "c2", "host", "token-1"); // reconnect ar token
    // Atjaunots: istabas skats + svaigs personalizēts snapshot ar roku.
    expect(back.lastTyped("ROOM_JOINED")?.room.id).toBe("room-1");
    const snapshot = back.lastTyped("STATE_SNAPSHOT");
    expect(snapshot?.snapshot.viewerPlayerId).toBe("1");
    expect(snapshot?.snapshot.hand).toHaveLength(7);
    // Citi redz PLAYER_RESUMED (te tikai host, bet events tika izsūtīts).
    expect(back.gameEventTypes()).toContain("PLAYER_RESUMED");
    expect(back.isClosed).toBe(false);
  });

  it("marks a disconnected player and notifies the remaining humans (game continues)", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });
    guest.sent.length = 0;

    gateway.close(host); // host atvienojas (paliek guest)

    // Guest saņem PLAYER_DISCONNECTED par host (core id "1"); spēle netiek apturēta.
    const disconnected = guest
      .typed("GAME_EVENT")
      .find((entry) => entry.event.type === "PLAYER_DISCONNECTED");
    expect(disconnected).toBeDefined();
    expect(disconnected?.event.type === "PLAYER_DISCONNECTED" && disconnected.event.playerId).toBe("1");
  });

  it("does not mark disconnected when a connection is merely superseded by a newer one", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host"); // token-1
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });
    guest.sent.length = 0;

    // Host atver JAUNU savienojumu (cits tabs) → aizstāj veco; host paliek tiešsaistē.
    const host2 = connect(gateway, "c3", "host", "token-1");
    expect(host.isClosed).toBe(true);
    expect(host.closedCode).toBe(4003); // superseded
    expect(host2.isClosed).toBe(false);

    // Guest NEsaņem PLAYER_DISCONNECTED (host nav offline — viņš pārslēdza socketu).
    expect(guest.gameEventTypes()).not.toContain("PLAYER_DISCONNECTED");
  });
});
