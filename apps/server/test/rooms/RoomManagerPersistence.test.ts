import { describe, expect, it } from "vitest";

import { RoomManager } from "../../src/rooms/RoomManager.js";
import type { SequencedRoomEvent } from "../../src/rooms/RoomEngine.js";
import type { MatchStartedRecord } from "../../src/storage/StoragePort.js";
import { ManualTimerController } from "../../src/timers/ManualTimerController.js";

interface Captured {
  readonly started: MatchStartedRecord[];
  readonly events: SequencedRoomEvent[];
  readonly forfeited: Array<{ matchId: string; corePlayerId: string }>;
  readonly abandoned: string[];
}

function createManager(): { manager: RoomManager; captured: Captured } {
  const timer = new ManualTimerController(1_000);
  let roomSeq = 0;
  let codeSeq = 0;
  let seedSeq = 0;
  const captured: Captured = { started: [], events: [], forfeited: [], abandoned: [] };
  const manager = new RoomManager({
    clock: timer.now,
    createRoomId: () => `room-${(roomSeq += 1)}`,
    createRoomCode: () => `code${(codeSeq += 1)}`,
    createSeed: () => `seed-${(seedSeq += 1)}`,
    onMatchStarted: (record) => captured.started.push(record),
    onMatchEvents: (events) => captured.events.push(...events),
    onPlayerForfeited: (matchId, corePlayerId) => captured.forfeited.push({ matchId, corePlayerId }),
    onRoomAbandoned: (matchId) => captured.abandoned.push(matchId)
  });
  return { manager, captured };
}

describe("RoomManager persistence emission (10.3)", () => {
  it("emits a match-started record with the seed and seat composition on startGame", () => {
    const { manager, captured } = createManager();
    manager.createRoom("host");
    manager.fillSeatsWithBots("host");
    manager.startGame("host");

    expect(captured.started).toHaveLength(1);
    const record = captured.started[0];
    expect(record?.matchId).toBe("room-1");
    expect(record?.seed).toBe("seed-1");
    expect(record?.startedAt).toBe(1_000);
    expect(record?.players).toHaveLength(4);
    // Sēdvieta 0 = host (cilvēks), pārējās aizpildītas ar botiem.
    expect(record?.players[0]).toMatchObject({ seatIndex: 0, corePlayerId: "1", kind: "human" });
    expect(record?.players.slice(1).every((seat) => seat.kind === "bot")).toBe(true);
  });

  it("forwards engine room events to onMatchEvents (single chokepoint, all paths)", () => {
    const { manager, captured } = createManager();
    manager.createRoom("host");
    manager.fillSeatsWithBots("host");
    manager.startGame("host");
    // Dzen spēli līdz pirmajam cilvēka turnam — boti nospēlē, eventi plūst caur novērotāju.
    manager.advanceGame("room-1");

    expect(captured.events.length).toBeGreaterThan(0);
    // Eventiem ir monotoni augošs seq (dzinēja vienīgā numerācija).
    const seqs = captured.events.map((entry) => entry.seq);
    expect([...seqs]).toEqual([...seqs].sort((a, b) => a - b));
    // Tver dažādu ceļu eventus (vismaz turna sākums parādās).
    expect(captured.events.some((entry) => entry.event.type === "TURN_STARTED")).toBe(true);
  });

  it("fires onPlayerForfeited (lose) when a player exits while others keep playing", () => {
    const { manager, captured } = createManager();
    manager.createRoom("host");
    manager.joinRoom("p2", { roomId: "room-1", seatIndex: 1 });
    manager.fillSeatsWithBots("host");
    manager.startGame("host");

    manager.forfeitInGame("host"); // host = sēdvieta 0 → corePlayerId "1"

    expect(captured.forfeited).toEqual([{ matchId: "room-1", corePlayerId: "1" }]);
    // p2 vēl spēlē → istaba NEtiek pamesta.
    expect(captured.abandoned).toEqual([]);
  });

  it("fires onRoomAbandoned (cleanup) when the last human exits mid-game", () => {
    const { manager, captured } = createManager();
    manager.createRoom("host");
    manager.fillSeatsWithBots("host"); // host + 3 boti
    manager.startGame("host");

    manager.forfeitInGame("host"); // vienīgais cilvēks → istaba iznīcināta

    expect(captured.forfeited).toEqual([{ matchId: "room-1", corePlayerId: "1" }]);
    expect(captured.abandoned).toEqual(["room-1"]);
  });

  it("does not emit when no persistence callbacks are configured", () => {
    const timer = new ManualTimerController(1_000);
    const manager = new RoomManager({
      clock: timer.now,
      createRoomId: () => "room-x",
      createSeed: () => "seed-x"
    });
    manager.createRoom("host");
    manager.fillSeatsWithBots("host");
    // Bez callback — startGame nedrīkst mest (novērotāji ir izvēles).
    expect(() => manager.startGame("host")).not.toThrow();
  });
});
