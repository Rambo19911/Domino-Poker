import { describe, expect, it } from "vitest";

import { LobbyError } from "../../src/rooms/lobbyErrors.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";
import { ManualTimerController } from "../../src/timers/ManualTimerController.js";

function createManager(initialNow = 1_000): {
  readonly manager: RoomManager;
  readonly timer: ManualTimerController;
} {
  const timer = new ManualTimerController(initialNow);
  let roomSeq = 0;
  let codeSeq = 0;
  let seedSeq = 0;
  const manager = new RoomManager({
    clock: timer.now,
    createRoomId: () => `room-${(roomSeq += 1)}`,
    createRoomCode: () => `code${(codeSeq += 1)}`,
    createSeed: () => `seed-${(seedSeq += 1)}`
  });
  return { manager, timer };
}

function expectLobbyError(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error(`Expected LobbyError ${code}, but nothing was thrown.`);
  } catch (error) {
    expect(error).toBeInstanceOf(LobbyError);
    expect((error as LobbyError).code).toBe(code);
  }
}

/** Aizved istabu līdz IN_GAME: host izveido, aizpilda ar botiem, sāk spēli. */
function startedRoom(manager: RoomManager, hostClientId: string): string {
  const room = manager.createRoom(hostClientId);
  manager.fillSeatsWithBots(hostClientId);
  manager.startGame(hostClientId);
  return room.id;
}

describe("RoomManager membership (one room at a time)", () => {
  it("tracks the creator's room and rejects a second room/join with ALREADY_IN_ROOM", () => {
    const { manager } = createManager();
    const room = manager.createRoom("c1");
    expect(manager.roomOf("c1")).toBe(room.id);

    expectLobbyError(() => manager.createRoom("c1"), "ALREADY_IN_ROOM");
    const other = manager.createRoom("c2");
    expectLobbyError(() => manager.joinRoom("c1", { roomId: other.id, seatIndex: 1 }), "ALREADY_IN_ROOM");
  });

  it("allows joining again after leaving", () => {
    const { manager } = createManager();
    const host = manager.createRoom("host");
    manager.joinRoom("c2", { roomId: host.id, seatIndex: 1 });
    expect(manager.roomOf("c2")).toBe(host.id);

    manager.leaveRoom("c2");
    expect(manager.roomOf("c2")).toBeUndefined();

    const rejoined = manager.joinRoom("c2", { roomId: host.id, seatIndex: 1 });
    expect(rejoined.id).toBe(host.id);
  });

  it("rejects leaving when not in any room", () => {
    const { manager } = createManager();
    expectLobbyError(() => manager.leaveRoom("ghost"), "PLAYER_NOT_IN_ROOM");
  });
});

describe("RoomManager join targets", () => {
  it("joins a public room by id but requires a code for private rooms", () => {
    const { manager } = createManager();
    const priv = manager.createRoom("host", { visibility: "private" });

    expect(manager.viewRoom({ code: priv.code }).id).toBe(priv.id);
    expectLobbyError(() => manager.joinRoom("c2", { roomId: priv.id, seatIndex: 1 }), "FORBIDDEN");
    const joined = manager.joinRoom("c2", { code: priv.code, seatIndex: 1 });
    expect(joined.id).toBe(priv.id);
  });

  it("rejects an unknown room id or code", () => {
    const { manager } = createManager();
    expectLobbyError(() => manager.joinRoom("c1", { roomId: "nope", seatIndex: 1 }), "ROOM_NOT_FOUND");
    expectLobbyError(() => manager.joinRoom("c1", { code: "ZZZZZZ", seatIndex: 1 }), "ROOM_NOT_FOUND");
  });
});

describe("RoomManager game routing and isolation", () => {
  it("creates an engine on start and routes commands to it", () => {
    const { manager } = createManager();
    const roomId = startedRoom(manager, "host");
    expect(manager.findRoom(roomId).status).toBe("IN_GAME");

    const result = manager.routeMessageToRoomEngine(roomId, {
      type: "START_TURN",
      gameId: roomId,
      requestId: "req-start",
      turnId: "t1",
      now: 0
    });
    expect(result.accepted).toBe(true);
  });

  it("passes room numberOfRounds to the multiplayer engine", () => {
    const { manager } = createManager();
    const room = manager.createRoom("host", { numberOfRounds: 3 });
    manager.fillSeatsWithBots("host");
    manager.startGame("host");

    const snapshot = manager.getSnapshotForClient(room.id, "host");
    expect(snapshot.totalRounds).toBe(3);
  });

  it("rejects routing to a room without an active game", () => {
    const { manager } = createManager();
    const room = manager.createRoom("host"); // WAITING, no engine yet
    expectLobbyError(
      () =>
        manager.routeMessageToRoomEngine(room.id, {
          type: "START_TURN",
          gameId: room.id,
          requestId: "r",
          turnId: "t1",
          now: 0
        }),
      "ROOM_NOT_FOUND"
    );
  });

  it("never lets a command for one room change another room's state", () => {
    const { manager } = createManager();
    const roomA = startedRoom(manager, "hostA");
    const roomB = startedRoom(manager, "hostB");

    // Komanda B, maršrutēta caur A → noraidīta (gameId nesakrīt ar roomId).
    expectLobbyError(
      () =>
        manager.routeMessageToRoomEngine(roomA, {
          type: "START_TURN",
          gameId: roomB,
          requestId: "cross",
          turnId: "t1",
          now: 0
        }),
      "FORBIDDEN"
    );

    // B paliek neskarta: tās pašas istabas korekta komanda joprojām pieņemta no seq 0.
    const okB = manager.routeMessageToRoomEngine(roomB, {
      type: "START_TURN",
      gameId: roomB,
      requestId: "b-start",
      turnId: "t1",
      now: 0
    });
    expect(okB.accepted).toBe(true);
    expect(okB.events[0]?.seq).toBe(1);
  });
});

describe("RoomManager reconnect snapshot", () => {
  it("returns a personalized snapshot for a member and rejects non-members", () => {
    const { manager } = createManager();
    const roomId = startedRoom(manager, "host");

    const snapshot = manager.getSnapshotForClient(roomId, "host");
    expect(snapshot.viewerPlayerId).toBe("1"); // host sēž pie 0 → core spēlētājs "1"
    expect(snapshot.hand.length).toBe(7);

    expectLobbyError(() => manager.getSnapshotForClient(roomId, "stranger"), "FORBIDDEN");
  });
});

describe("RoomManager multi-human start", () => {
  it("maps lobby human/bot seats onto the engine players", () => {
    const { manager } = createManager();
    const room = manager.createRoom("host"); // host pie sēdvietas 0
    manager.joinRoom("guest", { roomId: room.id, seatIndex: 1 }); // cilvēks pie sēdvietas 1
    manager.fillSeatsWithBots("host"); // sēdvietas 2,3 → boti
    manager.startGame("host");

    // Abi cilvēki redz savu roku; viņu sēdvietas nav boti.
    const hostView = manager.getSnapshotForClient(room.id, "host");
    const guestView = manager.getSnapshotForClient(room.id, "guest");
    expect(hostView.viewerPlayerId).toBe("1");
    expect(guestView.viewerPlayerId).toBe("2");
    expect(hostView.hand.length).toBe(7);
    expect(guestView.hand.length).toBe(7);

    // Spēlētāju lomas dzinējā atspoguļo lobby sēdvietas (0,1 cilvēki; 2,3 boti).
    expect(hostView.players.map((player) => player.isAI)).toEqual([false, false, true, true]);
    expect(hostView.players.map((player) => player.status)).toEqual([
      "active",
      "active",
      "bot",
      "bot"
    ]);
  });
});

describe("RoomManager destroyFinishedRoom", () => {
  it("finishes and destroys a room, removing it from the list and clearing membership", () => {
    const { manager } = createManager();
    const roomId = startedRoom(manager, "host");

    manager.destroyFinishedRoom(roomId);
    expect(manager.findRoom(roomId).status).toBe("DESTROYED");
    expect(manager.listRooms().map((room) => room.id)).not.toContain(roomId);
    expect(manager.roomOf("host")).toBeUndefined();

    // Pēc iznīcināšanas host atkal drīkst izveidot istabu.
    expect(() => manager.createRoom("host")).not.toThrow();
  });
});

describe("RoomManager destroyExpiredRooms (TTL sweep)", () => {
  it("destroys rooms past their TTL, removes them from the list, and frees membership", () => {
    const timer = new ManualTimerController(1_000);
    let roomSeq = 0;
    const manager = new RoomManager({
      clock: timer.now,
      ttlMs: 60_000,
      createRoomId: () => `room-${(roomSeq += 1)}`,
      createRoomCode: () => `code${roomSeq}`,
      createSeed: () => `seed-${roomSeq}`
    });
    const room = manager.createRoom("host");
    expect(manager.listRooms().map((r) => r.id)).toContain(room.id);

    timer.set(1_000 + 60_000 + 1); // past expiresAt
    const destroyed = manager.destroyExpiredRooms(timer.now());

    expect(destroyed.roomIds).toContain(room.id);
    expect(manager.listRooms().map((r) => r.id)).not.toContain(room.id);
    // Host vairs nav "iesprūdis" iznīcinātajā istabā — drīkst izveidot jaunu.
    expect(manager.roomOf("host")).toBeUndefined();
    expect(() => manager.createRoom("host")).not.toThrow();
  });

  it("returns empty (no broadcast) when nothing has expired yet", () => {
    const { manager } = createManager();
    manager.createRoom("host");
    expect(manager.destroyExpiredRooms(2_000)).toEqual({ roomIds: [], refunds: [] });
  });
});

describe("RoomManager seat rank badge (getRoomView)", () => {
  it("enriches a human seat with the resolved badge, computed fresh per view", () => {
    const { manager } = createManager();
    const room = manager.createRoom("host"); // host = human seat 0
    manager.setSeatProfileResolver(() => ({ username: "Host", avatar: "avatar-03", title: "mushroom" }));

    let badge: "rank_1" | undefined = "rank_1";
    manager.setRankBadgeResolver((clientId) => (clientId === "host" ? badge : undefined));

    expect(manager.getRoomView(room.id).seats[0]).toMatchObject({
      displayId: "Host",
      avatar: "avatar-03",
      title: "mushroom",
      rankBadge: "rank_1"
    });

    // Volatile rank: a later view reflects the CURRENT badge (not a HELLO-time snapshot).
    badge = undefined;
    expect(manager.getRoomView(room.id).seats[0]).not.toHaveProperty("rankBadge");
  });

  it("omits rankBadge when no resolver is set (additive, no undefined property)", () => {
    const { manager } = createManager();
    const room = manager.createRoom("host");
    manager.setSeatProfileResolver(() => ({ username: "Host", avatar: "avatar-03", title: "mushroom" }));
    // No rank badge resolver wired.
    expect(manager.getRoomView(room.id).seats[0]).not.toHaveProperty("rankBadge");
  });
});
