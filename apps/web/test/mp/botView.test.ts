import {
  applyCommand,
  autoMove,
  createPlayerSnapshot,
  type MultiplayerCommand,
  type MultiplayerGameState
} from "@domino-poker/core/multiplayer";
import { describe, expect, it } from "vitest";

import { buildPlayerView } from "../../lib/bot/botBridge";
import { buildMpPlayerView } from "../../lib/mp/botView";

const gameId = "g";

function drive(
  state: MultiplayerGameState | undefined,
  command: MultiplayerCommand
): MultiplayerGameState {
  const result = applyCommand(state, command);
  expect(result.errors).toEqual([]);
  expect(result.invariantViolations).toEqual([]);
  if (!result.nextState) throw new Error(`drive: ${command.type} produced no next state.`);
  return result.nextState;
}

/** Jauna 4-cilvēku MP spēle (visi manuāli vadīti; komandas dodam paši). */
function freshGame(): MultiplayerGameState {
  return drive(undefined, {
    type: "CREATE_GAME",
    gameId,
    requestId: "create",
    seed: "botview-seed",
    humanSeatIndices: [0, 1, 2, 3],
    numberOfRounds: 2
  });
}

/** Izspēlē visus 4 solījumus (0) → izspēles fāze, tukši stiķi. */
function stateAfterBids(): MultiplayerGameState {
  let state = freshGame();
  for (let i = 0; i < 4; i += 1) {
    const turnId = `bid-${i}`;
    state = drive(state, { type: "START_TURN", gameId, requestId: `st-${turnId}`, turnId, now: 0 });
    const bidder = state.coreState.players[state.coreState.currentPlayerIndex]!.id;
    state = drive(state, {
      type: "SUBMIT_BID",
      gameId,
      requestId: `bid-cmd-${i}`,
      playerId: bidder,
      turnId,
      now: 0,
      bid: 0
    });
  }
  return state;
}

/** Izspēlē `count` izspēles gājienus (auto-move) no dotā state. */
function playMoves(start: MultiplayerGameState, count: number): MultiplayerGameState {
  let state = start;
  for (let i = 0; i < count; i += 1) {
    const turnId = `play-${i}`;
    state = drive(state, { type: "START_TURN", gameId, requestId: `st-${turnId}`, turnId, now: 0 });
    const mover = state.coreState.players[state.coreState.currentPlayerIndex]!.id;
    const move = autoMove(state, mover);
    if (!move) throw new Error(`playMoves: no legal auto-move at step ${i}.`);
    state = drive(state, {
      type: "SUBMIT_MOVE",
      gameId,
      requestId: `play-cmd-${i}`,
      playerId: mover,
      turnId,
      now: 0,
      tile: move.tile,
      ...(move.declaredNumber !== undefined ? { declaredNumber: move.declaredNumber } : {})
    });
  }
  return state;
}

/** Viens izspēles gājiens → nepabeigts stiķis ar 1 gājienu. */
function stateWithOpenTrick(): MultiplayerGameState {
  return playMoves(stateAfterBids(), 1);
}

/** Skatītāja `PlayerView`, kas atvasināts no servera snapshot (MP ceļš). */
function mpViewFor(state: MultiplayerGameState, seat: number) {
  const viewerId = state.coreState.players[seat]!.id;
  return buildMpPlayerView(createPlayerSnapshot(state, viewerId));
}

describe("buildMpPlayerView (B daļa, D10)", () => {
  it("matches buildPlayerView byte-for-byte on a fresh game (bids/hand/empty trick)", () => {
    const state = freshGame();
    for (let seat = 0; seat < 4; seat += 1) {
      expect(mpViewFor(state, seat)).toEqual(buildPlayerView(state.coreState, seat));
    }
  });

  it("matches buildPlayerView byte-for-byte with a non-empty current trick", () => {
    const state = stateWithOpenTrick();
    expect(state.coreState.currentTrick.length).toBe(1); // stiķis atvērts (1 gājiens)
    for (let seat = 0; seat < 4; seat += 1) {
      expect(mpViewFor(state, seat)).toEqual(buildPlayerView(state.coreState, seat));
    }
  });

  it("matches buildPlayerView byte-for-byte after a completed trick (history + taken populated)", () => {
    const state = playMoves(stateAfterBids(), 4); // pilns stiķis → completedTricks + uzvarētāja tricksWon
    expect(state.coreState.completedTricks.length).toBe(1);
    expect(state.coreState.players.some((player) => player.tricksWon > 0)).toBe(true);
    for (let seat = 0; seat < 4; seat += 1) {
      expect(mpViewFor(state, seat)).toEqual(buildPlayerView(state.coreState, seat));
    }
  });

  it("resolves the viewer seat + reads bids/taken in seat order", () => {
    const state = stateWithOpenTrick();
    const viewerSeat = state.coreState.currentPlayerIndex;
    const view = mpViewFor(state, viewerSeat);
    expect(view.seat).toBe(viewerSeat);
    // Visi nosolīja 0 → bids sēdvietu secībā [0,0,0,0]; firstSeat = dīleris.
    expect(view.bids).toEqual([0, 0, 0, 0]);
    expect(view.firstSeat).toBe(state.coreState.dealerIndex & 3);
    expect(view.hand).not.toBe(0); // skatītāja roka nav tukša
  });
});
