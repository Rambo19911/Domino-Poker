import type { ServerEvent } from "@domino-poker/shared";
import { describe, expect, it } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import { publishGameUpdate } from "../../src/net/gameUpdateDelivery.js";
import type { GatewayConnection } from "../../src/net/GatewayConnection.js";
import { CoreMessageRouter } from "../../src/net/messageRouter.js";
import { WebSocketGateway } from "../../src/net/WebSocketGateway.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";

/** Daudz-slotu manuālais timeris (katrs `create()` → neatkarīga schedulera instance). */
class MultiManualTimer {
  private current = 0;
  private idSeq = 0;
  private readonly pending: { fireAt: number; run: () => void; id: number }[] = [];

  readonly now = (): number => this.current;

  create(): { schedule: (fireAt: number, run: () => void) => void; cancel: () => void } {
    let myId: number | undefined;
    return {
      schedule: (fireAt, run) => {
        if (myId !== undefined) this.remove(myId);
        myId = (this.idSeq += 1);
        this.pending.push({ fireAt, run, id: myId });
      },
      cancel: () => {
        if (myId !== undefined) {
          this.remove(myId);
          myId = undefined;
        }
      }
    };
  }

  advanceTo(target: number): void {
    for (;;) {
      let idx = -1;
      for (let i = 0; i < this.pending.length; i += 1) {
        if (this.pending[i]!.fireAt <= target && (idx < 0 || this.pending[i]!.fireAt < this.pending[idx]!.fireAt)) {
          idx = i;
        }
      }
      if (idx < 0) break;
      const [timer] = this.pending.splice(idx, 1);
      this.current = timer!.fireAt;
      timer!.run();
    }
    if (target > this.current) this.current = target;
  }

  private remove(id: number): void {
    const index = this.pending.findIndex((entry) => entry.id === id);
    if (index >= 0) this.pending.splice(index, 1);
  }
}

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
}

function buildHarness() {
  const timer = new MultiManualTimer();
  const displayIds = new DisplayIdRegistry();
  let tokenSeq = 0;
  const forfeits: string[] = [];
  const abandons: string[] = [];
  const rooms = new RoomManager({
    clock: timer.now,
    displayIds,
    createRoomId: () => "room-1",
    createRoomCode: () => "CODE1",
    createSeed: () => "seed-fixed",
    createTurnScheduler: () => timer.create(),
    abandonGraceMs: 5_000, // grace < turn deadline (10001), lai pamešana izšaujas pirmā
    onPlayerForfeited: (_matchId, corePlayerId) => forfeits.push(corePlayerId),
    onRoomAbandoned: (matchId) => abandons.push(matchId)
  });
  const chat = new LobbyChat({ clock: timer.now });
  const gateway = new WebSocketGateway({
    clock: timer.now,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat }),
    createSessionId: () => "session",
    createReconnectToken: () => `token-${(tokenSeq += 1)}`
  });
  rooms.setGameUpdateSink((roomId, events) => publishGameUpdate(gateway, rooms, roomId, events, timer.now()));
  return { gateway, rooms, timer, forfeits, abandons };
}

function connect(gateway: WebSocketGateway, id: string, clientId: string, reconnectToken?: string): FakeConnection {
  const conn = new FakeConnection(id);
  gateway.open(conn);
  gateway.message(
    conn,
    JSON.stringify({
      type: "HELLO",
      protocolVersion: "1",
      clientBuild: "t",
      clientId,
      ...(reconnectToken !== undefined ? { reconnectToken } : {})
    })
  );
  return conn;
}

function send(gateway: WebSocketGateway, conn: FakeConnection, message: Record<string, unknown>): void {
  gateway.message(conn, JSON.stringify(message));
}

describe("Abandoned room destroy on last-human disconnect (9.3-b)", () => {
  it("destroys an in-game room after the grace period when all humans disconnect", () => {
    const { gateway, rooms, timer, abandons } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    gateway.close(host); // pēdējais (vienīgais) cilvēks atvienojas
    // Grace vēl nav beidzies → istaba pastāv.
    expect(rooms.listRooms().some((room) => room.id === "room-1")).toBe(true);

    timer.advanceTo(5_000); // grace beidzas
    // Neviens neatgriezās → istaba iznīcināta (arī no lobby saraksta).
    expect(rooms.listRooms().some((room) => room.id === "room-1")).toBe(false);
    expect(rooms.roomOf("host")).toBeUndefined();
    // Fāze 3 (5.6): abandon firē onRoomAbandoned (iznākumu reģistrēšanai pirms destroy).
    expect(abandons).toContain("room-1");
  });

  it("does not destroy the room if the player reconnects within the grace window", () => {
    const { gateway, rooms, timer } = buildHarness();
    const host = connect(gateway, "c1", "host"); // token-1
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    gateway.close(host);
    timer.advanceTo(2_000); // grace laikā
    connect(gateway, "c2", "host", "token-1"); // refresh/reconnect → atceļ grace

    timer.advanceTo(20_000); // pāri grace + turn deadline
    expect(rooms.findRoom("room-1").status).toBe("IN_GAME"); // istaba palika
    expect(rooms.roomOf("host")).toBe("room-1");
  });

  it("does not schedule destroy while another human is still online", () => {
    const { gateway, rooms, timer } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    gateway.close(host); // host atvienojas, BET guest paliek tiešsaistē
    timer.advanceTo(8_000); // pāri grace

    // Istaba turpinās (guest spēlē); netika ieplānota iznīcināšana.
    expect(rooms.findRoom("room-1").status).toBe("IN_GAME");
    expect(rooms.roomOf("guest")).toBe("room-1");
  });

  it("auto-forfeits a disconnected player's seat after grace while others keep playing (5.6)", () => {
    const { gateway, rooms, timer, forfeits } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    gateway.close(host); // host atvienojas, guest paliek tiešsaistē
    expect(rooms.getSeatedHumans("room-1").some((h) => h.clientId === "host")).toBe(true);

    timer.advanceTo(5_000); // grace beidzas → per-sēdvietas auto-forfeit

    // host sēdvieta forfeitēta (kļuva par botu), guest turpina; istaba IN_GAME.
    expect(forfeits).toContain("1"); // host = sēdvieta 0 → corePlayerId "1" → lose
    expect(rooms.getSeatedHumans("room-1").some((h) => h.clientId === "host")).toBe(false);
    expect(rooms.findRoom("room-1").status).toBe("IN_GAME");
    expect(rooms.roomOf("guest")).toBe("room-1");
  });

  it("does NOT auto-forfeit if the disconnected player reconnects within grace (5.6)", () => {
    const { gateway, rooms, timer, forfeits } = buildHarness();
    const host = connect(gateway, "c1", "host"); // token-1
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    gateway.close(host);
    timer.advanceTo(2_000); // grace laikā
    connect(gateway, "c3", "host", "token-1"); // reconnect → atceļ auto-forfeit

    timer.advanceTo(8_000); // pāri sākotnējam grace
    expect(forfeits).not.toContain("1"); // NEtika forfeitēts
    expect(rooms.getSeatedHumans("room-1").some((h) => h.clientId === "host")).toBe(true);
  });

  it("destroys the room when the last ONLINE human exits while another human is disconnected", () => {
    const { gateway, rooms, timer } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    const guest = connect(gateway, "c2", "guest");
    send(gateway, guest, { type: "JOIN_ROOM", roomId: "room-1", seatIndex: 1 });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    // guest aizver tabu (atvienojas), host vēl tiešsaistē → grace vēl nav.
    gateway.close(guest);
    expect(rooms.listRooms().some((room) => room.id === "room-1")).toBe(true);

    // host nospiež Exit (forfeit) — tagad NEVIENS tiešsaistes cilvēks nepaliek.
    // forfeitSeat istabu neiznīcina (atvienotais guest joprojām "human" sēdvieta),
    // bet tagad jābūt ieplānotai pamešanas grace.
    send(gateway, host, { type: "LEAVE_ROOM" });
    expect(rooms.roomOf("host")).toBeUndefined(); // forfeit notīra host dalību
    expect(rooms.listRooms().some((room) => room.id === "room-1")).toBe(true);

    timer.advanceTo(5_000); // grace beidzas
    // Neviens neatgriezās → istaba iznīcināta (arī no lobby saraksta).
    expect(rooms.listRooms().some((room) => room.id === "room-1")).toBe(false);
    expect(rooms.roomOf("guest")).toBeUndefined();
  });
});
