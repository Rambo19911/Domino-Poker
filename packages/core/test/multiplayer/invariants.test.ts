import { describe, expect, it } from "vitest";

import { createTile } from "../../src";
import {
  assertInvariants,
  createInitialMultiplayerGameState,
  createMultiplayerGameSetup,
  getInvariantViolations,
  MultiplayerInvariantError
} from "../../src/multiplayer";

function createState() {
  const setup = createMultiplayerGameSetup({
    gameId: "game-1",
    seed: "invariant-seed"
  });
  return createInitialMultiplayerGameState(setup);
}

describe("multiplayer invariants", () => {
  it("accepts a freshly created multiplayer state", () => {
    const state = createState();

    expect(getInvariantViolations(state)).toEqual([]);
    expect(() => assertInvariants(state)).not.toThrow();
  });

  it("reports duplicate tiles across player hands", () => {
    const state = createState();
    const duplicateTile = state.coreState.players[0]!.hand[0]!;
    const players = state.coreState.players.map((player, index) =>
      index === 1
        ? {
            ...player,
            hand: [duplicateTile, ...player.hand.slice(1)]
          }
        : player
    );

    expect(
      getInvariantViolations({
        ...state,
        coreState: {
          ...state.coreState,
          players
        }
      })
    ).toContain(
      `duplicate tile ${duplicateTile.side1}-${duplicateTile.side2} in hand:1 and hand:2.`
    );
  });

  it("reports impossible turn state", () => {
    const state = createState();
    const wrongPlayer = state.coreState.players.find(
      (_, index) => index !== state.coreState.currentPlayerIndex
    )!;

    const violations = getInvariantViolations({
      ...state,
      currentTurn: {
        turnId: "turn-1",
        playerId: wrongPlayer.id,
        startedAt: 2000,
        deadlineAt: 1000,
        allowedActionTypes: ["SUBMIT_BID", "SUBMIT_BID"],
        phase: "playing"
      }
    });

    expect(violations).toEqual(
      expect.arrayContaining([
        "currentTurn.phase must match core phase.",
        "currentTurn.startedAt must not be after deadlineAt.",
        "currentTurn.allowedActionTypes must not contain duplicates.",
        "currentTurn player must match current core player for bid/move actions."
      ])
    );
  });

  it("reports player mapping and index violations", () => {
    const state = createState();
    const violations = getInvariantViolations({
      ...state,
      players: [
        state.players[0]!,
        {
          ...state.players[1]!,
          playerId: state.players[0]!.playerId,
          seatIndex: state.players[0]!.seatIndex
        },
        state.players[2]!,
        state.players[3]!
      ],
      coreState: {
        ...state.coreState,
        currentPlayerIndex: 99,
        dealerIndex: 99,
        trickLeaderIndex: 99,
        currentTrick: [
          {
            tile: createTile(0, 0),
            playerIndex: 99
          }
        ]
      }
    });

    expect(violations).toEqual(
      expect.arrayContaining([
        "duplicate multiplayer playerId 1.",
        "duplicate multiplayer seatIndex 0.",
        "multiplayer player 1 must match core player 2 at seat 1.",
        "currentPlayerIndex must reference an existing player.",
        "dealerIndex must reference an existing player.",
        "trickLeaderIndex must reference an existing player.",
        "currentTrick playerIndex 99 is out of bounds."
      ])
    );
  });

  it("throws a typed error with all violations", () => {
    const state = {
      ...createState(),
      seed: ""
    };

    expect(() => assertInvariants(state)).toThrow(MultiplayerInvariantError);

    try {
      assertInvariants(state);
    } catch (error) {
      expect(error).toBeInstanceOf(MultiplayerInvariantError);
      expect((error as MultiplayerInvariantError).violations).toContain(
        "seed must not be empty."
      );
    }
  });
});

