import type { ServerEvent } from "@domino-poker/shared";
import { describe, expect, it } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import { publishGameUpdate } from "../../src/net/gameUpdateDelivery.js";
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
  let sessionSeq = 0;
  const rooms = new RoomManager({
    clock: () => 1000,
    displayIds,
    createRoomId: () => `room-${(roomSeq += 1)}`,
    createRoomCode: () => `CODE${(codeSeq += 1)}`,
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

describe("START_GAME routing (6.7)", () => {
  it("delivers a personalized STATE_SNAPSHOT and the opening GAME_EVENTs to the seated host", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    host.sent.length = 0;

    send(gateway, host, { type: "START_GAME" });

    const snapshot = host.lastTyped("STATE_SNAPSHOT");
    expect(snapshot?.roomId).toBe("room-1");
    expect(snapshot?.snapshot.viewerPlayerId).toBe("1");
    expect(snapshot?.snapshot.hand).toHaveLength(7);

    // Klientam jāsaņem TURN_STARTED (tur ir turnId, ko vajag SUBMIT_BID).
    const gameEvents = host.typed("GAME_EVENT");
    expect(gameEvents.some((entry) => entry.event.type === "TURN_STARTED")).toBe(true);
  });

  it("does not leak game state or events to a lobby user outside the room", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    const watcher = connect(gateway, "c2", "watcher");
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    watcher.sent.length = 0;

    send(gateway, host, { type: "START_GAME" });

    expect(watcher.typed("STATE_SNAPSHOT")).toHaveLength(0);
    expect(watcher.typed("GAME_EVENT")).toHaveLength(0);
    // Tomēr istabas saraksta izmaiņu (IN_GAME) tas redz.
    expect(watcher.typed("LOBBY_STATE").length).toBeGreaterThan(0);
  });

  it("rejects START_GAME from a non-host with NOT_HOST", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    guest.sent.length = 0;

    send(gateway, guest, { type: "START_GAME" });

    expect(guest.lastTyped("ERROR")).toMatchObject({ code: "NOT_HOST" });
  });

  it("rejects START_GAME before the table is full", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    host.sent.length = 0;

    send(gateway, host, { type: "START_GAME" });

    expect(host.lastTyped("ERROR")).toMatchObject({ code: "FORBIDDEN" });
    expect(host.typed("STATE_SNAPSHOT")).toHaveLength(0);
  });
});

/** Harness ar vadāmu timeri + pirms-spēles grace, lai pārbaudītu aizkavēto sākumu. */
function buildPreGameHarness() {
  const timer = new ManualTimerController(0);
  const displayIds = new DisplayIdRegistry();
  const rooms = new RoomManager({
    clock: timer.now,
    displayIds,
    createRoomId: () => "room-1",
    createRoomCode: () => "CODE1",
    createSeed: () => "seed-fixed",
    createTurnScheduler: () => timer.scheduler,
    preGameDelayMs: 10_000
  });
  const chat = new LobbyChat({ clock: timer.now });
  const gateway = new WebSocketGateway({
    clock: timer.now,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat })
  });
  rooms.setGameUpdateSink((roomId, events) =>
    publishGameUpdate(gateway, rooms, roomId, events, timer.now())
  );
  return { gateway, timer };
}

describe("Pre-game countdown (START_GAME grace)", () => {
  it("delivers GAME_STARTING + opening snapshot but defers the first bidding turn", () => {
    const { gateway } = buildPreGameHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    host.sent.length = 0;

    send(gateway, host, { type: "START_GAME" });

    // Galds + atskaite, bet solījumu turns vēl nav atvērts.
    const starting = host.lastTyped("GAME_STARTING");
    expect(starting?.startsAt).toBe(10_000); // clock 0 + 10000 grace
    expect(host.lastTyped("STATE_SNAPSHOT")?.snapshot.hand).toHaveLength(7);
    expect(host.typed("GAME_EVENT").some((entry) => entry.event.type === "TURN_STARTED")).toBe(false);
  });

  it("opens the first turn only after the pre-game delay elapses", () => {
    const { gateway, timer } = buildPreGameHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });
    host.sent.length = 0;

    timer.advanceTo(10_000); // pirms-spēles grace beidzas → pirmais turns

    expect(host.typed("GAME_EVENT").some((entry) => entry.event.type === "TURN_STARTED")).toBe(true);
    expect(host.lastTyped("STATE_SNAPSHOT")).toBeDefined();
  });
});
