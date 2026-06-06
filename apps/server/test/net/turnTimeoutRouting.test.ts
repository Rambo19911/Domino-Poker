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
  const timer = new ManualTimerController(0);
  const displayIds = new DisplayIdRegistry();
  const rooms = new RoomManager({
    clock: timer.now,
    displayIds,
    createRoomId: () => "room-1",
    createRoomCode: () => "CODE1",
    createSeed: () => "seed-fixed",
    createTurnScheduler: () => timer.scheduler
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

describe("Turn timeout integration (Phase 7.1)", () => {
  it("auto-plays the idle human on timeout and delivers the progressed game", () => {
    const { gateway, timer } = buildHarness();
    const host = new FakeConnection("c1");
    gateway.open(host);
    gateway.message(host, JSON.stringify({ type: "HELLO", protocolVersion: "1", clientBuild: "t", clientId: "host" }));
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });
    host.sent.length = 0;

    // Host neko nedara → turns notimeoutojas (deadline = 0 + 10000; +grace).
    timer.advanceTo(10_050);

    const events = host.typed("GAME_EVENT");
    // Notika timeout, host tika auto-nobidēts, un spēle virzījās tālāk.
    expect(events.some((entry) => entry.event.type === "TURN_TIMEOUT")).toBe(true);
    expect(
      events.some(
        (entry) => entry.event.type === "BID_ACCEPTED" && (entry.event as { playerId: string }).playerId === "1"
      )
    ).toBe(true);
    expect(events.some((entry) => entry.event.type === "TURN_STARTED")).toBe(true);
    expect(host.lastTyped("STATE_SNAPSHOT")).toBeDefined();
  });

  it("does not time out a human who acts before the deadline", () => {
    const { gateway, timer } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    const turnId = host
      .typed("GAME_EVENT")
      .filter((entry) => entry.event.type === "TURN_STARTED")
      .map((entry) => (entry.event as { turn: { turnId: string; playerId: string } }).turn)
      .filter((turn) => turn.playerId === "1")
      .at(-1)?.turnId;
    expect(turnId).toBeDefined();

    timer.advanceTo(5_000); // pirms deadline
    send(gateway, host, { type: "SUBMIT_BID", requestId: "b1", roomId: "room-1", turnId, bid: 0 });
    host.sent.length = 0;

    timer.advanceTo(10_050); // ja taimeris būtu palicis, te notimeotu — bet host jau nobidēja

    const timeouts = host.typed("GAME_EVENT").filter((entry) => entry.event.type === "TURN_TIMEOUT");
    expect(timeouts).toHaveLength(0);
  });

  it("rejects a late action that arrives after the turn already timed out", () => {
    const { gateway, timer } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });
    const staleTurnId = host
      .typed("GAME_EVENT")
      .filter((entry) => entry.event.type === "TURN_STARTED")
      .map((entry) => (entry.event as { turn: { turnId: string; playerId: string } }).turn)
      .filter((turn) => turn.playerId === "1")
      .at(-1)?.turnId;

    timer.advanceTo(10_050); // turns notimeoto (host auto-nobidēts)
    host.sent.length = 0;

    // Novēlota darbība ar jau pagājušo turnId → noraidīta, state nesabojāts.
    send(gateway, host, { type: "SUBMIT_BID", requestId: "late", roomId: "room-1", turnId: staleTurnId, bid: 5 });

    expect(host.lastTyped("ERROR")).toMatchObject({ code: "NOT_YOUR_TURN", requestId: "late" });
  });

  it("delivers TURN_STARTED with serverNow and a future deadlineAt", () => {
    const { gateway } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    const turnStarted = host
      .typed("GAME_EVENT")
      .find((entry) => entry.event.type === "TURN_STARTED");
    expect(turnStarted).toBeDefined();
    expect(typeof turnStarted?.serverNow).toBe("number");
    const turn = (turnStarted?.event as { turn: { startedAt: number; deadlineAt: number } }).turn;
    expect(turn.deadlineAt).toBeGreaterThan(turn.startedAt);
  });
});
