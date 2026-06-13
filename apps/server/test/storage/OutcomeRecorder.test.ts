import { describe, expect, it } from "vitest";

import { OutcomeRecorder } from "../../src/storage/OutcomeRecorder.js";
import type { MatchOutcome, MatchSeatRecord, MatchStartedRecord } from "../../src/storage/StoragePort.js";

/** Fake glabātuve: ieraksta (matchId:userId) → outcome, idempotents kā īstā. */
class FakeOutcomeStore {
  readonly recorded = new Map<string, MatchOutcome>();

  async recordUserMatchOutcome(
    matchId: string,
    userId: string,
    outcome: MatchOutcome
  ): Promise<boolean> {
    const key = `${matchId}:${userId}`;
    if (this.recorded.has(key)) return false;
    this.recorded.set(key, outcome);
    return true;
  }
}

function seat(seatIndex: number, overrides: Partial<MatchSeatRecord> = {}): MatchSeatRecord {
  return {
    seatIndex,
    corePlayerId: String(seatIndex + 1),
    kind: "human",
    clientId: `c${seatIndex}`,
    userId: `u${seatIndex}`,
    ...overrides
  };
}

function match(players: readonly MatchSeatRecord[]): MatchStartedRecord {
  return { matchId: "m1", seed: "s", numberOfRounds: 7, players, startedAt: 1000 };
}

const fourHumans = [seat(0), seat(1), seat(2), seat(3)];

function makeRecorder(): { recorder: OutcomeRecorder; store: FakeOutcomeStore } {
  const store = new FakeOutcomeStore();
  const recorder = new OutcomeRecorder({ storage: store, clock: () => 2000, onError: () => {} });
  return { recorder, store };
}

describe("OutcomeRecorder", () => {
  it("records win for 1st/2nd and lose for 3rd/4th in an eligible game", async () => {
    const { recorder, store } = makeRecorder();
    recorder.matchStarted(match(fourHumans));
    // standings: core ids ranked → u2(seat1), u0(seat0) win; u3, u1 lose.
    recorder.gameOver("m1", ["2", "1", "4", "3"]);
    await Promise.resolve();
    expect(Object.fromEntries(store.recorded)).toEqual({
      "m1:u1": "win", // corePlayerId "2" rank 0
      "m1:u0": "win", // corePlayerId "1" rank 1
      "m1:u3": "lose", // corePlayerId "4" rank 2
      "m1:u2": "lose" // corePlayerId "3" rank 3
    });
  });

  it("fires onStatsChanged once per NEW outcome, never on an idempotent re-record", async () => {
    const store = new FakeOutcomeStore();
    let notifications = 0;
    const recorder = new OutcomeRecorder({
      storage: store,
      clock: () => 2000,
      onError: () => {},
      onStatsChanged: () => {
        notifications += 1;
      }
    });
    recorder.matchStarted(match(fourHumans));
    recorder.gameOver("m1", ["2", "1", "4", "3"]); // 4 new outcomes
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notifications).toBe(4);

    // Replaying the same finished match re-records the same (matchId, userId) pairs,
    // which the store reports as already-recorded → no further cache invalidations.
    recorder.matchStarted(match(fourHumans));
    recorder.gameOver("m1", ["2", "1", "4", "3"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notifications).toBe(4);
  });

  it("records nothing when a bot occupies a seat (not 4 humans)", async () => {
    const { recorder, store } = makeRecorder();
    recorder.matchStarted(match([seat(0), seat(1), seat(2), seat(3, { kind: "bot", userId: undefined, clientId: undefined })]));
    recorder.gameOver("m1", ["1", "2", "3", "4"]);
    await Promise.resolve();
    expect(store.recorded.size).toBe(0);
  });

  it("records nothing when a human seat is anonymous (no userId)", async () => {
    const { recorder, store } = makeRecorder();
    recorder.matchStarted(match([seat(0), seat(1), seat(2), seat(3, { userId: undefined })]));
    recorder.gameOver("m1", ["1", "2", "3", "4"]);
    await Promise.resolve();
    expect(store.recorded.size).toBe(0);
  });

  it("records nothing when two seats share the same user (anti-farming)", async () => {
    const { recorder, store } = makeRecorder();
    recorder.matchStarted(match([seat(0), seat(1, { userId: "u0" }), seat(2), seat(3)]));
    recorder.gameOver("m1", ["1", "2", "3", "4"]);
    await Promise.resolve();
    expect(store.recorded.size).toBe(0);
  });

  it("keeps a forfeit lose even if that player's seat later places 1st", async () => {
    const { recorder, store } = makeRecorder();
    recorder.matchStarted(match(fourHumans));
    recorder.playerForfeited("m1", "1"); // u0 forfeits
    await Promise.resolve();
    // Bots ņem u0 sēdvietu un nospēlē 1. vietā — bet u0 jau ir lose, NEpārrakstās.
    recorder.gameOver("m1", ["1", "2", "3", "4"]);
    await Promise.resolve();
    expect(store.recorded.get("m1:u0")).toBe("lose");
    expect(store.recorded.get("m1:u1")).toBe("win"); // corePlayerId "2" rank 1
  });

  it("records lose for all eligible players on full-room abandon", async () => {
    const { recorder, store } = makeRecorder();
    recorder.matchStarted(match(fourHumans));
    recorder.matchAbandoned("m1");
    await Promise.resolve();
    expect([...store.recorded.values()]).toEqual(["lose", "lose", "lose", "lose"]);
  });
});
