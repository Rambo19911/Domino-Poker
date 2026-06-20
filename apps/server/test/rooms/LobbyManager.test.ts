import { describe, expect, it } from "vitest";

import { LobbyManager, SEAT_COUNT } from "../../src/rooms/LobbyManager.js";
import { LobbyError } from "../../src/rooms/lobbyErrors.js";
import { ManualTimerController } from "../../src/timers/ManualTimerController.js";

const HOUR_MS = 60 * 60 * 1000;

function createLobby(initialNow = 1_000): {
  readonly lobby: LobbyManager;
  readonly timer: ManualTimerController;
} {
  const timer = new ManualTimerController(initialNow);
  let roomSeq = 0;
  let codeSeq = 0;
  const lobby = new LobbyManager({
    clock: timer.now,
    createRoomId: () => `room-${(roomSeq += 1)}`,
    createRoomCode: () => `code${(codeSeq += 1)}`
  });
  return { lobby, timer };
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

describe("LobbyManager createRoom", () => {
  it("seats the creator as the host at seat 0 with a 1h TTL", () => {
    const { lobby } = createLobby(5_000);
    const room = lobby.createRoom({ hostPlayerId: "h1" });

    expect(room.status).toBe("WAITING");
    expect(room.hostPlayerId).toBe("h1");
    expect(room.code).toBe("CODE1");
    expect(room.seats).toHaveLength(SEAT_COUNT);
    expect(room.seats[0]?.kind).toBe("human");
    expect(room.seats[0]?.playerId).toBe("h1");
    expect(room.seats.slice(1).every((seat) => seat.kind === "empty")).toBe(true);
    expect(room.createdAt).toBe(5_000);
    expect(room.expiresAt).toBe(5_000 + HOUR_MS);
  });

  it("defaults to public visibility and supports private rooms", () => {
    const { lobby } = createLobby();
    expect(lobby.createRoom({ hostPlayerId: "h1" }).visibility).toBe("public");
    expect(lobby.createRoom({ hostPlayerId: "h2", visibility: "private" }).visibility).toBe(
      "private"
    );
  });

  it("stores numberOfRounds in internal and public room views", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1", numberOfRounds: 12 });

    expect(room.numberOfRounds).toBe(12);
    expect(lobby.getRoomView(room.id).numberOfRounds).toBe(12);
    expect(lobby.listRooms()[0]?.numberOfRounds).toBe(12);
  });
});

describe("LobbyManager listRooms visibility", () => {
  it("lists WAITING and IN_GAME rooms but hides FINISHED/DESTROYED", () => {
    const { lobby } = createLobby();
    const waiting = lobby.createRoom({ hostPlayerId: "h1" });
    const playing = lobby.createRoom({ hostPlayerId: "h2" });
    const finished = lobby.createRoom({ hostPlayerId: "h3" });

    lobby.fillSeatsWithBots(playing.id, "h2");
    lobby.startGame(playing.id, "h2");
    lobby.markInGame(playing.id);

    lobby.fillSeatsWithBots(finished.id, "h3");
    lobby.startGame(finished.id, "h3");
    lobby.markInGame(finished.id);
    lobby.markFinished(finished.id);
    lobby.destroyRoom(finished.id);

    const ids = lobby.listRooms().map((room) => room.id);
    expect(ids).toContain(waiting.id);
    expect(ids).toContain(playing.id);
    expect(ids).not.toContain(finished.id);
  });

  it("includes private rooms in the list with an isPrivate flag", () => {
    const { lobby } = createLobby();
    const priv = lobby.createRoom({ hostPlayerId: "h1", visibility: "private" });
    const summary = lobby.listRooms().find((room) => room.id === priv.id);
    expect(summary?.isPrivate).toBe(true);
  });

  it("does not expose room codes in public room summaries", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1", visibility: "private" });

    expect(lobby.listRooms().find((summary) => summary.id === room.id)?.code).toBe("");
    expect(lobby.getRoomView(room.id).code).toBe(room.code);
  });
});

describe("LobbyManager seating", () => {
  it("assigns humans to the next empty seat and rejects a full room", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1" });
    lobby.assignSeat(room.id, "h2");
    lobby.assignSeat(room.id, "h3");
    const full = lobby.assignSeat(room.id, "h4");
    expect(full.seats.map((seat) => seat.kind)).toEqual(["human", "human", "human", "human"]);

    expectLobbyError(() => lobby.assignSeat(room.id, "h5"), "ROOM_FULL");
  });

  it("assigns humans to a requested empty seat and rejects occupied seats", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1" });

    const updated = lobby.assignSeat(room.id, "h3", 2);
    expect(updated.seats[2]?.playerId).toBe("h3");
    expectLobbyError(() => lobby.assignSeat(room.id, "h2", 2), "ROOM_FULL");
  });

  it("rejects a player joining the same room twice", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1" });
    expectLobbyError(() => lobby.assignSeat(room.id, "h1"), "ALREADY_IN_ROOM");
  });

  it("rejects joining an unknown room", () => {
    const { lobby } = createLobby();
    expectLobbyError(() => lobby.assignSeat("nope", "h1"), "ROOM_NOT_FOUND");
  });
});

describe("LobbyManager bots and host actions", () => {
  it("fills empty seats with deterministic bots producing a full 4-player room", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1" });
    const filled = lobby.fillSeatsWithBots(room.id, "h1");

    expect(filled.seats.map((seat) => seat.kind)).toEqual(["human", "bot", "bot", "bot"]);
    expect(filled.seats[1]?.playerId).toBe(`bot:${room.id}:1`);
    expect(lobby.canStartGame(room.id)).toBe(true);
  });

  it("only lets the host fill seats and start", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1" });
    lobby.assignSeat(room.id, "h2");

    expectLobbyError(() => lobby.fillSeatsWithBots(room.id, "h2"), "NOT_HOST");
    expectLobbyError(() => lobby.startGame(room.id, "h2"), "NOT_HOST");
  });

  it("requires a full table with at least one human to start", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1" });

    expect(lobby.canStartGame(room.id)).toBe(false);
    expectLobbyError(() => lobby.startGame(room.id, "h1"), "NOT_ENOUGH_PLAYERS");

    lobby.fillSeatsWithBots(room.id, "h1");
    expect(lobby.startGame(room.id, "h1").status).toBe("STARTING");
  });

  it("blocks joining and bot-fill once the game has started", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1" });
    lobby.fillSeatsWithBots(room.id, "h1");
    lobby.startGame(room.id, "h1");

    expectLobbyError(() => lobby.assignSeat(room.id, "h2"), "GAME_ALREADY_STARTED");
    expectLobbyError(() => lobby.fillSeatsWithBots(room.id, "h1"), "GAME_ALREADY_STARTED");
  });
});

describe("LobbyManager host migration and lifecycle", () => {
  it("migrates host to the next human by seat index when the host leaves", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1" });
    lobby.assignSeat(room.id, "h2");
    lobby.assignSeat(room.id, "h3");

    const afterLeave = lobby.leaveRoom(room.id, "h1");
    expect(afterLeave.status).toBe("WAITING");
    expect(afterLeave.hostPlayerId).toBe("h2");
    expect(afterLeave.seats[0]?.kind).toBe("empty");
  });

  it("destroys the room when no humans remain (bots do not keep it alive)", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1" });
    lobby.fillSeatsWithBots(room.id, "h1");

    const afterLeave = lobby.leaveRoom(room.id, "h1");
    expect(afterLeave.status).toBe("DESTROYED");
    expect(afterLeave.hostPlayerId).toBeUndefined();
    expect(lobby.listRooms().map((r) => r.id)).not.toContain(room.id);
  });
});

describe("LobbyManager TTL and identity", () => {
  it("destroys non-IN_GAME rooms past their TTL but keeps IN_GAME ones", () => {
    const { lobby } = createLobby(0);
    const waiting = lobby.createRoom({ hostPlayerId: "h1" });
    const playing = lobby.createRoom({ hostPlayerId: "h2" });
    lobby.fillSeatsWithBots(playing.id, "h2");
    lobby.startGame(playing.id, "h2");
    lobby.markInGame(playing.id);

    const destroyed = lobby.destroyExpired(HOUR_MS + 1);
    expect(destroyed).toContain(waiting.id);
    expect(destroyed).not.toContain(playing.id);
    expect(lobby.getRoom(playing.id).status).toBe("IN_GAME");
  });

  it("prunes DESTROYED tombstones (and their codes) on a later sweep so ids/codes free up (M5)", () => {
    let now = 1_000;
    const ttlMs = 1_000;
    // Fiksēts id/code: ja tombstone netiek iztīrīts, atkārtota izveide nevar
    // saģenerēt unikālu id/code un mestu kļūdu.
    const lobby = new LobbyManager({
      clock: () => now,
      ttlMs,
      createRoomId: () => "room-1",
      createRoomCode: () => "CODE1"
    });

    expect(lobby.createRoom({ hostPlayerId: "h1" }).id).toBe("room-1");
    now = 1_000 + ttlMs + 1;

    lobby.destroyExpired(now); // sweep #1: room-1 → DESTROYED (tombstone, code vēl aizņemts)
    expect(lobby.getRoom("room-1").status).toBe("DESTROYED"); // vēl pieprasāms
    expect(() => lobby.createRoom({ hostPlayerId: "h2" })).toThrow(); // id/code vēl aizņemts

    lobby.destroyExpired(now); // sweep #2: tombstone + code iztīrīti
    expect(() => lobby.getRoom("room-1")).toThrow(); // izņemts no kartes
    expect(lobby.createRoom({ hostPlayerId: "h3" }).id).toBe("room-1"); // id/code atbrīvots
  });

  it("uses server displayId for seat names and never exposes playerId in views", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "secret-player-1" });
    const view = lobby.getRoomView(room.id);

    expect(view.seats[0]?.displayId).toMatch(/^#\d{5}$/);
    expect(view.seats[0]?.isHost).toBe(true);
    for (const seat of view.seats) {
      expect(seat).not.toHaveProperty("playerId");
    }
    for (const summary of lobby.listRooms()) {
      expect(summary).not.toHaveProperty("playerId");
    }
  });
});

describe("LobbyManager paid rooms (Phase 3: entryFee / pot / entry)", () => {
  it("defaults to a free room (entryFee 0, pot 0) and exposes them in views", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({ hostPlayerId: "h1" });
    expect(room.entryFee).toBe(0);
    expect(room.pot).toBe(0);
    expect(lobby.getRoomView(room.id).entryFee).toBe(0);
    expect(lobby.getRoomView(room.id).pot).toBe(0);
  });

  it("creates a paid room with the host's seat entry and pot seeded by one fee", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({
      hostPlayerId: "h1",
      entryFee: 100,
      hostEntry: { entryId: "e-host", payerUserId: "u-host" }
    });
    expect(room.entryFee).toBe(100);
    expect(room.pot).toBe(100); // hosts maksā (D6)
    expect(room.seats[0]?.entry).toEqual({ entryId: "e-host", payerUserId: "u-host" });
  });

  it("rejects a paid room created without the host's paid entry", () => {
    const { lobby } = createLobby();
    expectLobbyError(() => lobby.createRoom({ hostPlayerId: "h1", entryFee: 100 }), "FORBIDDEN");
  });

  it("rejects an invalid (non-integer / negative) entry fee", () => {
    const { lobby } = createLobby();
    expectLobbyError(
      () => lobby.createRoom({ hostPlayerId: "h1", entryFee: 1.5, hostEntry: { entryId: "e", payerUserId: "u" } }),
      "FORBIDDEN"
    );
    expectLobbyError(
      () => lobby.createRoom({ hostPlayerId: "h1", entryFee: -5, hostEntry: { entryId: "e", payerUserId: "u" } }),
      "FORBIDDEN"
    );
  });

  it("bumps the pot when a paying human takes a seat", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({
      hostPlayerId: "h1",
      entryFee: 100,
      hostEntry: { entryId: "e-host", payerUserId: "u-host" }
    });
    const updated = lobby.assignSeat(room.id, "p2", 1, { entryId: "e2", payerUserId: "u2" });
    expect(updated.pot).toBe(200);
    expect(updated.seats[1]?.entry).toEqual({ entryId: "e2", payerUserId: "u2" });
  });

  it("returns a leaver's fee to the pot (WAITING) and clears their seat entry", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({
      hostPlayerId: "h1",
      entryFee: 100,
      hostEntry: { entryId: "e-host", payerUserId: "u-host" }
    });
    lobby.assignSeat(room.id, "p2", 1, { entryId: "e2", payerUserId: "u2" });
    const afterLeave = lobby.leaveRoom(room.id, "p2");
    expect(afterLeave.pot).toBe(100); // p2 maksa atgriezta podā
    expect(afterLeave.seats[1]?.entry).toBeUndefined();
  });

  it("keeps the pot intact when a paid seat forfeits in-game (fees stay in pot, D5)", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({
      hostPlayerId: "h1",
      entryFee: 100,
      hostEntry: { entryId: "e-host", payerUserId: "u-host" }
    });
    lobby.assignSeat(room.id, "p2", 1, { entryId: "e2", payerUserId: "u2" });
    lobby.fillSeatsWithBots(room.id, "h1"); // sēdvietas 2,3 = boti (nemaksā)
    lobby.startGame(room.id, "h1");
    lobby.markInGame(room.id);
    const afterForfeit = lobby.forfeitSeat(room.id, "p2");
    expect(afterForfeit.pot).toBe(200); // p2 maksa PALIEK podā
    expect(afterForfeit.seats[1]?.kind).toBe("bot");
  });

  it("does not collect a fee or entry for bot seats", () => {
    const { lobby } = createLobby();
    const room = lobby.createRoom({
      hostPlayerId: "h1",
      entryFee: 100,
      hostEntry: { entryId: "e-host", payerUserId: "u-host" }
    });
    const filled = lobby.fillSeatsWithBots(room.id, "h1");
    expect(filled.pot).toBe(100); // tikai hosta maksa
    for (let i = 1; i < SEAT_COUNT; i += 1) {
      expect(filled.seats[i]?.entry).toBeUndefined();
    }
  });
});
