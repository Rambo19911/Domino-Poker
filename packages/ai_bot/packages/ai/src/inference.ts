import type { PlayerView, PlayEvent, Seat, SeatTuple } from "@domino-poker/engine";
import {
  ALL_TILES_MASK,
  SUIT_MASK,
  TRUMP_MASK,
  TRUMP_RANK,
  TRUMP_STRONGER_THAN,
  tileBit
} from "@domino-poker/engine";

export type Constraints = {
  perspective: Seat;
  possible: SeatTuple<number>;
  handCount: SeatTuple<number>;
  playedMask: number;
};

export function inferConstraints(view: PlayerView): Constraints {
  const playedBySeat: SeatTuple<number> = [0, 0, 0, 0];
  let playedMask = 0;
  for (const event of view.history) {
    playedBySeat[event.seat] += 1;
    playedMask |= tileBit(event.move.tile);
  }

  const possible: SeatTuple<number> = [
    ALL_TILES_MASK & ~view.hand,
    ALL_TILES_MASK & ~view.hand,
    ALL_TILES_MASK & ~view.hand,
    ALL_TILES_MASK & ~view.hand
  ];
  possible[view.seat] = view.hand;

  const constraints: Constraints = {
    perspective: view.seat,
    possible,
    handCount: [
      7 - playedBySeat[0],
      7 - playedBySeat[1],
      7 - playedBySeat[2],
      7 - playedBySeat[3]
    ],
    playedMask: 0
  };
  constraints.handCount[view.seat] = countBits(view.hand);

  for (const trick of groupHistoryByTrick(view.history)) {
    applyTrickObservations(constraints, trick);
  }

  for (let seat = 0; seat < 4; seat += 1) {
    constraints.possible[seat as Seat] &= ~constraints.playedMask;
  }
  constraints.possible[view.seat] = view.hand;

  return constraints;
}

function applyTrickObservations(constraints: Constraints, trick: PlayEvent[]): void {
  const lead = trick[0];
  if (lead === undefined) {
    return;
  }

  const leadTrumpRank = TRUMP_RANK[lead.move.tile] as number;
  const leadIsTrump = leadTrumpRank !== -1;
  let maxTrumpRank = leadTrumpRank;

  applyPlayedTile(constraints, lead.move.tile);

  for (let index = 1; index < trick.length; index += 1) {
    const event = trick[index] as PlayEvent;
    const playedTrumpRank = TRUMP_RANK[event.move.tile] as number;

    if (leadIsTrump) {
      if (playedTrumpRank === -1) {
        constraints.possible[event.seat] &= ~TRUMP_MASK;
      } else if (playedTrumpRank < maxTrumpRank) {
        constraints.possible[event.seat] &= ~(TRUMP_STRONGER_THAN[maxTrumpRank] as number);
      }

      if (playedTrumpRank > maxTrumpRank) {
        maxTrumpRank = playedTrumpRank;
      }
    } else {
      const calledPip = lead.move.calledPip;
      if (calledPip < 0 || calledPip > 6) {
        throw new Error(`Non-trump lead must have called pip 0..6: ${calledPip}`);
      }

      const followedSuit = ((SUIT_MASK[calledPip] as number) & tileBit(event.move.tile)) !== 0;
      if (!followedSuit) {
        constraints.possible[event.seat] &= ~(SUIT_MASK[calledPip] as number);
        if (playedTrumpRank === -1) {
          constraints.possible[event.seat] &= ~TRUMP_MASK;
        }
      }
    }

    applyPlayedTile(constraints, event.move.tile);
  }
}

function applyPlayedTile(constraints: Constraints, tile: number): void {
  const bit = tileBit(tile);
  constraints.playedMask |= bit;
  constraints.possible[0] &= ~bit;
  constraints.possible[1] &= ~bit;
  constraints.possible[2] &= ~bit;
  constraints.possible[3] &= ~bit;
}

function groupHistoryByTrick(history: PlayEvent[]): PlayEvent[][] {
  const tricks: PlayEvent[][] = [];
  for (const event of history) {
    const trick = tricks[event.trickNo] ?? [];
    trick[event.posInTrick] = event;
    tricks[event.trickNo] = trick;
  }
  return tricks;
}

function countBits(mask: number): number {
  let count = 0;
  let value = mask >>> 0;
  while (value !== 0) {
    value &= value - 1;
    count += 1;
  }
  return count;
}
