import type { MultiplayerEvent } from "@domino-poker/core/multiplayer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { GameDirector } from "../../src/rooms/GameDirector.js";
import { RoomEngine } from "../../src/rooms/RoomEngine.js";
import type {
  MatchEventRecord,
  MatchFinishedRecord,
  MatchStartedRecord,
  StoragePort
} from "../../src/storage/StoragePort.js";
import { MatchPersistence } from "../../src/storage/MatchPersistence.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { noopTurnTimerScheduler } from "../../src/timers/TurnTimerScheduler.js";

/** Minimāls StoragePort, kas reģistrē izsaukumus (pārējais nav vajadzīgs šiem testiem). */
class RecordingStorage implements StoragePort {
  readonly started: MatchStartedRecord[] = [];
  readonly events: Array<{ matchId: string; event: MatchEventRecord }> = [];
  readonly finished: MatchFinishedRecord[] = [];

  async saveMatchStarted(match: MatchStartedRecord): Promise<void> {
    this.started.push(match);
  }
  async appendMatchEvent(matchId: string, event: MatchEventRecord): Promise<void> {
    this.events.push({ matchId, event });
  }
  async saveMatchFinished(result: MatchFinishedRecord): Promise<void> {
    this.finished.push(result);
  }
  async loadUnfinishedMatch(): Promise<undefined> {
    return undefined;
  }
  async listRecentMatches(): Promise<[]> {
    return [];
  }
  async savePlayerStats(): Promise<void> {}
  async incrementPlayerStats(): Promise<void> {}
  async getPlayerStats(): Promise<undefined> {
    return undefined;
  }
  async appendChatMessage(): Promise<void> {}
  async loadRecentChatMessages(): Promise<[]> {
    return [];
  }
  async close(): Promise<void> {}
}

function gameOver(gameId: string, winnerPlayerId?: string): MultiplayerEvent {
  return { type: "GAME_OVER", gameId, eventSeq: 9, ...(winnerPlayerId ? { winnerPlayerId } : {}) };
}

describe("MatchPersistence coordinator", () => {
  it("saves a started match", () => {
    const storage = new RecordingStorage();
    const persistence = new MatchPersistence({ storage, clock: () => 5000 });

    const record: MatchStartedRecord = {
      matchId: "room-1",
      seed: "seed-1",
      numberOfRounds: 7,
      players: [{ seatIndex: 0, corePlayerId: "1", kind: "human" }],
      startedAt: 1000
    };
    persistence.matchStarted(record);

    expect(storage.started).toEqual([record]);
  });

  it("appends each event by its gameId and seq", () => {
    const storage = new RecordingStorage();
    const persistence = new MatchPersistence({ storage, clock: () => 5000 });

    persistence.events([
      { seq: 1, event: { type: "TURN_STARTED", gameId: "room-1", eventSeq: 1, turn: {} as never } },
      { seq: 2, event: gameOver("room-1", "1") }
    ]);

    expect(storage.events.map((entry) => entry.event.seq)).toEqual([1, 2]);
    expect(storage.events.every((entry) => entry.matchId === "room-1")).toBe(true);
  });

  it("records the match result on GAME_OVER with the server clock", () => {
    const storage = new RecordingStorage();
    const persistence = new MatchPersistence({ storage, clock: () => 8888 });

    persistence.events([{ seq: 5, event: gameOver("room-9", "2") }]);

    expect(storage.finished).toEqual([
      { matchId: "room-9", winnerPlayerId: "2", finishedAt: 8888 }
    ]);
  });

  it("records a result without a winner (draw / abandoned)", () => {
    const storage = new RecordingStorage();
    const persistence = new MatchPersistence({ storage, clock: () => 1 });

    persistence.events([{ seq: 5, event: gameOver("room-x") }]);

    expect(storage.finished[0]).toEqual({ matchId: "room-x", finishedAt: 1 });
    expect(storage.finished[0]).not.toHaveProperty("winnerPlayerId");
  });

  it("never throws when storage rejects (fire-and-forget, logged)", async () => {
    const onError = vi.fn();
    const failing = new RecordingStorage();
    // Aizēnojam vienu metodi ar noraidītu solījumu (instances īpašība pār prototipu).
    failing.saveMatchStarted = () => Promise.reject(new Error("db down"));
    const persistence = new MatchPersistence({ storage: failing, clock: () => 1, onError });

    expect(() =>
      persistence.matchStarted({
        matchId: "r",
        seed: "s",
        numberOfRounds: 1,
        players: [],
        startedAt: 0
      })
    ).not.toThrow();

    await new Promise((resolve) => setImmediate(resolve));
    expect(onError).toHaveBeenCalledWith("saveMatchStarted", expect.any(Error));
  });
});

describe("MatchPersistence player stats (10.3)", () => {
  let storage: SqliteStorage;

  afterEach(async () => {
    await storage.close();
  });

  it("increments gamesPlayed for humans and gamesWon for the winner; skips bots and id-less seats", async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    const persistence = new MatchPersistence({ storage, clock: () => 1000 });

    persistence.matchStarted({
      matchId: "g1",
      seed: "s",
      numberOfRounds: 7,
      players: [
        { seatIndex: 0, corePlayerId: "1", kind: "human", clientId: "client-winner", displayId: "#winner" },
        { seatIndex: 1, corePlayerId: "2", kind: "human", clientId: "client-loser", displayId: "#loser" },
        { seatIndex: 2, corePlayerId: "3", kind: "bot" },
        { seatIndex: 3, corePlayerId: "4", kind: "human" } // bez clientId → izlaists
      ],
      startedAt: 0
    });
    persistence.events([{ seq: 1, event: gameOver("g1", "1") }]);
    await new Promise((resolve) => setImmediate(resolve));

    // Statistika keyota pēc stabilā clientId, NE pēc reciklējamā displayId (F5).
    expect(await storage.getPlayerStats("client-winner")).toMatchObject({ gamesPlayed: 1, gamesWon: 1 });
    expect(await storage.getPlayerStats("client-loser")).toMatchObject({ gamesPlayed: 1, gamesWon: 0 });
    expect(await storage.getPlayerStats("#winner")).toBeUndefined(); // displayId nav atslēga
  });

  it("accumulates stats across multiple finished matches for the same player", async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    const persistence = new MatchPersistence({ storage, clock: () => 2000 });

    for (const matchId of ["g1", "g2"]) {
      persistence.matchStarted({
        matchId,
        seed: "s",
        numberOfRounds: 7,
        players: [{ seatIndex: 0, corePlayerId: "1", kind: "human", clientId: "client-p", displayId: "#p" }],
        startedAt: 0
      });
      persistence.events([{ seq: 1, event: gameOver(matchId, "1") }]);
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(await storage.getPlayerStats("client-p")).toMatchObject({ gamesPlayed: 2, gamesWon: 2 });
  });

  it("keys stats by stable clientId, not the recyclable displayId (F5)", async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    const persistence = new MatchPersistence({ storage, clock: () => 3000 });

    // Divi DAŽĀDI cilvēki (atšķirīgs clientId) secīgi saņem TO PAŠU reciklēto displayId.
    persistence.matchStarted({
      matchId: "g1",
      seed: "s",
      numberOfRounds: 7,
      players: [{ seatIndex: 0, corePlayerId: "1", kind: "human", clientId: "client-A", displayId: "#0421" }],
      startedAt: 0
    });
    persistence.events([{ seq: 1, event: gameOver("g1", "1") }]);
    await new Promise((resolve) => setImmediate(resolve));

    persistence.matchStarted({
      matchId: "g2",
      seed: "s",
      numberOfRounds: 7,
      players: [{ seatIndex: 0, corePlayerId: "1", kind: "human", clientId: "client-B", displayId: "#0421" }],
      startedAt: 0
    });
    persistence.events([{ seq: 1, event: gameOver("g2", "1") }]);
    await new Promise((resolve) => setImmediate(resolve));

    // Statistika paliek ATSEVIŠĶA katram clientId, neskatoties uz koplietoto displayId.
    expect(await storage.getPlayerStats("client-A")).toMatchObject({ gamesPlayed: 1, gamesWon: 1 });
    expect(await storage.getPlayerStats("client-B")).toMatchObject({ gamesPlayed: 1, gamesWon: 1 });
    // displayId NAV atslēga — citādi tas kļūdaini saskaitītu abus cilvēkus vienā rindā.
    expect(await storage.getPlayerStats("#0421")).toBeUndefined();
  });
});

describe("MatchPersistence end-to-end with SqliteStorage (all-bot game)", () => {
  let storage: SqliteStorage;

  afterEach(async () => {
    await storage.close();
  });

  it("persists the full event log and a finished result for a completed game", async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    const persistence = new MatchPersistence({ storage, clock: () => 4242 });

    persistence.matchStarted({
      matchId: "g1",
      seed: "seed-1",
      numberOfRounds: 7,
      players: [
        { seatIndex: 0, corePlayerId: "1", kind: "bot" },
        { seatIndex: 1, corePlayerId: "2", kind: "bot" },
        { seatIndex: 2, corePlayerId: "3", kind: "bot" },
        { seatIndex: 3, corePlayerId: "4", kind: "bot" }
      ],
      startedAt: 1000
    });

    const engine = new RoomEngine({
      clock: () => 1000,
      scheduler: noopTurnTimerScheduler,
      onEventsAppended: (events) => persistence.events(events)
    });
    engine.dispatch({
      type: "CREATE_GAME",
      gameId: "g1",
      requestId: "create",
      seed: "seed-1",
      humanSeatIndices: []
    });
    const result = new GameDirector({ engine, gameId: "g1" }).advance();
    expect(result.awaitingHuman).toBe(false);

    // node:sqlite ir sinhrons, bet fire-and-forget .catch() rinda mikrouzdevumos.
    await new Promise((resolve) => setImmediate(resolve));

    // CREATE_GAME nav match-event (nav gameId-nesošs MultiplayerEvent), bet visi
    // pārējie (TURN_STARTED..GAME_OVER) ir žurnālā. Partija pabeigta → noslēpta no
    // loadUnfinishedMatch, bet redzama sarakstā ar rezultātu.
    expect(await storage.loadUnfinishedMatch("g1")).toBeUndefined();

    const [summary] = await storage.listRecentMatches(10);
    expect(summary?.matchId).toBe("g1");
    expect(summary?.finishedAt).toBe(4242);
    expect(summary?.eventCount).toBeGreaterThan(0);
  });
});

describe("Lobby chat round-trip survives a server restart", () => {
  const tmpFile = `./data/chat-rt-${process.pid}-${Math.floor(performance.now())}.sqlite`;

  afterEach(async () => {
    const { rmSync } = await import("node:fs");
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(`${tmpFile}${suffix}`, { force: true });
    }
  });

  it("hydrates CHAT_HISTORY from the DB after a restart", async () => {
    // --- pirms restarta: ziņas tiek rakstītas caur LobbyChat onMessage → DB ---
    let seq = 0;
    const storage1 = new SqliteStorage({ filename: tmpFile });
    const persistence1 = new MatchPersistence({ storage: storage1, clock: () => 1 });
    const chat1 = new LobbyChat({
      clock: () => 1,
      createMessageId: () => `c${(seq += 1)}`,
      onMessage: (message) => persistence1.chatMessage(message)
    });
    chat1.submit("p1", "#aaaaa", "labrīt");
    chat1.submit("p2", "#bbbbb", "čau");
    await new Promise((resolve) => setImmediate(resolve));
    await storage1.close();

    // --- pēc restarta: jauns serveris hidratē buferi no DB ---
    const storage2 = new SqliteStorage({ filename: tmpFile });
    const chat2 = new LobbyChat({ clock: () => 1, historyLimit: 50 });
    chat2.hydrate(await storage2.loadRecentChatMessages(50));

    expect(chat2.history().map((message) => message.text)).toEqual(["labrīt", "čau"]);
    await storage2.close();
  });
});
