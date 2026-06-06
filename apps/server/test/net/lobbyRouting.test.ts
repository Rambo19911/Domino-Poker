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
    /* no-op for lobby tests */
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
  let tokenSeq = 0;
  const rooms = new RoomManager({
    clock: () => 1000,
    displayIds,
    createRoomId: () => `room-${(roomSeq += 1)}`,
    createRoomCode: () => `CODE${(codeSeq += 1)}`
  });
  const chat = new LobbyChat({ clock: () => 1000 });
  const gateway = new WebSocketGateway({
    clock: () => 1000,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat }),
    createSessionId: () => `session-${(tokenSeq += 1)}`,
    createReconnectToken: () => `token-${tokenSeq}`
  });
  return { gateway, rooms };
}

/** Atver savienojumu un pabeidz HELLO handshake; atgriež viltus savienojumu. */
function connect(gateway: WebSocketGateway, id: string, clientId: string): FakeConnection {
  const conn = new FakeConnection(id);
  gateway.open(conn);
  gateway.message(conn, JSON.stringify({ type: "HELLO", protocolVersion: "1", clientBuild: "t", clientId }));
  conn.sent.length = 0; // atmetam WELCOME, lai testi skatās tikai lobby eventus
  return conn;
}

function send(gateway: WebSocketGateway, conn: FakeConnection, message: Record<string, unknown>): void {
  gateway.message(conn, JSON.stringify(message));
}

describe("Lobby message routing (6.5)", () => {
  it("CREATE_ROOM acks the host and broadcasts LOBBY_STATE to everyone", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    const watcher = connect(gateway, "c2", "watcher");

    send(gateway, host, { type: "CREATE_ROOM" });

    const created = host.lastTyped("ROOM_CREATED");
    expect(created?.room.id).toBe("room-1");
    expect(created?.room.seatsFilled).toBe(1);

    // Abi savienojumi saņem LOBBY_STATE ar 1 istabu un onlineCount 2.
    for (const conn of [host, watcher]) {
      const lobby = conn.lastTyped("LOBBY_STATE");
      expect(lobby?.rooms).toHaveLength(1);
      expect(lobby?.onlineCount).toBe(2);
    }
  });

  it("CREATE_ROOM applies round count and optional bot fill", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");

    send(gateway, host, {
      type: "CREATE_ROOM",
      visibility: "private",
      numberOfRounds: 9,
      fillWithBots: true
    });

    const created = host.lastTyped("ROOM_CREATED");
    expect(created?.room.visibility).toBe("private");
    expect(created?.room.numberOfRounds).toBe(9);
    expect(created?.room.seatsFilled).toBe(4);
    expect(created?.room.seats.filter((seat) => seat.isAI)).toHaveLength(3);
    expect(host.lastTyped("LOBBY_STATE")?.rooms[0]).toMatchObject({
      numberOfRounds: 9,
      seatsFilled: 4
    });
  });

  it("enforces ALREADY_IN_ROOM (one room at a time)", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");

    send(gateway, host, { type: "CREATE_ROOM" });
    host.sent.length = 0;
    send(gateway, host, { type: "CREATE_ROOM" });

    expect(host.lastTyped("ERROR")).toMatchObject({ code: "ALREADY_IN_ROOM" });
    expect(host.typed("ROOM_CREATED")).toHaveLength(0);
  });

  it("LIST_ROOMS returns the public room summaries without broadcasting", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const watcher = connect(gateway, "c2", "watcher");

    send(gateway, watcher, { type: "LIST_ROOMS" });

    expect(watcher.lastTyped("ROOM_LIST")?.rooms).toHaveLength(1);
    // LIST_ROOMS ir tikai lasījums — tas nedrīkst izsūtīt LOBBY_STATE.
    expect(watcher.typed("LOBBY_STATE")).toHaveLength(0);
  });

  it("JOIN_ROOM by id seats a second player and broadcasts the change", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    host.sent.length = 0;
    const guest = connect(gateway, "c2", "guest");

    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });

    const joined = guest.lastTyped("ROOM_JOINED");
    expect(joined?.room.id).toBe("room-1");
    expect(joined?.room.seatsFilled).toBe(2);
    expect(host.lastTyped("ROOM_JOINED")?.room.seatsFilled).toBe(2);
    expect(host.lastTyped("LOBBY_STATE")?.rooms[0]?.seatsFilled).toBe(2);
  });

  it("VIEW_ROOM returns a room view without taking a seat", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");

    send(gateway, guest, { type: "VIEW_ROOM", roomId: "room-1" });

    expect(guest.lastTyped("ROOM_VIEW")?.room.seatsFilled).toBe(1);
    expect(host.lastTyped("LOBBY_STATE")?.rooms[0]?.seatsFilled).toBe(1);
  });

  it("JOIN_ROOM by code seats a player without exposing the code in room summaries", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM", visibility: "private" });
    const guest = connect(gateway, "c2", "guest");

    send(gateway, guest, { type: "JOIN_ROOM", code: "CODE1", seatIndex: 1 });

    expect(guest.lastTyped("ROOM_JOINED")?.room.seatsFilled).toBe(2);
    expect(host.lastTyped("ROOM_JOINED")?.room.seatsFilled).toBe(2);
    expect(guest.lastTyped("LOBBY_STATE")?.rooms[0]?.code).toBe("");
  });

  it("JOIN_ROOM for a missing room replies ROOM_NOT_FOUND", () => {
    const { gateway } = buildHarness();
    const guest = connect(gateway, "c1", "guest");

    send(gateway, guest, { type: "JOIN_ROOM", roomId: "no-such-room", seatIndex: 1 });

    expect(guest.lastTyped("ERROR")).toMatchObject({ code: "ROOM_NOT_FOUND" });
  });

  it("LEAVE_ROOM frees the seat and broadcasts LOBBY_STATE", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    host.sent.length = 0;

    send(gateway, host, { type: "LEAVE_ROOM" });

    expect(host.lastTyped("ROOM_LEFT")?.roomId).toBe("room-1");
    // Pēdējais cilvēks aizgāja → istaba DESTROYED → pazūd no saraksta.
    expect(host.lastTyped("LOBBY_STATE")?.rooms).toHaveLength(0);
  });

  it("LEAVE_ROOM refreshes the waiting room view for remaining players", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    host.sent.length = 0;
    guest.sent.length = 0;

    send(gateway, guest, { type: "LEAVE_ROOM" });

    expect(guest.lastTyped("ROOM_LEFT")?.roomId).toBe("room-1");
    expect(host.lastTyped("ROOM_JOINED")?.room.seatsFilled).toBe(1);
    expect(host.lastTyped("ROOM_JOINED")?.room.seats.some((seat) => seat.displayId === "#00002")).toBe(false);
    expect(host.lastTyped("LOBBY_STATE")?.rooms[0]?.seatsFilled).toBe(1);
  });

  it("FILL_SEATS_WITH_BOTS fills the table and refreshes all seated humans", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    host.sent.length = 0;
    guest.sent.length = 0;

    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });

    for (const conn of [host, guest]) {
      const view = conn.lastTyped("ROOM_JOINED")?.room;
      expect(view?.seatsFilled).toBe(4);
      expect(view?.seats.filter((seat) => seat.isAI)).toHaveLength(2);
    }
  });

  it("FILL_SEATS_WITH_BOTS from a non-host replies NOT_HOST", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    guest.sent.length = 0;

    send(gateway, guest, { type: "FILL_SEATS_WITH_BOTS" });

    expect(guest.lastTyped("ERROR")).toMatchObject({ code: "NOT_HOST" });
  });
});

describe("Room TTL sweep broadcasts LOBBY_STATE", () => {
  it("removes an expired empty room from the list and pushes the update to watchers", () => {
    const timer = new ManualTimerController(1000);
    const displayIds = new DisplayIdRegistry();
    let roomSeq = 0;
    let sessionSeq = 0;
    const rooms = new RoomManager({
      clock: timer.now,
      displayIds,
      ttlMs: 60_000,
      createRoomId: () => `room-${(roomSeq += 1)}`,
      createRoomCode: () => `CODE${roomSeq}`
    });
    const gateway = new WebSocketGateway({
      clock: timer.now,
      displayIds,
      router: new CoreMessageRouter({ rooms, chat: new LobbyChat({ clock: timer.now }) }),
      createSessionId: () => `session-${(sessionSeq += 1)}`,
      createReconnectToken: () => `token-${sessionSeq}`
    });

    const host = connect(gateway, "c1", "host");
    const watcher = connect(gateway, "c2", "watch");
    send(gateway, host, { type: "CREATE_ROOM" });
    expect(watcher.lastTyped("LOBBY_STATE")?.rooms).toHaveLength(1);
    watcher.sent.length = 0;

    timer.set(1000 + 60_000 + 1); // past TTL
    gateway.sweepExpiredRooms();

    const lobby = watcher.lastTyped("LOBBY_STATE");
    expect(lobby).toBeDefined();
    expect(lobby?.rooms).toEqual([]);
  });

  it("does not broadcast when no room has expired", () => {
    const timer = new ManualTimerController(1000);
    const displayIds = new DisplayIdRegistry();
    let roomSeq = 0;
    let sessionSeq = 0;
    const rooms = new RoomManager({
      clock: timer.now,
      displayIds,
      ttlMs: 60_000,
      createRoomId: () => `room-${(roomSeq += 1)}`,
      createRoomCode: () => `CODE${roomSeq}`
    });
    const gateway = new WebSocketGateway({
      clock: timer.now,
      displayIds,
      router: new CoreMessageRouter({ rooms, chat: new LobbyChat({ clock: timer.now }) }),
      createSessionId: () => `session-${(sessionSeq += 1)}`,
      createReconnectToken: () => `token-${sessionSeq}`
    });

    const host = connect(gateway, "c1", "host");
    const watcher = connect(gateway, "c2", "watch");
    send(gateway, host, { type: "CREATE_ROOM" });
    watcher.sent.length = 0;

    timer.set(1000 + 30_000); // still within TTL
    gateway.sweepExpiredRooms();

    expect(watcher.typed("LOBBY_STATE")).toHaveLength(0);
  });
});

