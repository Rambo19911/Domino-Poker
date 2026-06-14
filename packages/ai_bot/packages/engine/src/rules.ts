import {
  PIP_RANK,
  SUIT_MASK,
  TILE_COUNT,
  TRUMP_MASK,
  TRUMP_RANK,
  TRUMP_STRONGER_THAN,
  getTile,
  isTrump,
  tileBit
} from "./tiles.js";

export type Seat = 0 | 1 | 2 | 3;

export type Move = {
  tile: number;
  calledPip: number | -1;
};

export type TrickPlay = {
  seat: Seat;
  move: Move;
};

export type TrickState = {
  leader: Seat;
  plays: TrickPlay[];
  calledPip: number | -1;
  leadIsTrump: boolean;
  maxTrumpRank: number;
  anyTrumpPlayed: boolean;
  isEmpty: boolean;
};

const FOLLOW_MOVES: Move[] = Array.from({ length: TILE_COUNT }, (_, tile) => ({ tile, calledPip: -1 }));
const LEAD_MOVES: Move[][] = Array.from({ length: TILE_COUNT }, (_, tile) => {
  if (isTrump(tile)) {
    return [FOLLOW_MOVES[tile] as Move];
  }

  const { a, b } = getTile(tile);
  if (a === b) {
    return [{ tile, calledPip: a }];
  }

  return [
    { tile, calledPip: a },
    { tile, calledPip: b }
  ];
});

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) & 3) as Seat;
}

export function seatOffset(seat: Seat, offset: number): Seat {
  return ((seat + offset) & 3) as Seat;
}

export function createEmptyTrick(leader: Seat): TrickState {
  return {
    leader,
    plays: [],
    calledPip: -1,
    leadIsTrump: false,
    maxTrumpRank: -1,
    anyTrumpPlayed: false,
    isEmpty: true
  };
}

export function currentTrickSeat(trick: TrickState): Seat {
  return seatOffset(trick.leader, trick.plays.length);
}

export function appendTrickMove(trick: TrickState, seat: Seat, move: Move): TrickState {
  if (trick.plays.length >= 4) {
    throw new Error("Cannot add a move to a completed trick.");
  }

  if (seat !== currentTrickSeat(trick)) {
    throw new Error(`Expected seat ${currentTrickSeat(trick)}, got ${seat}.`);
  }

  if (trick.isEmpty) {
    const leadIsTrump = isTrump(move.tile);
    validateLeadMove(move, leadIsTrump);
    const maxTrumpRank = leadIsTrump ? TRUMP_RANK[move.tile] as number : -1;
    return {
      leader: trick.leader,
      plays: [{ seat, move }],
      calledPip: leadIsTrump ? -1 : move.calledPip,
      leadIsTrump,
      maxTrumpRank,
      anyTrumpPlayed: leadIsTrump,
      isEmpty: false
    };
  }

  const rank = TRUMP_RANK[move.tile] as number;
  const maxTrumpRank = rank > trick.maxTrumpRank ? rank : trick.maxTrumpRank;
  return {
    leader: trick.leader,
    plays: [...trick.plays, { seat, move: FOLLOW_MOVES[move.tile] as Move }],
    calledPip: trick.calledPip,
    leadIsTrump: trick.leadIsTrump,
    maxTrumpRank,
    anyTrumpPlayed: trick.anyTrumpPlayed || rank !== -1,
    isEmpty: false
  };
}

export function legalMoves(hand: number, trick: TrickState, out: Move[] = []): Move[] {
  out.length = 0;

  if (trick.isEmpty) {
    return movesFrom(hand, true, out);
  }

  if (trick.leadIsTrump) {
    const stronger = hand & (TRUMP_STRONGER_THAN[trick.maxTrumpRank] as number);
    if (stronger !== 0) {
      return movesFrom(stronger, false, out);
    }

    const anyTrump = hand & TRUMP_MASK;
    if (anyTrump !== 0) {
      return movesFrom(anyTrump, false, out);
    }

    return movesFrom(hand, false, out);
  }

  if (trick.calledPip < 0 || trick.calledPip > 6) {
    throw new Error(`Non-trump lead must have called pip 0..6: ${trick.calledPip}`);
  }

  const suit = hand & (SUIT_MASK[trick.calledPip] as number);
  if (suit !== 0) {
    return movesFrom(suit, false, out);
  }

  const anyTrump = hand & TRUMP_MASK;
  if (anyTrump !== 0) {
    return movesFrom(anyTrump, false, out);
  }

  return movesFrom(hand, false, out);
}

export function trickWinner(trick: TrickState): Seat {
  if (trick.isEmpty) {
    throw new Error("Cannot determine winner of an empty trick.");
  }

  let winningSeat = trick.plays[0]?.seat;
  if (winningSeat === undefined) {
    throw new Error("Cannot determine winner of a trick without plays.");
  }

  if (trick.anyTrumpPlayed) {
    let bestRank = -1;
    for (const play of trick.plays) {
      const rank = TRUMP_RANK[play.move.tile] as number;
      if (rank > bestRank) {
        bestRank = rank;
        winningSeat = play.seat;
      }
    }
    return winningSeat;
  }

  if (trick.calledPip < 0 || trick.calledPip > 6) {
    throw new Error(`Non-trump trick must have called pip 0..6: ${trick.calledPip}`);
  }

  const ranks = PIP_RANK[trick.calledPip] as Int8Array;
  let bestRank = -1;
  for (const play of trick.plays) {
    const rank = ranks[play.move.tile] as number;
    if (rank > bestRank) {
      bestRank = rank;
      winningSeat = play.seat;
    }
  }

  return winningSeat;
}

export function moveKey(move: Move): string {
  return `${move.tile}:${move.calledPip}`;
}

export function sameMove(left: Move, right: Move): boolean {
  return left.tile === right.tile && left.calledPip === right.calledPip;
}

function movesFrom(mask: number, isLead: boolean, out: Move[]): Move[] {
  let remaining = mask;
  while (remaining !== 0) {
    const bit = remaining & -remaining;
    const tile = Math.clz32(bit) ^ 31;
    if (isLead) {
      for (const move of LEAD_MOVES[tile] as Move[]) {
        out.push(move);
      }
    } else {
      out.push(FOLLOW_MOVES[tile] as Move);
    }
    remaining &= remaining - 1;
  }

  return out;
}

function validateLeadMove(move: Move, leadIsTrump: boolean): void {
  if (leadIsTrump) {
    if (move.calledPip !== -1) {
      throw new Error("Trump lead must use calledPip -1.");
    }
    return;
  }

  const tile = getTile(move.tile);
  if (move.calledPip !== tile.a && move.calledPip !== tile.b) {
    throw new Error(`Lead calledPip ${move.calledPip} is not present on tile ${tile.a}-${tile.b}.`);
  }

  if ((tileBit(move.tile) & (SUIT_MASK[move.calledPip] as number)) === 0) {
    throw new Error(`Tile ${tile.a}-${tile.b} cannot lead pip ${move.calledPip}.`);
  }
}
