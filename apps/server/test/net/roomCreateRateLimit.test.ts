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

/** Harness ar maināmu pulksteni (token-bucket atjaunošanās pārbaudei). */
function buildHarness() {
  const clock = { now: 1000 };
  const displayIds = new DisplayIdRegistry();
  let roomSeq = 0;
  const rooms = new RoomManager({
    clock: () => clock.now,
    displayIds,
    createRoomId: () => `room-${(roomSeq += 1)}`,
    createRoomCode: () => `CODE${roomSeq}`,
    createSeed: () => "seed-fixed"
  });
  const chat = new LobbyChat({ clock: () => clock.now });
  const gateway = new WebSocketGateway({
    clock: () => clock.now,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat }),
    createSessionId: () => "session-x",
    createReconnectToken: () => "token-x"
  });
  return { gateway, clock };
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

/** Izveido istabu un uzreiz pamet to (lai nākamā izveide neatduras pret ALREADY_IN_ROOM). */
function createThenLeave(gateway: WebSocketGateway, conn: FakeConnection): void {
  send(gateway, conn, { type: "CREATE_ROOM" });
  send(gateway, conn, { type: "LEAVE_ROOM" });
}

describe("room creation rate limit (M5)", () => {
  it("allows a burst of 5 creates then rejects the 6th with RATE_LIMITED at a fixed clock", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");

    for (let i = 0; i < 5; i += 1) {
      host.sent.length = 0;
      createThenLeave(gateway, host);
      expect(host.typed("ERROR"), `create #${i + 1} should be accepted`).toHaveLength(0);
      expect(host.lastTyped("ROOM_CREATED")).toBeDefined();
    }

    host.sent.length = 0;
    send(gateway, host, { type: "CREATE_ROOM" });
    expect(host.lastTyped("ERROR")).toMatchObject({ code: "RATE_LIMITED" });
    expect(host.typed("ROOM_CREATED")).toHaveLength(0);
  });

  it("replenishes the bucket after the refill interval so creation resumes", () => {
    const { gateway, clock } = buildHarness();
    const host = connect(gateway, "c1", "host");

    // Iztērē uzliesmojuma budžetu.
    for (let i = 0; i < 5; i += 1) createThenLeave(gateway, host);
    host.sent.length = 0;
    send(gateway, host, { type: "CREATE_ROOM" });
    expect(host.lastTyped("ERROR")).toMatchObject({ code: "RATE_LIMITED" });

    // Pēc atjaunošanās intervāla (5000 ms) uzkrājas viena atļauja → izveide atļauta.
    clock.now += 5000;
    host.sent.length = 0;
    send(gateway, host, { type: "CREATE_ROOM" });
    expect(host.typed("ERROR")).toHaveLength(0);
    expect(host.lastTyped("ROOM_CREATED")).toBeDefined();
  });
});
