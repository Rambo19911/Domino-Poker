import type { ServerEvent, WelcomeEvent } from "@domino-poker/shared";
import { describe, expect, it, vi } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { DISPLAY_ID_PATTERN, DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import type { GatewayConnection } from "../../src/net/GatewayConnection.js";
import { CoreMessageRouter } from "../../src/net/messageRouter.js";
import { WebSocketGateway, type AuthResolver } from "../../src/net/WebSocketGateway.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";

const FIXED_NOW = 1000;

class FakeConnection implements GatewayConnection {
  readonly id: string;
  readonly sent: ServerEvent[] = [];
  isClosed = false;

  constructor(id: string) {
    this.id = id;
  }

  send(event: ServerEvent): void {
    this.sent.push(event);
  }

  close(): void {
    this.isClosed = true;
  }

  welcome(): WelcomeEvent | undefined {
    return this.sent.find((event): event is WelcomeEvent => event.type === "WELCOME");
  }
}

function makeGateway(resolveAuth?: AuthResolver): WebSocketGateway {
  const displayIds = new DisplayIdRegistry();
  const rooms = new RoomManager({ clock: () => FIXED_NOW, displayIds });
  const chat = new LobbyChat({ clock: () => FIXED_NOW });
  return new WebSocketGateway({
    clock: () => FIXED_NOW,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat }),
    createSessionId: () => "session-1",
    createReconnectToken: () => "token-1",
    ...(resolveAuth ? { resolveAuth } : {})
  });
}

function hello(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "HELLO",
    protocolVersion: "1",
    clientBuild: "test",
    clientId: "client-A",
    ...overrides
  });
}

const resolveAuth: AuthResolver = async (token) =>
  token === "good-token"
    ? { userId: "user-1", username: "Alice", avatar: "avatar-03", title: "student" }
    : undefined;

describe("WebSocketGateway optional auth handshake", () => {
  it("overrides displayId with username and includes auth fields for a valid token", async () => {
    const gateway = makeGateway(resolveAuth);
    const conn = new FakeConnection("c1");
    gateway.open(conn);

    gateway.message(conn, hello({ authToken: "good-token" }));
    await vi.waitFor(() => expect(conn.welcome()).toBeDefined());

    expect(conn.welcome()).toMatchObject({
      type: "WELCOME",
      playerId: "client-A",
      displayId: "Alice",
      userId: "user-1",
      username: "Alice",
      avatar: "avatar-03",
      isRegistered: true
    });
  });

  it("falls back to anonymous identity for an invalid token (never blocks play)", async () => {
    const gateway = makeGateway(resolveAuth);
    const conn = new FakeConnection("c1");
    gateway.open(conn);

    gateway.message(conn, hello({ authToken: "stale-token" }));
    await vi.waitFor(() => expect(conn.welcome()).toBeDefined());

    const welcome = conn.welcome()!;
    expect(welcome.displayId).toMatch(DISPLAY_ID_PATTERN);
    expect(welcome.userId).toBeUndefined();
    expect(welcome.username).toBeUndefined();
    expect(conn.isClosed).toBe(false);
  });

  it("stays anonymous when no authToken is sent", () => {
    const gateway = makeGateway(resolveAuth);
    const conn = new FakeConnection("c1");
    gateway.open(conn);

    gateway.message(conn, hello());

    const welcome = conn.welcome()!;
    expect(welcome.displayId).toMatch(DISPLAY_ID_PATTERN);
    expect(welcome.userId).toBeUndefined();
  });
});
