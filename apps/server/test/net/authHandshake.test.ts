import type { ServerEvent, WelcomeEvent } from "@domino-poker/shared";
import { describe, expect, it, vi } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { DISPLAY_ID_PATTERN, DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import type { GatewayConnection } from "../../src/net/GatewayConnection.js";
import { CoreMessageRouter } from "../../src/net/messageRouter.js";
import { WebSocketGateway, type AuthResolver } from "../../src/net/WebSocketGateway.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";
import type {
  CreateDurableSessionResult,
  DurableSessionRecord,
  DurableSessionStore,
  NewDurableSessionRecord
} from "../../src/sessions/DurableSessionStore.js";

class FakeDurableSessionStore implements DurableSessionStore {
  readonly sessions = new Map<string, DurableSessionRecord>();
  readonly displayIds = new Set<string>();

  async getSession(playerId: string): Promise<DurableSessionRecord | undefined> {
    return this.sessions.get(playerId);
  }

  async createSessionIfAbsent(record: NewDurableSessionRecord): Promise<CreateDurableSessionResult> {
    if (this.sessions.has(record.playerId)) return "player_exists";
    if (this.displayIds.has(record.displayId)) return "display_id_taken";
    this.sessions.set(record.playerId, record);
    this.displayIds.add(record.displayId);
    return "created";
  }

  async deleteSession(playerId: string): Promise<void> {
    const record = this.sessions.get(playerId);
    if (record) this.displayIds.delete(record.displayId);
    this.sessions.delete(playerId);
  }
}

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

function makeGateway(
  resolveAuth?: AuthResolver,
  durableSessionStore?: DurableSessionStore
): WebSocketGateway {
  const displayIds = new DisplayIdRegistry();
  const rooms = new RoomManager({ clock: () => FIXED_NOW, displayIds });
  const chat = new LobbyChat({ clock: () => FIXED_NOW });
  return new WebSocketGateway({
    clock: () => FIXED_NOW,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat }),
    createSessionId: () => "session-1",
    createReconnectToken: () => "token-1",
    ...(resolveAuth ? { resolveAuth } : {}),
    ...(durableSessionStore ? { durableSessionStore } : {})
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
    // HELLO must persist the userId to the session so getUserId resolves it — this
    // drives match-start stats attribution AND seat rank badges (Leaderboard).
    expect(gateway.getUserId("client-A")).toBe("user-1");
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

  it("does not leave a zombie session when the socket closes during async auth", async () => {
    // Race: HELLO sāk async auth atrisināšanu; socket aizveras, PIRMS auth atbild.
    // `completeHello` nedrīkst piesaistīt identitāti mirušam savienojumam.
    let resolveAuthLate: ((info: undefined) => void) | undefined;
    const slowAuth: AuthResolver = () =>
      new Promise<undefined>((resolve) => {
        resolveAuthLate = resolve;
      });
    const gateway = makeGateway(slowAuth);
    const conn = new FakeConnection("c1");
    gateway.open(conn);

    gateway.message(conn, hello({ authToken: "any-token" }));
    // Auth vēl nav atrisināts → socket aizveras (transporta close).
    gateway.close(conn);
    // Tagad auth atbild novēloti.
    resolveAuthLate?.(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(conn.welcome()).toBeUndefined();
    expect(gateway.onlineCount()).toBe(0);
    expect(gateway.isOnline("client-A")).toBe(false);
  });

  it("releases the durable session if the socket closes during async registration", async () => {
    // Durable ceļš: createSessionIfAbsent persistē reconnectToken, ko klients (mirušais
    // socket) nesaņem. Ja to neatbrīvo, tas pats clientId vēlāk saņemtu token_mismatch
    // (lockout). Aizvēršot mid-async, durable sesijai jābūt notīrītai.
    const store = new FakeDurableSessionStore();
    const gateway = makeGateway(undefined, store);
    const conn = new FakeConnection("c1");
    gateway.open(conn);

    gateway.message(conn, hello()); // durable registerAsync → async
    gateway.close(conn); // socket aizveras pirms reģistrācija pabeidzas
    // Iztukšojam async ķēdi: getSession → createSessionIfAbsent → bind → completeHello
    // → cleanupAbortedHandshake → release → deleteSession.
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }

    expect(conn.welcome()).toBeUndefined();
    expect(store.sessions.has("client-A")).toBe(false); // durable sesija atbrīvota
    expect(gateway.isOnline("client-A")).toBe(false);
  });

  it("does not orphan the replaced connection when a superseding HELLO dies mid-async", async () => {
    // A pabeidz HELLO (online). B (tas pats clientId, derīgs token) sāk async auth un
    // jau ir aizstājis A SessionManager pusē; tad B aizveras. Vecais A nedrīkst palikt
    // dzīvs-bet-neaktīvs orfans — to vajag noārdīt.
    let resolveAuthLate: ((info: undefined) => void) | undefined;
    const slowAuth: AuthResolver = () =>
      new Promise<undefined>((resolve) => {
        resolveAuthLate = resolve;
      });
    const gateway = makeGateway(slowAuth);

    const connA = new FakeConnection("cA");
    gateway.open(connA);
    gateway.message(connA, hello()); // bez authToken → sinhroni, A online
    expect(gateway.isOnline("client-A")).toBe(true);
    const token = connA.welcome()!.reconnectToken;

    const connB = new FakeConnection("cB");
    gateway.open(connB);
    gateway.message(connB, hello({ reconnectToken: token, authToken: "any" })); // async (slowAuth)
    gateway.close(connB); // B aizveras pirms auth atbild
    resolveAuthLate?.(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(connA.isClosed).toBe(true); // vecais savienojums noārdīts, ne orfans
    expect(gateway.onlineCount()).toBe(0);
    expect(gateway.isOnline("client-A")).toBe(false);
  });
});
