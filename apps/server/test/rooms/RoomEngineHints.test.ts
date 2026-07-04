import { HINTS_PER_ROUND } from "@domino-poker/shared";
import { describe, expect, it } from "vitest";

import { GameDirector } from "../../src/rooms/GameDirector.js";
import { RoomEngine } from "../../src/rooms/RoomEngine.js";
import { noopTurnTimerScheduler } from "../../src/timers/TurnTimerScheduler.js";

const gameId = "room-hint";
const seed = "hint-seed";

/** Izveido spēli (bez cilvēkiem pēc noklusējuma; kvotas mehānika neatkarīga no statusa). */
function createGame(humanSeatIndices: readonly number[] = [], numberOfRounds?: number): RoomEngine {
  const engine = new RoomEngine({ clock: () => 1000, scheduler: noopTurnTimerScheduler });
  const created = engine.dispatch({
    type: "CREATE_GAME",
    gameId,
    requestId: "req-create",
    seed,
    humanSeatIndices,
    ...(numberOfRounds !== undefined ? { numberOfRounds } : {})
  });
  expect(created.accepted).toBe(true);
  return engine;
}

function currentPlayerId(engine: RoomEngine): string {
  const snapshot = engine.getPublicSnapshot();
  const player = snapshot.players[snapshot.currentPlayerIndex];
  if (!player) throw new Error("No current player.");
  return player.playerId;
}

function startTurn(engine: RoomEngine, turnId: string): void {
  const result = engine.dispatch({ type: "START_TURN", gameId, requestId: `start-${turnId}`, turnId, now: 0 });
  expect(result.accepted).toBe(true);
}

/**
 * Izspēlē solīšanu (visi 0 → summa 0 ≠ 7, legāls arī pēdējam) un atver pirmo IZSPĒLES
 * kārtu. Atgriež šī vedēja core spēlētāja id + kārtas id (padoma grant ceļa testiem).
 */
function reachPlayingTurn(engine: RoomEngine, turnId = "play-1"): { playerId: string; turnId: string } {
  for (let i = 0; i < 4; i += 1) {
    const bidTurn = `bid-${i}`;
    startTurn(engine, bidTurn);
    const bid = engine.dispatch({
      type: "SUBMIT_BID",
      gameId,
      requestId: `bid-${i}`,
      playerId: currentPlayerId(engine),
      turnId: bidTurn,
      now: 0,
      bid: 0
    });
    expect(bid.accepted).toBe(true);
  }
  startTurn(engine, turnId);
  const turn = engine.getGameState().currentTurn;
  expect(turn?.phase).toBe("playing");
  return { playerId: currentPlayerId(engine), turnId };
}

describe("RoomEngine hint quota (B daļa, D7/D9)", () => {
  it("denies a hint when there is no active game", () => {
    const engine = new RoomEngine({ clock: () => 1000, scheduler: noopTurnTimerScheduler });
    expect(engine.requestHint("1", "t", "r")).toEqual({
      granted: false,
      reason: "no_active_game",
      hintsRemaining: 0
    });
  });

  it("denies a hint outside the requester's active playing turn", () => {
    const engine = createGame();
    startTurn(engine, "bid-turn"); // solīšanas kārta, NE izspēle
    const player = currentPlayerId(engine);

    // Solīšanas fāzē (ne playing) → not_your_turn, kvota nemainās.
    expect(engine.requestHint(player, "bid-turn", "a")).toEqual({
      granted: false,
      reason: "not_your_turn",
      hintsRemaining: HINTS_PER_ROUND
    });
  });

  it("denies a hint on a valid turn but wrong turnId / wrong player", () => {
    const engine = createGame();
    const { playerId, turnId } = reachPlayingTurn(engine);
    const other = playerId === "1" ? "2" : "1";

    expect(engine.requestHint(playerId, "stale-turn", "a").granted).toBe(false);
    expect(engine.requestHint(other, turnId, "b").granted).toBe(false);
    // Neviens noraidījums nedrīkst tērēt kvotu.
    expect(engine.requestHint(playerId, turnId, "c")).toEqual({ granted: true, hintsRemaining: HINTS_PER_ROUND - 1 });
  });

  it("grants and decrements down to zero, then denies with no_quota", () => {
    const engine = createGame();
    const { playerId, turnId } = reachPlayingTurn(engine);

    // 3 padomi (var iztērēt visus vienā atvērtā kārtā — kvota ir per-raunds, ne per-kārta).
    expect(engine.requestHint(playerId, turnId, "h1")).toEqual({ granted: true, hintsRemaining: 2 });
    expect(engine.requestHint(playerId, turnId, "h2")).toEqual({ granted: true, hintsRemaining: 1 });
    expect(engine.requestHint(playerId, turnId, "h3")).toEqual({ granted: true, hintsRemaining: 0 });
    // 4. → izsmelts.
    expect(engine.requestHint(playerId, turnId, "h4")).toEqual({
      granted: false,
      reason: "no_quota",
      hintsRemaining: 0
    });
  });

  it("is idempotent for a repeated requestId (does not decrement twice)", () => {
    const engine = createGame();
    const { playerId, turnId } = reachPlayingTurn(engine);

    const first = engine.requestHint(playerId, turnId, "same");
    expect(first).toEqual({ granted: true, hintsRemaining: 2 });
    // Tas pats requestId (tīkla retry) → tas pats rezultāts, kvota NEmainās.
    const replay = engine.requestHint(playerId, turnId, "same");
    expect(replay).toEqual({ granted: true, hintsRemaining: 2 });
    // Cits requestId turpina atskaitīt no atlikuma (2 → 1).
    expect(engine.requestHint(playerId, turnId, "other")).toEqual({ granted: true, hintsRemaining: 1 });
  });

  it("charges quota when the same requestId is replayed on a DIFFERENT turn in the same round", () => {
    const engine = createGame([], 2);
    const director = new GameDirector({ engine, gameId });

    // 1. raunds, spēlētāja P pirmā izspēles kārta T1: legāls padoms ar requestId "reuse".
    const first = stepToOpenPlayingTurn(engine, director);
    expect(engine.requestHint(first.playerId, first.turnId, "reuse")).toEqual({ granted: true, hintsRemaining: 2 });
    // ĪSTS retry (tas pats turns + requestId) → idempotents, NEatskaita atkārtoti.
    expect(engine.requestHint(first.playerId, first.turnId, "reuse")).toEqual({ granted: true, hintsRemaining: 2 });

    // Virza uz TĀS PAŠAS P nākamo izspēles kārtu T2 (joprojām 1. raunds).
    const turnId2 = stepToOpenPlayingTurnFor(engine, director, first.playerId);
    expect(turnId2).not.toBe(first.turnId);
    expect(engine.getGameState().coreState.currentRound).toBe(1);

    // Tā paša requestId atkārtošana JAUNĀ kārtā MAKSĀ kvotu (nav bezmaksas padoma; drošības kļūda).
    expect(engine.requestHint(first.playerId, turnId2, "reuse")).toEqual({ granted: true, hintsRemaining: 1 });
  });

  it("resets the quota when a new round starts (D7)", () => {
    const engine = createGame([], 2);
    const director = new GameDirector({ engine, gameId });

    // Sasniedz atvērtu izspēles kārtu 1. raundā (visi boti → izspēlē automātiski).
    const first = stepToOpenPlayingTurn(engine, director);
    // Iztērē VISU kvotu šim spēlētājam 1. raundā.
    engine.requestHint(first.playerId, first.turnId, "r1-a");
    engine.requestHint(first.playerId, first.turnId, "r1-b");
    expect(engine.requestHint(first.playerId, first.turnId, "r1-c")).toEqual({ granted: true, hintsRemaining: 0 });
    expect(engine.requestHint(first.playerId, first.turnId, "r1-d").granted).toBe(false);

    // Virza spēli līdz 2. raundam.
    while (engine.getGameState().coreState.currentRound < 2) {
      expect(engine.getGameState().coreState.phase).not.toBe("gameEnd");
      director.step();
    }

    // Tas PATS spēlētājs 2. raundā saņem svaigu pilnu kvotu (pierāda reset).
    const turnId2 = stepToOpenPlayingTurnFor(engine, director, first.playerId);
    expect(engine.requestHint(first.playerId, turnId2, "r2-a")).toEqual({
      granted: true,
      hintsRemaining: HINTS_PER_ROUND - 1
    });
  });
});

/** Soļo direktoru, līdz ir atvērta izspēles kārta; atgriež tās spēlētāju + kārtas id. */
function stepToOpenPlayingTurn(
  engine: RoomEngine,
  director: GameDirector
): { playerId: string; turnId: string } {
  for (let i = 0; i < 2000; i += 1) {
    director.step();
    const turn = engine.getGameState().currentTurn;
    if (turn && turn.phase === "playing") return { playerId: turn.playerId, turnId: turn.turnId };
    if (engine.getGameState().coreState.phase === "gameEnd") break;
  }
  throw new Error("No open playing turn reached.");
}

/** Soļo direktoru, līdz atvērta izspēles kārta pieder dotajam spēlētājam; atgriež kārtas id. */
function stepToOpenPlayingTurnFor(engine: RoomEngine, director: GameDirector, playerId: string): string {
  for (let i = 0; i < 2000; i += 1) {
    director.step();
    const turn = engine.getGameState().currentTurn;
    if (turn && turn.phase === "playing" && turn.playerId === playerId) return turn.turnId;
    if (engine.getGameState().coreState.phase === "gameEnd") break;
  }
  throw new Error(`No open playing turn reached for player ${playerId}.`);
}
