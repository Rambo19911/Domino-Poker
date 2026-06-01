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
  const rooms = new RoomManager({
    clock: () => 1000,
    displayIds,
    createRoomId: () => "room-1",
    createRoomCode: () => "CODE1",
    createSeed: () => "seed-fixed"
  });
  const chat = new LobbyChat({ clock: () => 1000 });
  const gateway = new WebSocketGateway({
    clock: () => 1000,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat })
  });
  return { gateway, rooms };
}

function connect(gateway: WebSocketGateway, id: string, clientId: string): FakeConnection {
  const conn = new FakeConnection(id);
  gateway.open(conn);
  gateway.message(conn, JSON.stringify({ type: "HELLO", protocolVersion: "1", clientBuild: "t", clientId }));
  return conn;
}

function send(gateway: WebSocketGateway, conn: FakeConnection, message: Record<string, unknown>): void {
  gateway.message(conn, JSON.stringify(message));
}

describe("Exit / forfeit during a game (LEAVE_ROOM while IN_GAME)", () => {
  it("forfeits the leaver's seat to a bot and continues the game for remaining humans", () => {
    const { gateway, rooms } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });
    guest.sent.length = 0;

    send(gateway, host, { type: "LEAVE_ROOM" }); // "Exit" spēles laikā

    expect(host.lastTyped("ROOM_LEFT")?.roomId).toBe("room-1");
    // Pārējais cilvēks redz PLAYER_LEFT (host core id "1") + atjaunoto istabas skatu.
    expect(guest.gameEventTypes()).toContain("PLAYER_LEFT");
    const view = guest.lastTyped("ROOM_JOINED");
    expect(view?.room.seats[0]?.isAI).toBe(true); // host sēdvieta (0) tagad bots
    // Istaba turpinās (nav iznīcināta), host vairs nav istabā.
    expect(rooms.roomOf("host")).toBeUndefined();
    expect(rooms.findRoom("room-1").status).toBe("IN_GAME");
  });

  it("destroys the room when the last human exits mid-game", () => {
    const { gateway, rooms } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    send(gateway, host, { type: "LEAVE_ROOM" });

    expect(host.lastTyped("ROOM_LEFT")?.roomId).toBe("room-1");
    expect(rooms.roomOf("host")).toBeUndefined();
    // Istaba pazūd no lobby saraksta (iznīcināta).
    expect(rooms.listRooms().some((room) => room.id === "room-1")).toBe(false);
  });

  it("cancels the room's turn timer on forfeit-destroy (no stray timeout crash)", () => {
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
    const gateway = new WebSocketGateway({ clock: timer.now, displayIds, router: new CoreMessageRouter({ rooms, chat }) });
    rooms.setGameUpdateSink(() => {
      /* delivery not needed for this regression */
    });

    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" }); // dzinējs ieplāno cilvēka turn-timeout

    send(gateway, host, { type: "LEAVE_ROOM" }); // pēdējais cilvēks pamet → istaba iznīcināta
    expect(rooms.listRooms().some((room) => room.id === "room-1")).toBe(false);

    // Pēc deadline: gaidošais turn-timeout NEDRĪKST izšauties uz noņemta dzinēja.
    expect(() => timer.advanceTo(1_000_000)).not.toThrow();
  });

  it("does not let a player who exited mid-game rejoin or get restored", () => {
    const { gateway, rooms } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    send(gateway, host, { type: "LEAVE_ROOM" }); // host pamet

    // Mēģina pievienoties atpakaļ → noraidīts (spēle jau notiek / nav vietas).
    host.sent.length = 0;
    send(gateway, host, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 0 });
    expect(host.lastTyped("ERROR")).toBeDefined();
    expect(rooms.roomOf("host")).toBeUndefined();
  });
});
