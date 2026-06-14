import { score } from "./scoring.js";
import {
  type Move,
  type Seat,
  type TrickState,
  appendTrickMove,
  createEmptyTrick,
  currentTrickSeat,
  legalMoves,
  sameMove,
  trickWinner
} from "./rules.js";
import { ALL_TILES_MASK, popcount, tileBit } from "./tiles.js";

export type Phase = "BIDDING" | "PLAYING" | "SCORED";

export type SeatTuple<T> = [T, T, T, T];

export type PlayEvent = {
  seat: Seat;
  move: Move;
  trickNo: number;
  posInTrick: 0 | 1 | 2 | 3;
};

export type GameState = {
  hands: SeatTuple<number>;
  bids: SeatTuple<number>;
  taken: SeatTuple<number>;
  firstSeat: Seat;
  trick: TrickState;
  history: PlayEvent[];
  phase: Phase;
};

export type PlayerView = {
  seat: Seat;
  hand: number;
  bids: SeatTuple<number>;
  taken: SeatTuple<number>;
  firstSeat: Seat;
  trick: TrickState;
  history: PlayEvent[];
};

export type UndoToken = {
  previous: GameState;
};

export function createGameState(hands: SeatTuple<number>, firstSeat: Seat): GameState {
  validateHands(hands);
  return {
    hands: [...hands] as SeatTuple<number>,
    bids: [-1, -1, -1, -1],
    taken: [0, 0, 0, 0],
    firstSeat,
    trick: createEmptyTrick(firstSeat),
    history: [],
    phase: "BIDDING"
  };
}

export function createPlayerView(state: GameState, seat: Seat): PlayerView {
  return {
    seat,
    hand: state.hands[seat],
    bids: [...state.bids] as SeatTuple<number>,
    taken: [...state.taken] as SeatTuple<number>,
    firstSeat: state.firstSeat,
    trick: cloneTrick(state.trick),
    history: state.history.map(clonePlayEvent)
  };
}

export function applyBid(state: GameState, seat: Seat, bid: number): GameState {
  if (state.phase !== "BIDDING") {
    throw new Error(`Cannot bid during phase ${state.phase}.`);
  }

  if (!Number.isInteger(bid) || bid < 0 || bid > 7) {
    throw new RangeError(`Bid must be an integer from 0 to 7: ${bid}`);
  }

  const expectedSeat = ((state.firstSeat + countBids(state.bids)) & 3) as Seat;
  if (seat !== expectedSeat) {
    throw new Error(`Expected bid from seat ${expectedSeat}, got ${seat}.`);
  }

  if (state.bids[seat] !== -1) {
    throw new Error(`Seat ${seat} has already bid.`);
  }

  const next = cloneGameState(state);
  next.bids[seat] = bid;
  if (countBids(next.bids) === 4) {
    next.phase = "PLAYING";
  }

  return next;
}

export function applyMove(state: GameState, move: Move): GameState {
  const next = cloneGameState(state);
  applyMoveMutable(next, move);
  return next;
}

export function applyMoveInPlace(state: GameState, move: Move): UndoToken {
  const previous = cloneGameState(state);
  applyMoveMutable(state, move);
  return { previous };
}

export function undoMove(state: GameState, token: UndoToken): void {
  const previous = cloneGameState(token.previous);
  state.hands = previous.hands;
  state.bids = previous.bids;
  state.taken = previous.taken;
  state.firstSeat = previous.firstSeat;
  state.trick = previous.trick;
  state.history = previous.history;
  state.phase = previous.phase;
}

export function scores(state: GameState): SeatTuple<number> {
  if (state.phase !== "SCORED") {
    throw new Error(`Cannot score phase ${state.phase}.`);
  }

  return [
    score(state.bids[0], state.taken[0]),
    score(state.bids[1], state.taken[1]),
    score(state.bids[2], state.taken[2]),
    score(state.bids[3], state.taken[3])
  ];
}

export function cloneGameState(state: GameState): GameState {
  return {
    hands: [...state.hands] as SeatTuple<number>,
    bids: [...state.bids] as SeatTuple<number>,
    taken: [...state.taken] as SeatTuple<number>,
    firstSeat: state.firstSeat,
    trick: cloneTrick(state.trick),
    history: state.history.map(clonePlayEvent),
    phase: state.phase
  };
}

function applyMoveMutable(state: GameState, move: Move): void {
  if (state.phase !== "PLAYING") {
    throw new Error(`Cannot play during phase ${state.phase}.`);
  }

  const seat = currentTrickSeat(state.trick);
  const tileMask = tileBit(move.tile);
  if ((state.hands[seat] & tileMask) === 0) {
    throw new Error(`Seat ${seat} does not have tile ${move.tile}.`);
  }

  const legal = legalMoves(state.hands[seat], state.trick);
  if (!legal.some((candidate) => sameMove(candidate, move))) {
    throw new Error(`Illegal move ${move.tile}:${move.calledPip} for seat ${seat}.`);
  }

  state.hands[seat] &= ~tileMask;
  const nextTrick = appendTrickMove(state.trick, seat, move);
  const event: PlayEvent = {
    seat,
    move,
    trickNo: Math.floor(state.history.length / 4),
    posInTrick: state.trick.plays.length as 0 | 1 | 2 | 3
  };
  state.history.push(event);

  if (nextTrick.plays.length === 4) {
    const winner = trickWinner(nextTrick);
    state.taken[winner] += 1;
    state.trick = createEmptyTrick(winner);
    if (state.history.length === 28) {
      state.phase = "SCORED";
    }
    return;
  }

  state.trick = nextTrick;
}

function validateHands(hands: SeatTuple<number>): void {
  let combined = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    const hand = hands[seat] as number;
    if (popcount(hand) !== 7) {
      throw new Error(`Seat ${seat} must have exactly 7 tiles.`);
    }
    if ((combined & hand) !== 0) {
      throw new Error("Hands must not contain duplicate tiles.");
    }
    combined |= hand;
  }

  if (combined !== ALL_TILES_MASK) {
    throw new Error("Hands must contain every tile exactly once.");
  }
}

function countBids(bids: SeatTuple<number>): number {
  let count = 0;
  for (const bid of bids) {
    if (bid !== -1) {
      count += 1;
    }
  }
  return count;
}

function cloneTrick(trick: TrickState): TrickState {
  return {
    leader: trick.leader,
    plays: trick.plays.map((play) => ({ seat: play.seat, move: { ...play.move } })),
    calledPip: trick.calledPip,
    leadIsTrump: trick.leadIsTrump,
    maxTrumpRank: trick.maxTrumpRank,
    anyTrumpPlayed: trick.anyTrumpPlayed,
    isEmpty: trick.isEmpty
  };
}

function clonePlayEvent(event: PlayEvent): PlayEvent {
  return {
    seat: event.seat,
    move: { ...event.move },
    trickNo: event.trickNo,
    posInTrick: event.posInTrick
  };
}
