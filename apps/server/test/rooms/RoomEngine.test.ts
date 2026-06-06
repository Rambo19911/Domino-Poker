import { describe, expect, it } from "vitest";

import { RoomEngine, type SequencedRoomEvent } from "../../src/rooms/RoomEngine.js";
import { ManualTimerController } from "../../src/timers/ManualTimerController.js";

const gameId = "room-1";
const seed = "room-engine-seed";
const turnDurationMs = 10_000;

function setup(initialNow = 1_000, maxEventLog?: number): {
  readonly timer: ManualTimerController;
  readonly engine: RoomEngine;
} {
  const timer = new ManualTimerController(initialNow);
  const engine = new RoomEngine({
    clock: timer.now,
    scheduler: timer.scheduler,
    ...(maxEventLog !== undefined ? { maxEventLog } : {})
  });
  const created = engine.dispatch({
    type: "CREATE_GAME",
    gameId,
    requestId: "req-create",
    seed
  });
  expect(created.accepted).toBe(true);
  return { timer, engine };
}

function currentPlayerId(engine: RoomEngine): string {
  const snapshot = engine.getPublicSnapshot();
  const player = snapshot.players[snapshot.currentPlayerIndex];
  if (!player) throw new Error("No current player.");
  return player.playerId;
}

function startTurn(engine: RoomEngine, turnId: string): void {
  const result = engine.dispatch({
    type: "START_TURN",
    gameId,
    requestId: `req-start-${turnId}`,
    turnId,
    now: 0 // serveris pārraksta ar savu pulksteni
  });
  expect(result.accepted).toBe(true);
}

function submitBid(
  engine: RoomEngine,
  turnId: string,
  bid: number,
  requestId = `req-bid-${turnId}`
): ReturnType<RoomEngine["dispatch"]> {
  return engine.dispatch({
    type: "SUBMIT_BID",
    gameId,
    requestId,
    playerId: currentPlayerId(engine),
    turnId,
    now: 0,
    bid
  });
}

describe("RoomEngine single-writer dispatch", () => {
  it("assigns a contiguous room seq (+1 per event, no gaps)", () => {
    const { engine } = setup();

    startTurn(engine, "t1"); // TURN_STARTED → seq 1
    submitBid(engine, "t1", 0); // BID_ACCEPTED → seq 2
    startTurn(engine, "t2"); // seq 3
    submitBid(engine, "t2", 1); // seq 4

    const seqs = engine.getEventLog().map((entry) => entry.seq);
    expect(seqs).toEqual([1, 2, 3, 4]);
    expect(engine.getSeq()).toBe(4);
  });

  it("rejects an illegal command (errors propagated, not silently accepted)", () => {
    const { engine } = setup();
    startTurn(engine, "t1");

    // Nepareizs turnId aktīvam turnam → core fail(state) (nextState paliek).
    // RoomEngine to nedrīkst uzskatīt par pieņemtu tikai tāpēc, ka nextState ir.
    const rejected = submitBid(engine, "wrong-turn", 0, "req-wrong");

    expect(rejected.accepted).toBe(false);
    expect(rejected.events).toHaveLength(0);
    expect(rejected.errors.length).toBeGreaterThan(0);
    expect(engine.getSeq()).toBe(1); // state nemainījās (tikai TURN_STARTED)
  });

  it("is idempotent for a repeated requestId (does not apply twice)", () => {
    const { engine } = setup();
    startTurn(engine, "t1");

    // Tieši tā pati komanda (tas pats playerId + requestId) jānosūta divreiz.
    const command = {
      type: "SUBMIT_BID",
      gameId,
      requestId: "req-dupe",
      playerId: currentPlayerId(engine),
      turnId: "t1",
      now: 0,
      bid: 3
    } as const;

    const first = engine.dispatch(command);
    const seqAfterFirst = engine.getSeq();
    expect(first.accepted).toBe(true);
    expect(first.idempotentReplay).toBe(false);

    const replay = engine.dispatch(command);
    expect(replay.idempotentReplay).toBe(true);
    expect(engine.getSeq()).toBe(seqAfterFirst); // seq nepieaug
  });
});

describe("RoomEngine turn timeout scheduling (mocked timers)", () => {
  it("auto-resolves a turn via TURN_TIMEOUT when the deadline passes", () => {
    const { timer, engine } = setup(1_000);
    startTurn(engine, "t1"); // deadline = 1000 + 10000 = 11000

    expect(timer.hasPendingTimer()).toBe(true);
    const seqBefore = engine.getSeq();

    timer.advanceTo(11_000 + turnDurationMs); // pārsniedz deadline → timeris izpildās

    // Timeout izpildīja auto-darbību (TURN_TIMEOUT + BID_ACCEPTED) → seq pieauga,
    // turns beidzās, timeris atcelts.
    expect(engine.getSeq()).toBeGreaterThan(seqBefore);
    expect(timer.hasPendingTimer()).toBe(false);
    expect(engine.getPublicSnapshot().deadlineAt).toBeUndefined();
  });

  it("cancels the timeout once a bid is accepted (no stale timeout fires)", () => {
    const { timer, engine } = setup(1_000);
    startTurn(engine, "t1");
    submitBid(engine, "t1", 0); // pieņemts → timeris atcelts

    expect(timer.hasPendingTimer()).toBe(false);
    const seqAfterBid = engine.getSeq();

    timer.advanceTo(1_000_000); // tālu pāri deadline — nekas nedrīkst izpildīties
    expect(engine.getSeq()).toBe(seqAfterBid);
  });

  it("does not let a concurrent timeout and bid both resolve the same turn", () => {
    const { timer, engine } = setup(1_000);
    startTurn(engine, "t1");

    // Gājiens tiek pieņemts pirmais.
    const bid = submitBid(engine, "t1", 5);
    expect(bid.accepted).toBe(true);
    const seqAfterBid = engine.getSeq();

    // Tad "vienlaikus" pienāk timeout (timeris jau atcelts, bet pat ja izpildītos,
    // turnId vairs nesakrīt) → otrs gājiens netiek izpildīts.
    timer.advanceTo(11_000 + turnDurationMs);
    expect(engine.getSeq()).toBe(seqAfterBid);
  });
});

describe("RoomEngine snapshots and connection state", () => {
  it("returns a personalized snapshot exposing only the viewer's hand", () => {
    const { engine } = setup();

    const playerOne = engine.getSnapshotForPlayer("1");
    expect(playerOne.viewerPlayerId).toBe("1");
    expect(playerOne.hand.length).toBe(7);
    // Pretinieku rokas nav redzamas (tikai skaits publiskajos players).
    playerOne.players.forEach((player) => {
      expect(player).not.toHaveProperty("hand");
    });
  });

  it("throws when snapshotting an unknown player", () => {
    const { engine } = setup();
    expect(() => engine.getSnapshotForPlayer("nope")).toThrow();
  });

  it("does not pause the game when a player disconnects", () => {
    const { engine } = setup();

    const disconnect = engine.dispatch({
      type: "PLAYER_DISCONNECT",
      gameId,
      requestId: "req-dc",
      playerId: "1"
    });
    expect(disconnect.accepted).toBe(true);

    // Spēle turpinās: nākamais turns un solījums joprojām tiek pieņemti.
    startTurn(engine, "t1");
    const bid = submitBid(engine, "t1", 2);
    expect(bid.accepted).toBe(true);
  });
});

describe("RoomEngine seq recovery (getEventsSince)", () => {
  it("returns the events still retained in the buffer", () => {
    const { engine } = setup();
    startTurn(engine, "t1"); // seq 1
    submitBid(engine, "t1", 0); // seq 2

    const since0 = engine.getEventsSince(0);
    expect(since0.mode).toBe("incremental");
    if (since0.mode === "incremental") {
      expect(since0.events.map((entry) => entry.seq)).toEqual([1, 2]);
    }

    const since1 = engine.getEventsSince(1);
    expect(since1.mode === "incremental" && since1.events.map((entry) => entry.seq)).toEqual([2]);

    expect(engine.getEventsSince(2)).toEqual({ mode: "incremental", events: [] });
  });

  it("falls back to a full snapshot when lastSeq has been evicted", () => {
    const { engine } = setup(1_000, 2); // buferis tur tikai 2 pēdējos eventus
    startTurn(engine, "t1"); // seq 1
    submitBid(engine, "t1", 0); // seq 2
    startTurn(engine, "t2"); // seq 3
    submitBid(engine, "t2", 1); // seq 4 → buferis tur seq 3,4

    expect(engine.getEventsSince(1)).toEqual({ mode: "snapshot" }); // seq 2 izstumts
    const since2 = engine.getEventsSince(2);
    expect(since2.mode).toBe("incremental");
    if (since2.mode === "incremental") {
      expect(since2.events.map((entry) => entry.seq)).toEqual([3, 4]);
    }
  });

  it("returns a snapshot for an invalid or ahead-of-server lastSeq", () => {
    const { engine } = setup();
    startTurn(engine, "t1");
    expect(engine.getEventsSince(-1)).toEqual({ mode: "snapshot" });
    expect(engine.getEventsSince(99)).toEqual({ mode: "snapshot" });
  });
});

describe("RoomEngine turn timeout hook (Phase 7.1)", () => {
  it("invokes onTurnTimeout with the auto-play events when the timer fires", () => {
    const timer = new ManualTimerController(1_000);
    const captured: SequencedRoomEvent[][] = [];
    const engine = new RoomEngine({
      clock: timer.now,
      scheduler: timer.scheduler,
      onTurnTimeout: (events) => captured.push([...events])
    });
    engine.dispatch({ type: "CREATE_GAME", gameId, requestId: "req-create", seed });
    engine.dispatch({ type: "START_TURN", gameId, requestId: "req-s1", turnId: "t1", now: 0 });

    // deadline = startedAt(1000) + turnDurationMs(10000); fire pēc tā (+grace).
    timer.advanceTo(1_000 + turnDurationMs + 5);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.some((entry) => entry.event.type === "TURN_TIMEOUT")).toBe(true);
  });

  it("does not invoke onTurnTimeout for a stale timer (turn already ended)", () => {
    const timer = new ManualTimerController(1_000);
    let calls = 0;
    const engine = new RoomEngine({
      clock: timer.now,
      scheduler: timer.scheduler,
      onTurnTimeout: () => {
        calls += 1;
      }
    });
    engine.dispatch({ type: "CREATE_GAME", gameId, requestId: "req-create", seed });
    engine.dispatch({ type: "START_TURN", gameId, requestId: "req-s1", turnId: "t1", now: 0 });
    // Spēlētājs paspēj nobidēt → turns beidzas → ieplānotais timeris kļūst stale.
    engine.dispatch({
      type: "SUBMIT_BID",
      gameId,
      requestId: "req-b1",
      playerId: currentPlayerId(engine),
      turnId: "t1",
      now: 0,
      bid: 2
    });
    timer.advanceTo(1_000 + turnDurationMs + 5);

    expect(calls).toBe(0);
  });
});
