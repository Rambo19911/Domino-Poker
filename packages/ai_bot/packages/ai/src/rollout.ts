import type { GameState, Move, Rng, Seat, TrickState } from "@domino-poker/engine";
import {
  ACE_MASK,
  PIP_RANK,
  SUIT_MASK,
  TRUMP_MASK,
  TRUMP_RANK,
  appendTrickMove,
  currentTrickSeat,
  getTile,
  isTrump,
  legalMoves,
  popcount,
  tileBit,
  trickWinner
} from "@domino-poker/engine";

export const ROLLOUT_EPSILON = 0.1;

// Continuous expected-tricks estimate for a hand (the heuristic bid model `e`). chooseRolloutBid
// rounds it; the Bayes determinization weights (4.2B) and profiling (4.6) use the raw value.
export function estimateExpectedTricks(hand: number, seat: Seat, firstSeat: Seat): number {
  let value = seat === firstSeat ? 0.45 : 0;
  let trumpCount = 0;

  forEachTile(hand, (tile) => {
    const trumpRank = TRUMP_RANK[tile] as number;
    if (trumpRank !== -1) {
      trumpCount += 1;
      value += trumpRank >= 7 ? 1.35 : trumpRank >= 5 ? 1.05 : trumpRank >= 3 ? 0.7 : 0.35;
      return;
    }

    if ((ACE_MASK & tileBit(tile)) !== 0) {
      const pip = aceLeadPip(tile);
      const suitCount = popcount(hand & (SUIT_MASK[pip] as number));
      if (seat === firstSeat && suitCount <= 2) {
        value += 0.95;
      } else if (suitCount <= 1) {
        value += 0.65;
      } else {
        value += 0.3;
      }
      return;
    }

    if (bestNaturalRank(tile, hand) >= 6) {
      value += 0.15;
    }
  });

  if (trumpCount >= 4) {
    value -= 0.45;
  }

  return value - 0.9;
}

export function chooseRolloutBid(hand: number, seat: Seat, firstSeat: Seat): number {
  return clampBid(Math.round(estimateExpectedTricks(hand, seat, firstSeat)));
}

export function chooseRolloutMove(state: GameState, rng: Rng, out: Move[] = []): Move {
  const seat = currentTrickSeat(state.trick);
  const moves = legalMoves(state.hands[seat], state.trick, out);
  if (moves.length === 0) {
    throw new Error(`No legal rollout moves for seat ${seat}.`);
  }

  if (rng() < ROLLOUT_EPSILON) {
    return moves[Math.floor(rng() * moves.length)] as Move;
  }

  const bid = state.bids[seat];
  if (bid < 0) {
    throw new Error(`Rollout requires a bid for seat ${seat}.`);
  }

  const needed = bid - state.taken[seat];
  const tricksLeft = 7 - Math.floor(state.history.length / 4);
  if (bid === 0 && tricksLeft <= 3) {
    return cheapestWinningMove(state, seat, moves) ?? lowestMove(state.trick, moves);
  }

  if (needed > 0) {
    return state.trick.isEmpty
      ? bestLeadForTaking(state, moves)
      : cheapestWinningMove(state, seat, moves) ?? lowestMove(state.trick, moves);
  }

  return state.trick.isEmpty
    ? bestLeadForAvoiding(state, moves)
    : highestLosingMove(state, seat, moves) ?? lowestMove(state.trick, moves);
}

function bestLeadForTaking(state: GameState, moves: Move[]): Move {
  let best = moves[0] as Move;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const move of moves) {
    let score = moveStrength(state.trick, move);
    const trumpRank = TRUMP_RANK[move.tile] as number;
    if (trumpRank !== -1) {
      score += 100 + trumpRank * 4;
    } else if ((ACE_MASK & tileBit(move.tile)) !== 0 && move.calledPip !== -1) {
      const suitCount = popcount(state.hands[currentTrickSeat(state.trick)] & (SUIT_MASK[move.calledPip] as number));
      score += suitCount <= 2 ? 45 : 20;
    } else if (move.calledPip !== -1) {
      score += popcount(state.hands[currentTrickSeat(state.trick)] & (SUIT_MASK[move.calledPip] as number)) * 6;
    }

    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

function bestLeadForAvoiding(state: GameState, moves: Move[]): Move {
  let hasTrump = false;
  for (const move of moves) {
    if ((TRUMP_RANK[move.tile] as number) !== -1) {
      hasTrump = true;
      break;
    }
  }

  let best = moves[0] as Move;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const move of moves) {
    if (hasTrump && (TRUMP_RANK[move.tile] as number) === -1) {
      continue;
    }

    const score = moveStrength(state.trick, move);
    if (score < bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

function cheapestWinningMove(state: GameState, seat: Seat, moves: Move[]): Move | undefined {
  let best: Move | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const move of moves) {
    if (!isCurrentlyWinning(state.trick, seat, move)) {
      continue;
    }

    const score = moveStrength(state.trick, move);
    if (score < bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

function highestLosingMove(state: GameState, seat: Seat, moves: Move[]): Move | undefined {
  let best: Move | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const move of moves) {
    if (isCurrentlyWinning(state.trick, seat, move)) {
      continue;
    }

    const score = moveDanger(state.trick, move);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

function lowestMove(trick: TrickState, moves: Move[]): Move {
  let best = moves[0] as Move;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const move of moves) {
    const score = moveStrength(trick, move);
    if (score < bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

function isCurrentlyWinning(trick: TrickState, seat: Seat, move: Move): boolean {
  const nextTrick = appendTrickMove(trick, seat, move);
  return trickWinner(nextTrick) === seat;
}

function moveStrength(trick: TrickState, move: Move): number {
  const trumpRank = TRUMP_RANK[move.tile] as number;
  if (trumpRank !== -1) {
    return 100 + trumpRank;
  }

  const pip = trick.isEmpty ? move.calledPip : trick.calledPip;
  if (pip !== -1) {
    return (PIP_RANK[pip] as Int8Array)[move.tile] as number;
  }

  return tilePipSum(move.tile);
}

function moveDanger(trick: TrickState, move: Move): number {
  const trumpRank = TRUMP_RANK[move.tile] as number;
  if (trumpRank !== -1) {
    return 100 + trumpRank;
  }

  return moveStrength(trick, move) * 4 + tilePipSum(move.tile);
}

function bestNaturalRank(tile: number, hand: number): number {
  const domino = getTile(tile);
  let best = -1;
  if (domino.a !== 1) {
    best = Math.max(best, (PIP_RANK[domino.a] as Int8Array)[tile] as number);
  }
  if (domino.b !== 1) {
    best = Math.max(best, (PIP_RANK[domino.b] as Int8Array)[tile] as number);
  }
  return (hand & TRUMP_MASK) !== 0 ? best : best + 1;
}

function aceLeadPip(tile: number): number {
  const domino = getTile(tile);
  return domino.a === domino.b ? domino.a : 0;
}

function tilePipSum(tile: number): number {
  const domino = getTile(tile);
  return domino.a + domino.b;
}

function clampBid(bid: number): number {
  if (bid < 0) {
    return 0;
  }
  if (bid > 7) {
    return 7;
  }
  return bid;
}

function forEachTile(mask: number, callback: (tile: number) => void): void {
  let remaining = mask;
  while (remaining !== 0) {
    const bit = remaining & -remaining;
    callback(Math.clz32(bit) ^ 31);
    remaining &= remaining - 1;
  }
}
