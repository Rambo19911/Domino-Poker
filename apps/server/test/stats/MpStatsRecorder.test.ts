import { describe, expect, it } from "vitest";

import type { SequencedRoomEvent } from "../../src/rooms/RoomEngine.js";
import type { GameResultRecord } from "../../src/storage/PlayerStatsStore.js";
import type { MatchStartedRecord } from "../../src/storage/StoragePort.js";
import { MpStatsRecorder } from "../../src/stats/MpStatsRecorder.js";

function fakeStore() {
  const records: GameResultRecord[] = [];
  return {
    records,
    recordGameResult: (record: GameResultRecord): Promise<boolean> => {
      records.push(record);
      return Promise.resolve(true);
    }
  };
}

/** 2 reģistrēti cilvēki (uA=core1, uB=core2), 1 anonīms cilvēks (core3), 1 bots (core4). */
function match(matchId: string): MatchStartedRecord {
  return {
    matchId,
    seed: "seed",
    numberOfRounds: 2,
    players: [
      { seatIndex: 0, corePlayerId: "1", kind: "human", userId: "uA" },
      { seatIndex: 1, corePlayerId: "2", kind: "human", userId: "uB" },
      { seatIndex: 2, corePlayerId: "3", kind: "human" },
      { seatIndex: 3, corePlayerId: "4", kind: "bot" }
    ],
    startedAt: 1000
  };
}

function roundResult(
  gameId: string,
  round: number,
  seq: number,
  results: ReadonlyArray<{ playerId: string; bid: number; tricksWon: number }>
): SequencedRoomEvent {
  return { seq, event: { type: "ROUND_RESULT", gameId, eventSeq: seq, round, playerResults: results } };
}

function gameOver(gameId: string, seq: number): SequencedRoomEvent {
  return { seq, event: { type: "GAME_OVER", gameId, eventSeq: seq } };
}

describe("MpStatsRecorder", () => {
  it("accumulates bid-accuracy from ROUND_RESULT and persists one row per registered human", async () => {
    const store = fakeStore();
    const rec = new MpStatsRecorder({ store, clock: () => 5000 });
    rec.matchStarted(match("g1"));
    // 1. raunds: uA bid 3 won 3 (met); uB bid 2 won 4 (exceeded).
    rec.recordEvents([
      roundResult("g1", 1, 10, [
        { playerId: "1", bid: 3, tricksWon: 3 },
        { playerId: "2", bid: 2, tricksWon: 4 },
        { playerId: "3", bid: 1, tricksWon: 1 },
        { playerId: "4", bid: 0, tricksWon: 0 }
      ])
    ]);
    // 2. (pēdējais) raunds + GAME_OVER VIENĀ batch → pēdējais raunds JĀIESKAITA.
    rec.recordEvents([
      roundResult("g1", 2, 20, [
        { playerId: "1", bid: 4, tricksWon: 2 }, // missed
        { playerId: "2", bid: 1, tricksWon: 1 }, // met
        { playerId: "3", bid: 2, tricksWon: 2 },
        { playerId: "4", bid: 0, tricksWon: 0 }
      ]),
      gameOver("g1", 21)
    ]);
    rec.gameOver("g1", ["2", "1", "3", "4"]); // core2=1., core1=2.
    await Promise.resolve();

    expect(store.records).toHaveLength(2); // anonīmais (core3) + bots (core4) izslēgti
    expect(store.records).toContainEqual({
      id: "mp:g1:uA", userId: "uA", mode: "mp", placement: 2, roundCount: 2,
      bidMet: 1, bidExceeded: 0, bidMissed: 1, completedAt: 5000
    });
    expect(store.records).toContainEqual({
      id: "mp:g1:uB", userId: "uB", mode: "mp", placement: 1, roundCount: 2,
      bidMet: 1, bidExceeded: 1, bidMissed: 0, completedAt: 5000
    });
  });

  it("dedupes a re-delivered ROUND_RESULT (counts each round once)", async () => {
    const store = fakeStore();
    const rec = new MpStatsRecorder({ store, clock: () => 1 });
    rec.matchStarted(match("g2"));
    const round = roundResult("g2", 1, 10, [
      { playerId: "1", bid: 3, tricksWon: 3 },
      { playerId: "2", bid: 2, tricksWon: 2 },
      { playerId: "3", bid: 1, tricksWon: 1 },
      { playerId: "4", bid: 0, tricksWon: 0 }
    ]);
    rec.recordEvents([round]);
    rec.recordEvents([round]); // atkārtota piegāde
    rec.gameOver("g2", ["1", "2", "3", "4"]);
    await Promise.resolve();
    expect(store.records.find((r) => r.id === "mp:g2:uA")?.roundCount).toBe(1);
  });

  it("excludes a round where the player did not bid (bid < 0), keeping sum == roundCount", async () => {
    const store = fakeStore();
    const rec = new MpStatsRecorder({ store, clock: () => 1 });
    rec.matchStarted(match("g3"));
    rec.recordEvents([
      roundResult("g3", 1, 10, [
        { playerId: "1", bid: 3, tricksWon: 3 }, // met
        { playerId: "2", bid: 2, tricksWon: 2 },
        { playerId: "3", bid: 1, tricksWon: 1 },
        { playerId: "4", bid: 0, tricksWon: 0 }
      ]),
      roundResult("g3", 2, 20, [
        { playerId: "1", bid: -1, tricksWon: 0 }, // nepieteica → izlaiž šim spēlētājam
        { playerId: "2", bid: 1, tricksWon: 1 },
        { playerId: "3", bid: 2, tricksWon: 2 },
        { playerId: "4", bid: 0, tricksWon: 0 }
      ])
    ]);
    rec.gameOver("g3", ["1", "2", "3", "4"]);
    await Promise.resolve();
    const uA = store.records.find((r) => r.id === "mp:g3:uA");
    expect(uA?.roundCount).toBe(1);
    expect(uA && uA.bidMet + uA.bidExceeded + uA.bidMissed).toBe(uA?.roundCount);
  });

  it("skips a registered human with zero counted rounds (round_count > 0) and logs it", async () => {
    const store = fakeStore();
    const errors: string[] = [];
    const rec = new MpStatsRecorder({ store, clock: () => 1, onError: (context) => errors.push(context) });
    rec.matchStarted(match("g4"));
    rec.gameOver("g4", ["1", "2", "3", "4"]); // bez neviena ROUND_RESULT
    await Promise.resolve();
    expect(store.records).toHaveLength(0);
    expect(errors.filter((e) => e === "gameOver")).toHaveLength(2); // abi reģistrētie izlaisti
  });

  it("writes nothing for an abandoned match (forget) or one with no registered humans", async () => {
    const store = fakeStore();
    const rec = new MpStatsRecorder({ store, clock: () => 1 });
    // forget → gameOver pēc tam neko neraksta
    rec.matchStarted(match("g5"));
    rec.recordEvents([
      roundResult("g5", 1, 10, [
        { playerId: "1", bid: 3, tricksWon: 3 },
        { playerId: "2", bid: 2, tricksWon: 2 },
        { playerId: "3", bid: 1, tricksWon: 1 },
        { playerId: "4", bid: 0, tricksWon: 0 }
      ])
    ]);
    rec.forget("g5");
    rec.gameOver("g5", ["1", "2", "3", "4"]);
    // bez reģistrētiem cilvēkiem → matchStarted neizveido stāvokli
    rec.matchStarted({
      ...match("g6"),
      players: [
        { seatIndex: 0, corePlayerId: "1", kind: "human" },
        { seatIndex: 1, corePlayerId: "2", kind: "bot" },
        { seatIndex: 2, corePlayerId: "3", kind: "bot" },
        { seatIndex: 3, corePlayerId: "4", kind: "bot" }
      ]
    });
    rec.gameOver("g6", ["1", "2", "3", "4"]);
    await Promise.resolve();
    expect(store.records).toHaveLength(0);
  });
});
