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
}

/** Maināms pulkstenis (testa kontrolē laiku) + gateway ar īsu intervālu. */
function makeGateway(now: () => number): WebSocketGateway {
  const displayIds = new DisplayIdRegistry();
  const rooms = new RoomManager({ clock: now, displayIds });
  const chat = new LobbyChat({ clock: now });
  return new WebSocketGateway({
    clock: now,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat }),
    pingIntervalMs: 1000,
    missedPongThreshold: 2 // klusuma robeža = 2000 ms
  });
}

function hello(clientId = "client-A"): string {
  return JSON.stringify({ type: "HELLO", protocolVersion: "1", clientBuild: "t", clientId });
}

function ping(): string {
  return JSON.stringify({ type: "PING", clientTime: 1 });
}

describe("WebSocketGateway heartbeat (6.8)", () => {
  it("closes a connection that stays silent past the threshold", () => {
    let t = 0;
    const gateway = makeGateway(() => t);
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello()); // lastSeenAt = 0
    expect(gateway.onlineCount()).toBe(1);

    t = 2000; // klusums >= 2000 ms
    gateway.sweepHeartbeats();

    expect(conn.isClosed).toBe(true);
    expect(conn.closedCode).toBe(4002);
    expect(gateway.onlineCount()).toBe(0);
  });

  it("keeps a connection alive when any message arrives in time", () => {
    let t = 0;
    const gateway = makeGateway(() => t);
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello());

    t = 1500;
    gateway.message(conn, ping()); // lastSeenAt = 1500
    t = 3000; // 3000 - 1500 = 1500 < 2000
    gateway.sweepHeartbeats();

    expect(conn.isClosed).toBe(false);
    expect(gateway.onlineCount()).toBe(1);
  });

  it("only sweeps once the silence reaches the limit (boundary)", () => {
    let t = 0;
    const gateway = makeGateway(() => t);
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello());

    t = 1999;
    gateway.sweepHeartbeats();
    expect(conn.isClosed).toBe(false);

    t = 2000;
    gateway.sweepHeartbeats();
    expect(conn.isClosed).toBe(true);
  });

  it("also sweeps a silent connection that never completed the handshake", () => {
    let t = 0;
    const gateway = makeGateway(() => t);
    const conn = new FakeConnection("c1");
    gateway.open(conn); // bez HELLO

    t = 2000;
    gateway.sweepHeartbeats();

    expect(conn.isClosed).toBe(true);
    expect(gateway.onlineCount()).toBe(0);
  });
});
