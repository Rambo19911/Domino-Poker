import { DISPLAY_ID_PATTERN } from "../../src/identity/DisplayIdRegistry.js";
import { titleForWins, type ServerEvent } from "@domino-poker/shared";
import { describe, expect, it, vi } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import type { GatewayConnection } from "../../src/net/GatewayConnection.js";
import { CoreMessageRouter } from "../../src/net/messageRouter.js";
import type { ServerEventBus, ServerEventFanoutMessage } from "../../src/net/ServerEventBus.js";
import { WebSocketGateway, type ResolvedAuthInfo } from "../../src/net/WebSocketGateway.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";

class FakeConnection implements GatewayConnection {
  readonly id: string;
  readonly sent: ServerEvent[] = [];
  isClosed = false;
  closedCode: number | undefined;
  closedReason: string | undefined;
  /** Imitēts izejošā bufera apjoms (baiti) backpressure testiem. */
  buffered = 0;

  constructor(id: string) {
    this.id = id;
  }

  send(event: ServerEvent): void {
    this.sent.push(event);
  }

  sendSerialized(payload: string): void {
    // Atspoguļo reālo transportu: gateway serializē vienreiz; te parsējam atpakaļ,
    // lai testi var apgalvot par objektiem.
    this.sent.push(JSON.parse(payload) as ServerEvent);
  }

  close(code?: number, reason?: string): void {
    this.isClosed = true;
    this.closedCode = code;
    this.closedReason = reason;
  }

  bufferedAmount(): number {
    return this.buffered;
  }

  last(): ServerEvent | undefined {
    return this.sent[this.sent.length - 1];
  }
}

class FakeEventBus implements ServerEventBus {
  readonly published: ServerEventFanoutMessage[] = [];

  async publish(message: ServerEventFanoutMessage): Promise<void> {
    this.published.push(message);
  }
}

const FIXED_NOW = 1000;

function makeGateway(): WebSocketGateway {
  const displayIds = new DisplayIdRegistry();
  const rooms = new RoomManager({ clock: () => FIXED_NOW, displayIds });
  const chat = new LobbyChat({ clock: () => FIXED_NOW });
  return new WebSocketGateway({
    clock: () => FIXED_NOW,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat }),
    createSessionId: () => "session-1",
    createReconnectToken: () => "token-1"
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

describe("WebSocketGateway handshake (6.4)", () => {
  it("answers a valid HELLO with WELCOME carrying bound identity", () => {
    const gateway = makeGateway();
    const conn = new FakeConnection("c1");
    gateway.open(conn);

    gateway.message(conn, hello());

    // Pievienojoties: WELCOME pirmais, tad čata vēsture + lobby state.
    expect(conn.sent[0]).toEqual({
      type: "WELCOME",
      sessionId: "session-1",
      playerId: "client-A",
      displayId: expect.stringMatching(DISPLAY_ID_PATTERN),
      reconnectToken: "token-1",
      serverNow: FIXED_NOW
    });
    expect(conn.sent.map((event) => event.type)).toEqual([
      "WELCOME",
      "CHAT_HISTORY",
      "LOBBY_STATE"
    ]);
    expect(conn.isClosed).toBe(false);
    expect(gateway.onlineCount()).toBe(1);
  });

  it("rejects a mismatched protocol version and closes the connection", () => {
    const gateway = makeGateway();
    const conn = new FakeConnection("c1");
    gateway.open(conn);

    gateway.message(conn, hello({ protocolVersion: "999" }));

    expect(conn.last()).toMatchObject({ type: "ERROR", code: "PROTOCOL_VERSION_MISMATCH" });
    expect(conn.isClosed).toBe(true);
    expect(conn.closedCode).toBe(4001);
    expect(gateway.onlineCount()).toBe(0);
  });

  it("rejects malformed JSON with INVALID_MESSAGE", () => {
    const gateway = makeGateway();
    const conn = new FakeConnection("c1");
    gateway.open(conn);

    gateway.message(conn, "{ not json");

    expect(conn.last()).toMatchObject({ type: "ERROR", code: "INVALID_MESSAGE" });
    expect(conn.isClosed).toBe(false);
  });

  it("rejects a schema-invalid message with INVALID_MESSAGE", () => {
    const gateway = makeGateway();
    const conn = new FakeConnection("c1");
    gateway.open(conn);

    gateway.message(conn, JSON.stringify({ type: "NOT_A_REAL_TYPE" }));

    expect(conn.last()).toMatchObject({ type: "ERROR", code: "INVALID_MESSAGE" });
  });

  it("requires HELLO before any other message", () => {
    const gateway = makeGateway();
    const conn = new FakeConnection("c1");
    gateway.open(conn);

    gateway.message(conn, JSON.stringify({ type: "LIST_ROOMS" }));

    expect(conn.last()).toMatchObject({ type: "ERROR", code: "INVALID_MESSAGE" });
    expect(gateway.onlineCount()).toBe(0);
  });

  it("rejects a duplicate HELLO without rebinding identity", () => {
    const gateway = makeGateway();
    const conn = new FakeConnection("c1");
    gateway.open(conn);

    gateway.message(conn, hello());
    gateway.message(conn, hello({ clientId: "client-B" }));

    expect(conn.sent[0]).toMatchObject({ type: "WELCOME", playerId: "client-A" });
    expect(conn.last()).toMatchObject({ type: "ERROR", code: "INVALID_MESSAGE" });
    expect(gateway.onlineCount()).toBe(1);
  });
});

describe("WebSocketGateway sessions + reconnect (9.1)", () => {
  it("restores the same identity on reconnect with a matching token", () => {
    const gateway = makeGateway();
    const first = new FakeConnection("c1");
    gateway.open(first);
    gateway.message(first, hello());
    const welcome = first.sent[0] as Extract<ServerEvent, { type: "WELCOME" }>;
    const displayId = welcome.displayId;

    gateway.close(first); // atvienojas (refresh)
    expect(gateway.onlineCount()).toBe(0);

    const second = new FakeConnection("c2");
    gateway.open(second);
    gateway.message(second, hello({ reconnectToken: "token-1" }));

    expect(second.sent[0]).toMatchObject({
      type: "WELCOME",
      playerId: "client-A",
      displayId, // stabils displayId pāri reconnect
      reconnectToken: "token-1"
    });
    expect(second.isClosed).toBe(false);
    expect(gateway.onlineCount()).toBe(1);
  });

  it("rejects a reconnect whose token does not match the known clientId", () => {
    const gateway = makeGateway();
    const first = new FakeConnection("c1");
    gateway.open(first);
    gateway.message(first, hello());
    gateway.close(first);

    const second = new FakeConnection("c2");
    gateway.open(second);
    gateway.message(second, hello({ reconnectToken: "token-WRONG" }));

    expect(second.last()).toMatchObject({ type: "ERROR", code: "FORBIDDEN" });
    expect(second.isClosed).toBe(true);
    expect(second.closedCode).toBe(4004);
    expect(gateway.onlineCount()).toBe(0);
  });

  it("enforces a single active socket — a second connection supersedes the first", () => {
    const gateway = makeGateway();
    const first = new FakeConnection("c1");
    gateway.open(first);
    gateway.message(first, hello());
    expect(gateway.onlineCount()).toBe(1);

    const second = new FakeConnection("c2");
    gateway.open(second);
    gateway.message(second, hello({ reconnectToken: "token-1" }));

    // Vecais socket aizvērts ar superseded kodu; jaunais ir vienīgais aktīvais.
    expect(first.isClosed).toBe(true);
    expect(first.closedCode).toBe(4003);
    expect(second.sent[0]).toMatchObject({ type: "WELCOME", playerId: "client-A" });
    expect(gateway.onlineCount()).toBe(1);

    // Vecais socket vairs nevar kontrolēt (ziņojumi tiek atmesti).
    const beforeFirst = first.sent.length;
    gateway.message(first, JSON.stringify({ type: "PING", clientTime: 1 }));
    expect(first.sent).toHaveLength(beforeFirst);

    // Jaunais socket strādā.
    gateway.message(second, JSON.stringify({ type: "PING", clientTime: 7 }));
    expect(second.last()).toEqual({ type: "PONG", clientTime: 7, serverNow: FIXED_NOW });
  });
});

describe("WebSocketGateway routing + lifecycle (6.4)", () => {
  it("answers PING with PONG using server time after handshake", () => {
    const gateway = makeGateway();
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello());

    gateway.message(conn, JSON.stringify({ type: "PING", clientTime: 42 }));

    expect(conn.last()).toEqual({ type: "PONG", clientTime: 42, serverNow: FIXED_NOW });
  });

  it("drops messages after the connection closes and frees the online slot", () => {
    const gateway = makeGateway();
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello());
    expect(gateway.onlineCount()).toBe(1);

    gateway.close(conn);
    expect(gateway.onlineCount()).toBe(0);

    const before = conn.sent.length;
    gateway.message(conn, JSON.stringify({ type: "PING", clientTime: 1 }));
    expect(conn.sent).toHaveLength(before);
  });
});

describe("WebSocketGateway slow-client backpressure (Phase 11)", () => {
  function makeGatewayWithCap(cap: number): WebSocketGateway {
    const displayIds = new DisplayIdRegistry();
    const rooms = new RoomManager({ clock: () => FIXED_NOW, displayIds });
    const chat = new LobbyChat({ clock: () => FIXED_NOW });
    let seq = 0;
    return new WebSocketGateway({
      clock: () => FIXED_NOW,
      displayIds,
      router: new CoreMessageRouter({ rooms, chat }),
      createSessionId: () => `session-${(seq += 1)}`,
      createReconnectToken: () => `token-${seq}`,
      slowClientBufferCap: cap
    });
  }

  const event: ServerEvent = { type: "LOBBY_STATE", rooms: [], onlineCount: 2 };

  it("skips broadcast to a connection whose buffer exceeds the cap, still sends to others", () => {
    const gateway = makeGatewayWithCap(1000);
    const fast = new FakeConnection("fast");
    const slow = new FakeConnection("slow");
    for (const conn of [fast, slow]) {
      gateway.open(conn);
      gateway.message(conn, hello({ clientId: conn.id }));
      conn.sent.length = 0; // notīrām handshake izvadi
    }
    slow.buffered = 2000; // virs robežas

    gateway.broadcast(event);

    expect(fast.sent).toContainEqual(event);
    expect(slow.sent).not.toContainEqual(event);
  });

  it("resumes sending to a client once its buffer drains below the cap", () => {
    const gateway = makeGatewayWithCap(1000);
    const conn = new FakeConnection("c");
    gateway.open(conn);
    gateway.message(conn, hello({ clientId: "c" }));
    conn.sent.length = 0;

    conn.buffered = 5000;
    gateway.broadcast(event);
    expect(conn.sent).toHaveLength(0); // izlaists (pārpildīts)

    conn.buffered = 0;
    gateway.broadcast(event);
    expect(conn.sent).toContainEqual(event); // atsākts, kad buferis iztukšots
  });
});

describe("WebSocketGateway cross-instance fanout", () => {
  it("does not publish supersede for a first HELLO", async () => {
    const displayIds = new DisplayIdRegistry();
    const rooms = new RoomManager({ clock: () => FIXED_NOW, displayIds });
    const chat = new LobbyChat({ clock: () => FIXED_NOW });
    const eventBus = new FakeEventBus();
    const gateway = new WebSocketGateway({
      clock: () => FIXED_NOW,
      displayIds,
      router: new CoreMessageRouter({ rooms, chat }),
      createSessionId: () => "session-1",
      createReconnectToken: () => "token-1",
      eventBus
    });
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello());
    await Promise.resolve();

    expect(eventBus.published.some((message) => message.kind === "supersede")).toBe(false);
  });

  it("publishes supersede when a reconnect replaces an existing session", async () => {
    const displayIds = new DisplayIdRegistry();
    const rooms = new RoomManager({ clock: () => FIXED_NOW, displayIds });
    const chat = new LobbyChat({ clock: () => FIXED_NOW });
    const eventBus = new FakeEventBus();
    const gateway = new WebSocketGateway({
      clock: () => FIXED_NOW,
      displayIds,
      router: new CoreMessageRouter({ rooms, chat }),
      createSessionId: () => "session-1",
      createReconnectToken: () => "token-1",
      eventBus
    });
    const first = new FakeConnection("c1");
    gateway.open(first);
    gateway.message(first, hello());
    eventBus.published.length = 0;

    const second = new FakeConnection("c2");
    gateway.open(second);
    gateway.message(second, hello({ reconnectToken: "token-1" }));
    await Promise.resolve();

    expect(eventBus.published).toContainEqual({ kind: "supersede", playerId: "client-A" });
  });

  it("publishes local broadcasts to the event bus", async () => {
    const displayIds = new DisplayIdRegistry();
    const rooms = new RoomManager({ clock: () => FIXED_NOW, displayIds });
    const chat = new LobbyChat({ clock: () => FIXED_NOW });
    const eventBus = new FakeEventBus();
    const gateway = new WebSocketGateway({
      clock: () => FIXED_NOW,
      displayIds,
      router: new CoreMessageRouter({ rooms, chat }),
      createSessionId: () => "session-1",
      createReconnectToken: () => "token-1",
      eventBus
    });
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello());
    await Promise.resolve();
    conn.sent.length = 0;
    eventBus.published.length = 0;

    const event: ServerEvent = { type: "LOBBY_STATE", rooms: [], onlineCount: 1 };
    gateway.broadcast(event);
    await Promise.resolve();

    expect(conn.sent).toContainEqual(event);
    expect(eventBus.published).toEqual([{ kind: "broadcast", event }]);
  });

  it("delivers remote fanout locally without re-publishing it", async () => {
    const displayIds = new DisplayIdRegistry();
    const rooms = new RoomManager({ clock: () => FIXED_NOW, displayIds });
    const chat = new LobbyChat({ clock: () => FIXED_NOW });
    const eventBus = new FakeEventBus();
    const gateway = new WebSocketGateway({
      clock: () => FIXED_NOW,
      displayIds,
      router: new CoreMessageRouter({ rooms, chat }),
      createSessionId: () => "session-1",
      createReconnectToken: () => "token-1",
      eventBus
    });
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello());
    await Promise.resolve();
    conn.sent.length = 0;
    eventBus.published.length = 0;

    const event: ServerEvent = { type: "CHAT_MESSAGE", id: "m1", authorDisplayId: "#12345", text: "hi", serverNow: 1 };
    gateway.deliverRemoteBroadcast(event);

    expect(conn.sent).toContainEqual(event);
    expect(eventBus.published).toEqual([]);
  });

  it("closes a local socket superseded by another instance", async () => {
    const displayIds = new DisplayIdRegistry();
    const rooms = new RoomManager({ clock: () => FIXED_NOW, displayIds });
    const chat = new LobbyChat({ clock: () => FIXED_NOW });
    const eventBus = new FakeEventBus();
    const gateway = new WebSocketGateway({
      clock: () => FIXED_NOW,
      displayIds,
      router: new CoreMessageRouter({ rooms, chat }),
      createSessionId: () => "session-1",
      createReconnectToken: () => "token-1",
      eventBus
    });
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello({ clientId: "client-A" }));
    await Promise.resolve();

    gateway.closeRemoteSupersededPlayer("client-A");

    expect(conn.isClosed).toBe(true);
    expect(conn.closedCode).toBe(4003);
    expect(gateway.onlineCount()).toBe(0);
    const before = conn.sent.length;
    gateway.message(conn, JSON.stringify({ type: "PING", clientTime: 1 }));
    expect(conn.sent).toHaveLength(before);
  });
});

describe("LOBBY_STATE debounce (Phase 11)", () => {
  it("coalesces many lobby changes into a single broadcast after the window", () => {
    vi.useFakeTimers();
    try {
      const displayIds = new DisplayIdRegistry();
      const rooms = new RoomManager({ clock: () => FIXED_NOW, displayIds });
      const chat = new LobbyChat({ clock: () => FIXED_NOW });
      let seq = 0;
      const gateway = new WebSocketGateway({
        clock: () => FIXED_NOW,
        displayIds,
        router: new CoreMessageRouter({ rooms, chat, lobbyStateDebounceMs: 200 }),
        createSessionId: () => `s-${(seq += 1)}`,
        createReconnectToken: () => `t-${seq}`
      });

      const observer = new FakeConnection("obs");
      gateway.open(observer);
      gateway.message(observer, hello({ clientId: "obs" }));
      const a = new FakeConnection("a");
      gateway.open(a);
      gateway.message(a, hello({ clientId: "a" }));
      const b = new FakeConnection("b");
      gateway.open(b);
      gateway.message(b, hello({ clientId: "b" }));

      observer.sent.length = 0;
      gateway.message(a, JSON.stringify({ type: "CREATE_ROOM" }));
      gateway.message(b, JSON.stringify({ type: "CREATE_ROOM" }));

      const lobbyState = (): ServerEvent[] =>
        observer.sent.filter((event) => event.type === "LOBBY_STATE");

      expect(lobbyState()).toHaveLength(0); // debounced — vēl nav izsūtīts
      vi.advanceTimersByTime(200);
      expect(lobbyState()).toHaveLength(1); // daudzas izmaiņas → viens broadcast
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("WebSocketGateway ban enforcement (Phase 3.1, D1)", () => {
  function makeAuthGateway(opts: {
    resolveAuth: (token: string) => Promise<ResolvedAuthInfo | undefined>;
    isUserBanned?: (userId: string) => Promise<boolean>;
  }): WebSocketGateway {
    const displayIds = new DisplayIdRegistry();
    const rooms = new RoomManager({ clock: () => FIXED_NOW, displayIds });
    const chat = new LobbyChat({ clock: () => FIXED_NOW });
    return new WebSocketGateway({
      clock: () => FIXED_NOW,
      displayIds,
      router: new CoreMessageRouter({ rooms, chat }),
      createSessionId: () => "session-1",
      createReconnectToken: () => "token-1",
      resolveAuth: opts.resolveAuth,
      ...(opts.isUserBanned ? { isUserBanned: opts.isUserBanned } : {})
    });
  }

  const authInfo = (userId: string): ResolvedAuthInfo => ({
    userId,
    username: "Alice",
    avatar: "avatar-01",
    title: titleForWins(0)
  });

  /** Macrotask flush: ļauj async resolveAuth + ban pārbaudes ķēdei pilnībā nostrādāt. */
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it("hard-rejects an authenticated handshake for a banned account (NOT a silent anon downgrade)", async () => {
    const gateway = makeAuthGateway({
      resolveAuth: async (token) => (token === "good" ? authInfo("u1") : undefined),
      isUserBanned: async (id) => id === "u1"
    });
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello({ authToken: "good" }));
    await flush();
    expect(conn.isClosed).toBe(true);
    expect(conn.closedCode).toBe(4004); // sessionRejected
    expect(conn.sent.some((e) => e.type === "ERROR" && e.code === "FORBIDDEN")).toBe(true);
    // WELCOME NETIKA sūtīts (banots nepabeidz handshake), nav online sesijas.
    expect(conn.sent.some((e) => e.type === "WELCOME")).toBe(false);
    expect(gateway.onlineCount()).toBe(0);
  });

  it("lets an authenticated non-banned handshake complete normally", async () => {
    const gateway = makeAuthGateway({
      resolveAuth: async () => authInfo("u2"),
      isUserBanned: async () => false
    });
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello({ authToken: "good" }));
    await flush();
    expect(conn.isClosed).toBe(false);
    expect(conn.sent.some((e) => e.type === "WELCOME")).toBe(true);
    expect(gateway.onlineCount()).toBe(1);
  });

  it("disconnectUser tears down a live authenticated session for the banned user only", async () => {
    const gateway = makeAuthGateway({
      resolveAuth: async () => authInfo("u3"),
      isUserBanned: async () => false
    });
    const conn = new FakeConnection("c1");
    gateway.open(conn);
    gateway.message(conn, hello({ authToken: "good" }));
    await flush();
    expect(conn.isClosed).toBe(false);
    // Cits userId → neaiztiek šo savienojumu.
    gateway.disconnectUser("someone-else", "banned");
    expect(conn.isClosed).toBe(false);
    // Banotā userId → atvieno + FORBIDDEN.
    gateway.disconnectUser("u3", "You have been banned.");
    expect(conn.isClosed).toBe(true);
    expect(conn.sent.some((e) => e.type === "ERROR" && e.code === "FORBIDDEN")).toBe(true);
    expect(gateway.onlineCount()).toBe(0);
  });
});
