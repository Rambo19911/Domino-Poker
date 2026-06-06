import type { ServerEvent } from "@domino-poker/shared";
import { describe, expect, it } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import type { GatewayConnection } from "../../src/net/GatewayConnection.js";
import { CoreMessageRouter } from "../../src/net/messageRouter.js";
import { WebSocketGateway } from "../../src/net/WebSocketGateway.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";
import { ManualTimerController } from "../../src/timers/ManualTimerController.js";

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

  welcomeToken(): string | undefined {
    const welcome = this.sent.find((event): event is Extract<ServerEvent, { type: "WELCOME" }> => event.type === "WELCOME");
    return welcome?.reconnectToken;
  }
}

/** Harness ar vadāmu laiku (TTL sweep) un pieslēgtu dalības-zaudēšanas atbrīvošanu (kā index.ts). */
function buildHarness(ttlMs: number) {
  const timer = new ManualTimerController(1000);
  const displayIds = new DisplayIdRegistry();
  let roomSeq = 0;
  let tokenSeq = 0;
  const rooms = new RoomManager({
    clock: timer.now,
    displayIds,
    ttlMs,
    createRoomId: () => `room-${(roomSeq += 1)}`,
    createRoomCode: () => `CODE${roomSeq}`,
    createSeed: () => "seed-fixed"
  });
  const chat = new LobbyChat({ clock: timer.now });
  const gateway = new WebSocketGateway({
    clock: timer.now,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat }),
    createSessionId: () => "session-x",
    createReconnectToken: () => `token-${(tokenSeq += 1)}`
  });
  // M3 wiring (kā index.ts): dalības zaudēšana → atbrīvo offline spēlētāja sesiju.
  rooms.setMemberDepartedHandler((clientId) => gateway.releaseSession(clientId));
  return { gateway, timer };
}

function helloFrom(gateway: WebSocketGateway, id: string, clientId: string, reconnectToken?: string): FakeConnection {
  const conn = new FakeConnection(id);
  gateway.open(conn);
  const message: Record<string, unknown> = { type: "HELLO", protocolVersion: "1", clientBuild: "t", clientId };
  if (reconnectToken !== undefined) message.reconnectToken = reconnectToken;
  gateway.message(conn, JSON.stringify(message));
  return conn;
}

function send(gateway: WebSocketGateway, conn: FakeConnection, message: Record<string, unknown>): void {
  gateway.message(conn, JSON.stringify(message));
}

describe("durable session release (M3)", () => {
  it("releases the session when the player's room is destroyed while they are offline (TTL sweep)", () => {
    const { gateway, timer } = buildHarness(1000);

    // Host izveido istabu, tad atvienojas (paliek istabā → token saglabājas).
    const first = helloFrom(gateway, "c1", "host");
    expect(first.welcomeToken()).toBe("token-1");
    send(gateway, first, { type: "CREATE_ROOM" });
    gateway.close(first); // offline, bet joprojām WAITING istabā

    // TTL beidzas → istabu izslauka → dalība zūd → offline → sesija atbrīvota.
    timer.advanceTo(1000 + 1000 + 1);
    gateway.sweepExpiredRooms();

    // Reconnect ar veco token: sesija atbrīvota → svaiga sesija ar JAUNU token.
    const second = helloFrom(gateway, "c2", "host", "token-1");
    expect(second.welcomeToken()).toBe("token-2");
  });

  it("keeps the durable token across disconnect while the player is still in a room (reconnect grace)", () => {
    const { gateway } = buildHarness(60_000);

    const first = helloFrom(gateway, "c1", "host");
    expect(first.welcomeToken()).toBe("token-1");
    send(gateway, first, { type: "CREATE_ROOM" });
    gateway.close(first); // offline, istaba vēl pastāv (TTL nav beidzies)

    // Reconnect ar to pašu token → TĀ PATI sesija (token saglabāts, NEatbrīvots).
    const second = helloFrom(gateway, "c2", "host", "token-1");
    expect(second.welcomeToken()).toBe("token-1");
  });

  it("does not release an online player's session when they leave a room (offline guard)", () => {
    const { gateway } = buildHarness(60_000);

    const first = helloFrom(gateway, "c1", "host");
    send(gateway, first, { type: "CREATE_ROOM" });
    // Pamet istabu, paliekot TIEŠSAISTĒ → dalība zūd, bet sesija NETIEK atbrīvota.
    send(gateway, first, { type: "LEAVE_ROOM" });
    gateway.close(first);

    // Reconnect ar veco token → tā pati sesija (token saglabāts pāri leave+disconnect).
    const second = helloFrom(gateway, "c2", "host", "token-1");
    expect(second.welcomeToken()).toBe("token-1");
  });
});
