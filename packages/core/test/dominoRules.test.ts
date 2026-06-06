import { describe, expect, it } from "vitest";
import {
  calculateRoundScore,
  canPlayTile,
  completeTrick,
  createNewGame,
  createPlayer,
  determineTrickWinner,
  getFullSet,
  getInvalidMoveReason,
  getWinner,
  isAce,
  isStrongerTile,
  isTrump,
  makeBid,
  makeAIBid,
  playTile,
  selectAITile,
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

  it("preserves the existing cut-and-overhand shuffle order for an injected rng", () => {
    expect(shuffleSet(() => 0.37).map(tileKey)).toEqual([
      "5-5",
      "5-6",
      "6-6",
      "4-4",
      "4-5",
      "4-6",
      "3-4",
      "3-5",
      "3-6",
      "2-5",
      "2-6",
      "3-3",
      "2-2",
      "2-3",
      "2-4",
      "1-4",
      "1-5",
      "1-6",
      "1-3",
      "0-6",
      "1-1",
      "1-2",
      "0-3",
      "0-4",
      "0-5",
      "0-0",
      "0-1",
      "0-2"
    ]);
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

  it("returns structured invalid move reasons for UI messages", () => {
    const trumpLeadPlayer = withHand([tile(1, 1), tile(1, 0), tile(2, 3)]);
    expect(
      getInvalidMoveReason(trumpLeadPlayer, tile(1, 0), {
        leadTile: tile(1, 5),
        isTrumpLead: true,
        highestTrumpPriorityInTrick: 3
      })
    ).toEqual({ code: "stronger-trump-required" });

    const requiredNumberPlayer = withHand([tile(3, 6), tile(1, 1), tile(0, 2)]);
    expect(
      getInvalidMoveReason(requiredNumberPlayer, tile(1, 1), {
        leadTile: tile(3, 4),
        requiredNumber: 3
      })
    ).toEqual({ code: "required-number-required", requiredNumber: 3 });

    const trumpFallbackPlayer = withHand([tile(1, 1), tile(0, 2), tile(4, 5)]);
    expect(
      getInvalidMoveReason(trumpFallbackPlayer, tile(4, 5), {
        leadTile: tile(3, 4),
        requiredNumber: 3
      })
    ).toEqual({ code: "required-number-or-trump-required", requiredNumber: 3 });

    expect(
      getInvalidMoveReason(trumpFallbackPlayer, tile(3, 3), {
        leadTile: tile(3, 4),
        requiredNumber: 3
      })
    ).toEqual({ code: "tile-not-in-hand" });
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

  it("rejects invalid dealer indexes", () => {
    const deck = getFullSet();

    expect(() => createNewGame({ dealerIndex: -1, deck })).toThrow("Dealer index");
    expect(() => createNewGame({ dealerIndex: 4, deck })).toThrow("Dealer index");
    expect(() => createNewGame({ dealerIndex: 1.5, deck })).toThrow("Dealer index");
    expect(() => createNewGame({ rng: () => 1, deck })).toThrow("Dealer index");
  });

  it("rejects malformed custom decks before dealing", () => {
    const fullSet = getFullSet();
    const duplicateDeck = [
      { side1: 0, side2: 1 },
      { side1: 1, side2: 0 },
      ...fullSet.slice(2)
    ];
    const invalidPipDeck = [
      { side1: 7, side2: 0 },
      ...fullSet.slice(1)
    ];

    expect(() => createNewGame({ dealerIndex: 0, deck: fullSet.slice(1) })).toThrow(
      "exactly 28"
    );
    expect(() => createNewGame({ dealerIndex: 0, deck: duplicateDeck })).toThrow(
      "Duplicate tile"
    );
    expect(() => createNewGame({ dealerIndex: 0, deck: invalidPipDeck })).toThrow(
      "integer from 0 to 6"
    );
  });

  it("validates custom decks passed to the next round", () => {
    const roundEndState: GameState = {
      ...createNewGame({ dealerIndex: 0, deck: getFullSet() }),
      phase: "roundEnd",
      lastRoundWinnerIndex: 1
    };
    const duplicateDeck = [
      { side1: 0, side2: 1 },
      { side1: 1, side2: 0 },
      ...getFullSet().slice(2)
    ];

    expect(() => startNextRound(roundEndState, duplicateDeck)).toThrow("Duplicate tile");
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

  it("breaks final game score ties with the round winner tiebreakers", () => {
    const state: GameState = {
      ...createNewGame({ dealerIndex: 0, deck: getFullSet() }),
      phase: "gameEnd",
      players: [
        {
          ...createPlayer({ id: "1", name: "You", playerType: "human" }),
          totalScore: 100,
          bid: 2,
          tricksWon: 2
        },
        {
          ...createPlayer({ id: "2", name: "AI 1", isAI: true }),
          totalScore: 100,
          bid: 4,
          tricksWon: 2
        },
        {
          ...createPlayer({ id: "3", name: "AI 2", isAI: true }),
          totalScore: 90,
          bid: 7,
          tricksWon: 7
        },
        {
          ...createPlayer({ id: "4", name: "AI 3", isAI: true }),
          totalScore: 100,
          bid: 3,
          tricksWon: 5
        }
      ]
    };

    expect(getWinner(state)?.id).toBe("2");
  });
});

describe("AI behavior", () => {
  it("preserves AI bidding and number declaration heuristics", () => {
    const player = withHand([
      tile(0, 0),
      tile(1, 1),
      tile(1, 6),
      tile(6, 6),
      tile(5, 5),
      tile(2, 4),
      tile(3, 4)
    ]);

    expect(makeAIBid(player)).toBe(3);
    expect(selectNumber(tile(2, 4), player)).toBe(4);
  });

  it("matches the authoritative engine when comparing the 0-6 special tile (M7)", () => {
    const state = playableState([
      [tile(2, 6)],
      [tile(0, 6), tile(4, 6)],
      [tile(3, 3)],
      [tile(4, 4)]
    ]);
    const aiState: GameState = {
      ...state,
      currentPlayerIndex: 1,
      currentTrick: [{ tile: tile(2, 6), playerIndex: 0, declaredNumber: 6 }],
      leadTile: tile(2, 6),
      requiredNumber: 6,
      players: state.players.map((player) =>
        player.id === "2" ? { ...player, bid: 1, tricksWon: 0 } : player
      )
    };

    // requiredNumber=6: the 0-6 played AS A 6 is NOT an ace (engine `isPlayedAsAce`),
    // so it loses to the 2-6 lead (other side 0 < 2). 4-6 actually wins (4 > 2).
    // The AI needs a trick (bid 1, 0 won) and must pick the truly-winning 4-6 —
    // it no longer mis-predicts 0-6 as an unconditional ace.
    expect(tileEquals(selectAITile(aiState.players[1]!, aiState), tile(4, 6))).toBe(true);

    // Cross-check the prediction against the engine's authoritative comparison:
    // 2-6 (lead) is stronger than 0-6 here, but not stronger than 4-6.
    expect(isStrongerTile(aiState, tile(2, 6), tile(0, 6))).toBe(true);
    expect(isStrongerTile(aiState, tile(2, 6), tile(4, 6))).toBe(false);
  });

  it("dumps a losing tile instead of winning once its bid is met (selectHardTile)", () => {
    const state = playableState([
      [tile(2, 3)],
      [tile(0, 3), tile(3, 5)],
      [tile(4, 4)],
      [tile(5, 5)]
    ]);
    const aiState: GameState = {
      ...state,
      currentPlayerIndex: 1,
      currentTrick: [{ tile: tile(2, 3), playerIndex: 0, declaredNumber: 3 }],
      leadTile: tile(2, 3),
      requiredNumber: 3,
      players: state.players.map((player) =>
        player.id === "2" ? { ...player, bid: 1, tricksWon: 1 } : player
      )
    };

    // Solījums izpildīts (tricksNeeded = 0) un AI VAR uzvarēt (3-5 pārspētu lead),
    // bet tai jāizvairās no nevajadzīga trika (overtricks sods): nomet zaudējošo
    // 0-3, nevis uzvarošo 3-5.
    expect(tileEquals(selectAITile(aiState.players[1]!, aiState), tile(0, 3))).toBe(true);
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
      playerType: index === 0 ? "human" : "cpu"
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
