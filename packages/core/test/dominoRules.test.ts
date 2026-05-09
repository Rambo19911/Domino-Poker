import { describe, expect, it } from "vitest";
import {
  calculateRoundScore,
  canPlayTile,
  completeTrick,
  createNewGame,
  createPlayer,
  determineTrickWinner,
  getFullSet,
  isAce,
  isTrump,
  makeBid,
  makeAIBid,
  playTile,
  selectNumber,
  shuffleSet,
  startNextRound,
  tileEquals,
  tileKey
} from "../src";
import type { DominoTile, GameState, Player } from "../src";

const tile = (side1: number, side2: number): DominoTile => ({ side1, side2 });

describe("domino tiles", () => {
  it("builds the double-six set and treats reversed tiles as equal", () => {
    expect(getFullSet()).toHaveLength(28);
    expect(tileEquals(tile(1, 6), tile(6, 1))).toBe(true);
    expect(isTrump(tile(1, 6))).toBe(true);
    expect(isAce(tile(0, 6))).toBe(true);
  });

  it("shuffles without losing or duplicating tiles", () => {
    const fullSetKeys = getFullSet().map(tileKey).sort();
    const shuffledKeys = shuffleSet(() => 0.37).map(tileKey).sort();

    expect(shuffledKeys).toEqual(fullSetKeys);
    expect(new Set(shuffledKeys)).toHaveProperty("size", 28);
  });
});

describe("scoring", () => {
  it("preserves exact, overbid, underbid, and 7-trick scoring", () => {
    expect(calculateRoundScore({ bid: 3, tricksWon: 3 })).toBe(45);
    expect(calculateRoundScore({ bid: 3, tricksWon: 5 })).toBe(25);
    expect(calculateRoundScore({ bid: 4, tricksWon: 2 })).toBe(-10);
    expect(calculateRoundScore({ bid: 7, tricksWon: 7 })).toBe(155);
    expect(calculateRoundScore({ bid: 7, tricksWon: 5 })).toBe(-50);
  });
});

describe("legal play", () => {
  it("requires a stronger trump when a stronger trump is available", () => {
    const player = withHand([tile(1, 1), tile(1, 0), tile(2, 3)]);
    expect(
      canPlayTile(player, tile(1, 1), {
        leadTile: tile(1, 5),
        isTrumpLead: true,
        highestTrumpPriorityInTrick: 3
      })
    ).toBe(true);
    expect(
      canPlayTile(player, tile(1, 0), {
        leadTile: tile(1, 5),
        isTrumpLead: true,
        highestTrumpPriorityInTrick: 3
      })
    ).toBe(false);
  });

  it("requires the requested non-trump number before trumping", () => {
    const player = withHand([tile(3, 6), tile(1, 1), tile(0, 2)]);
    expect(
      canPlayTile(player, tile(3, 6), {
        leadTile: tile(3, 4),
        requiredNumber: 3
      })
    ).toBe(true);
    expect(
      canPlayTile(player, tile(1, 1), {
        leadTile: tile(3, 4),
        requiredNumber: 3
      })
    ).toBe(false);
  });

  it("requires overtrumping an ace-led trick when a stronger trump is available", () => {
    const player = withHand([tile(1, 5), tile(1, 3), tile(0, 6)]);
    const options = {
      leadTile: tile(2, 2),
      requiredNumber: 2,
      isAceLead: true,
      highestTrumpPriorityInTrick: 4
    } as const;

    expect(canPlayTile(player, tile(1, 5), options)).toBe(true);
    expect(canPlayTile(player, tile(1, 3), options)).toBe(false);
  });

  it("requires overtrumping a number-led trick when a stronger trump is available", () => {
    const player = withHand([tile(1, 5), tile(1, 3), tile(0, 6)]);
    const options = {
      leadTile: tile(3, 4),
      requiredNumber: 3,
      highestTrumpPriorityInTrick: 4
    } as const;

    expect(canPlayTile(player, tile(1, 5), options)).toBe(true);
    expect(canPlayTile(player, tile(1, 3), options)).toBe(false);
  });
});

describe("trick resolution", () => {
  it("makes trump beat non-trump regardless of lead number", () => {
    const state = playableState([
      [tile(3, 6)],
      [tile(4, 6)],
      [tile(1, 0)],
      [tile(2, 6)]
    ]);

    const afterLead = playTile(state, tile(3, 6), 6).state;
    const afterSecond = playTile(afterLead, tile(4, 6)).state;
    const afterTrump = playTile(afterSecond, tile(1, 0)).state;
    const afterFourth = playTile(afterTrump, tile(2, 6)).state;

    expect(determineTrickWinner(afterFourth)).toBe(2);
  });

  it("treats 0-6 as an ace only when played as 0", () => {
    const asSix = playableState([
      [tile(0, 6)],
      [tile(6, 6)],
      [tile(2, 6)],
      [tile(3, 6)]
    ]);
    let state = playTile(asSix, tile(0, 6), 6).state;
    state = playTile(state, tile(6, 6)).state;
    state = playTile(state, tile(2, 6)).state;
    state = playTile(state, tile(3, 6)).state;
    expect(determineTrickWinner(state)).toBe(1);

    const asZero = playableState([
      [tile(0, 6)],
      [tile(0, 2)],
      [tile(0, 3)],
      [tile(0, 4)]
    ]);
    state = playTile(asZero, tile(0, 6), 0).state;
    state = playTile(state, tile(0, 2)).state;
    state = playTile(state, tile(0, 3)).state;
    state = playTile(state, tile(0, 4)).state;
    expect(determineTrickWinner(state)).toBe(0);
  });
});

describe("round flow", () => {
  it("creates the expected single-player defaults", () => {
    const state = createNewGame({ dealerIndex: 0, deck: getFullSet() });
    expect(state.players.map((player) => player.name)).toEqual(["You", "AI 1", "AI 2", "AI 3"]);
    expect(state.players.map((player) => player.hand.length)).toEqual([7, 7, 7, 7]);
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.phase).toBe("bidding");
  });

  it("deals every tile exactly once across the four players", () => {
    const state = createNewGame({ dealerIndex: 0, rng: () => 0.37 });
    const dealtKeys = state.players.flatMap((player) => player.hand.map(tileKey));

    expect(dealtKeys).toHaveLength(28);
    expect(new Set(dealtKeys)).toHaveProperty("size", 28);
    expect(dealtKeys.sort()).toEqual(getFullSet().map(tileKey).sort());
  });

  it("uses the configured round count and ends after the final configured round", () => {
    const state = createNewGame({ numberOfRounds: 1, dealerIndex: 0, deck: getFullSet() });
    expect(state.totalRounds).toBe(1);

    const finalRoundEndState: GameState = { ...state, phase: "roundEnd" };
    expect(startNextRound(finalRoundEndState).phase).toBe("gameEnd");
  });

  it("rejects round counts outside 1 to 50", () => {
    expect(() => createNewGame({ numberOfRounds: 0 })).toThrow("1 to 50");
    expect(() => createNewGame({ numberOfRounds: 51 })).toThrow("1 to 50");
  });

  it("moves to round end after seven tricks and promotes round winner to next dealer", () => {
    let state = playableState([
      [tile(0, 0), tile(0, 2), tile(0, 3), tile(0, 4), tile(0, 5), tile(2, 6), tile(3, 6)],
      [tile(1, 0), tile(2, 3), tile(2, 4), tile(2, 5), tile(3, 4), tile(3, 5), tile(4, 5)],
      [tile(1, 2), tile(4, 6), tile(5, 6), tile(2, 2), tile(3, 3), tile(4, 4), tile(5, 5)],
      [tile(1, 3), tile(0, 1), tile(1, 1), tile(1, 4), tile(1, 5), tile(1, 6), tile(6, 6)]
    ]);

    state = {
      ...state,
      players: state.players.map((player) => ({ ...player, bid: player.id === "1" ? 7 : 0 }))
    };

    while (state.phase === "playing") {
      const current = state.players[state.currentPlayerIndex]!;
      const selected = current.hand[0]!;
      const declared =
        state.currentTrick.length === 0 && !isTrump(selected) && selected.side1 !== selected.side2
          ? selected.side1
          : undefined;
      const result = playTile(state, selected, declared);
      state = result.trickComplete ? completeTrick(result.state) : result.state;
    }

    expect(state.phase).toBe("roundEnd");
    expect(state.completedTricks).toHaveLength(7);
    expect(state.lastRoundWinnerIndex).toBeDefined();

    const nextDeck = getFullSet();
    const next = startNextRound(state, nextDeck);
    expect(next.phase).toBe("bidding");
    expect(next.currentRound).toBe(2);
    expect(next.dealerIndex).toBe(state.lastRoundWinnerIndex);
  });

  it("starts playing from dealer after all bids are made", () => {
    let state = createNewGame({ dealerIndex: 2, deck: getFullSet() });
    state = makeBid(state, 1);
    state = makeBid(state, 2);
    state = makeBid(state, 3);
    state = makeBid(state, 4);
    expect(state.phase).toBe("playing");
    expect(state.currentPlayerIndex).toBe(2);
  });
});

describe("AI behavior", () => {
  it("preserves easy bidding and number declaration heuristics", () => {
    const player = withHand([
      tile(0, 0),
      tile(1, 1),
      tile(1, 6),
      tile(6, 6),
      tile(5, 5),
      tile(2, 4),
      tile(3, 4)
    ]);

    expect(makeAIBid(player, "easy")).toBe(4);
    expect(selectNumber(tile(2, 4), player)).toBe(4);
  });
});

function withHand(hand: DominoTile[]): Player {
  return { ...createPlayer({ id: "p", name: "Player" }), hand };
}

function playableState(hands: DominoTile[][]): GameState {
  const players = hands.map((hand, index) => ({
    ...createPlayer({
      id: String(index + 1),
      name: index === 0 ? "You" : `AI ${index}`,
      isAI: index !== 0,
      playerType: index === 0 ? "human" : "cpu",
      aiDifficulty: "hard"
    }),
    hand,
    bid: 0
  })) satisfies Player[];

  return {
    players,
    currentPlayerIndex: 0,
    dealerIndex: 0,
    currentRound: 1,
    totalRounds: 7,
    phase: "playing",
    currentTrick: [],
    trickLeaderIndex: 0,
    isTrumpLead: false,
    isAceLead: false,
    completedTricks: [],
    trickWinners: [],
    trickValidations: []
  };
}
