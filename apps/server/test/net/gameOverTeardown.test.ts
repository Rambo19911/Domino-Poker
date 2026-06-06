import type { PlayerSnapshot } from "@domino-poker/core/multiplayer";
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
    createSessionId: () => "session-1",
    createReconnectToken: () => "token-1"
  });
  return { gateway, rooms };
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

/**
 * Izspēlē host (seat 0) vienu legālu gājienu, izmēģinot katru rokas kauliņu (un
 * vadot — katru pieļaujamo `declaredNumber`), līdz serveris kādu pieņem (bez
 * ERROR). Noteikumu loģika netiek dublēta — serveris paliek autoritatīvs.
 */
function playOneLegalMove(
  gateway: WebSocketGateway,
  host: FakeConnection,
  turnId: string,
  snapshot: PlayerSnapshot,
  nextRequestId: () => string
): boolean {
  for (const tile of snapshot.hand) {
    const declarations =
      tile.side1 === tile.side2 ? [undefined] : [undefined, tile.side1, tile.side2];
    for (const declaredNumber of declarations) {
      host.sent.length = 0;
      const move = declaredNumber === undefined ? { tile } : { tile, declaredNumber };
      send(gateway, host, {
        type: "SUBMIT_MOVE",
        requestId: nextRequestId(),
        roomId: "room-1",
        turnId,
        move
      });
      if (host.typed("ERROR").length === 0) return true;
    }
  }
  return false;
}

describe("game-over room teardown (C1)", () => {
  it("destroys the finished room and frees the host once the game reaches GAME_OVER", () => {
    const { gateway, rooms } = buildHarness();
    const host = connect(gateway, "c1", "host");
    send(gateway, host, { type: "CREATE_ROOM", numberOfRounds: 1 });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });

    let requestSeq = 0;
    const nextRequestId = (): string => `r${(requestSeq += 1)}`;
    let reachedGameOver = false;

    // Sinhronā režīmā (botPaceMs=0) pēc katra host gājiena boti nospēlē uzreiz,
    // tāpēc pēdējais snapshot vienmēr ir vai nu host turns, vai gameEnd.
    for (let step = 0; step < 5000 && !reachedGameOver; step += 1) {
      const snapshot = host.lastTyped("STATE_SNAPSHOT")?.snapshot;
      if (!snapshot) throw new Error("Expected a STATE_SNAPSHOT for the host.");
      if (snapshot.phase === "gameEnd") {
        reachedGameOver = true;
        break;
      }
      const turnId = snapshot.turnId;
      if (turnId === undefined) {
        throw new Error(`Expected an active turn while phase=${snapshot.phase}.`);
      }
      if (snapshot.phase === "bidding") {
        host.sent.length = 0;
        send(gateway, host, { type: "SUBMIT_BID", requestId: nextRequestId(), roomId: "room-1", turnId, bid: 0 });
        if (host.typed("ERROR").length > 0) {
          throw new Error("Host bid was rejected unexpectedly.");
        }
      } else if (snapshot.phase === "playing") {
        if (!playOneLegalMove(gateway, host, turnId, snapshot, nextRequestId)) {
          throw new Error("No legal move was accepted for the host.");
        }
      } else {
        throw new Error(`Unexpected phase ${snapshot.phase}.`);
      }
    }

    expect(reachedGameOver).toBe(true);
    // GAME_OVER tika piegādāts host PIRMS istabas iznīcināšanas.
    expect(host.typed("GAME_EVENT").some((entry) => entry.event.type === "GAME_OVER")).toBe(true);

    // C1: pabeigtā istaba iznīcināta, pazūd no saraksta, dalība un dzinējs atbrīvoti.
    expect(rooms.findRoom("room-1").status).toBe("DESTROYED");
    expect(rooms.listRooms().map((room) => room.id)).not.toContain("room-1");
    expect(rooms.roomOf("host")).toBeUndefined();
    expect(() => rooms.getSeq("room-1")).toThrow(); // dzinējs noņemts

    // Host vairs nav "iesprūdis" pabeigtajā istabā — drīkst izveidot jaunu.
    host.sent.length = 0;
    send(gateway, host, { type: "CREATE_ROOM" });
    expect(host.typed("ERROR")).toHaveLength(0);
    expect(host.lastTyped("ROOM_CREATED")).toBeDefined();
  });
});
