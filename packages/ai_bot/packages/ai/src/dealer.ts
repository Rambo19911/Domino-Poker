import type { Rng, Seat, SeatTuple } from "@domino-poker/engine";
import { ALL_TILES_MASK, tileBit } from "@domino-poker/engine";
import type { Constraints } from "./inference.js";
import { estimateExpectedTricks } from "./rollout.js";
import { bidProbability, type OpponentProfile } from "./profiling.js";

export type DealSample = {
  hands: SeatTuple<number>;
};

export type WeightedBidder = {
  seat: Seat;
  bid: number;
  profile: OpponentProfile;
};

export type WeightModel = {
  firstSeat: Seat;
  bidders: WeightedBidder[];
};

export const DEFAULT_WEIGHT_CANDIDATES = 16;

// Bayes-weighted determinization (plan 4.2B/C): draw K constraint-valid candidate deals and keep
// one with probability proportional to how plausibly each already-bid opponent would have made
// their bid given the hand it received. Reuses sampleDeal so no dealing logic is duplicated.
export function sampleWeightedDeal(
  constraints: Constraints,
  model: WeightModel,
  rng: Rng,
  candidates = DEFAULT_WEIGHT_CANDIDATES
): DealSample {
  // Weighted reservoir sampling (one pass, no candidate array retained).
  let chosen = sampleDeal(constraints, rng).hands;
  let totalWeight = weightOfDeal(chosen, model);

  for (let index = 1; index < candidates; index += 1) {
    const candidate = sampleDeal(constraints, rng).hands;
    const weight = weightOfDeal(candidate, model);
    totalWeight += weight;
    if (totalWeight > 0 && rng() * totalWeight < weight) {
      chosen = candidate;
    }
  }

  return { hands: chosen };
}

function weightOfDeal(hands: SeatTuple<number>, model: WeightModel): number {
  let weight = 1;
  for (const bidder of model.bidders) {
    const expected = estimateExpectedTricks(hands[bidder.seat], bidder.seat, model.firstSeat);
    weight *= bidProbability(bidder.bid, expected, bidder.profile);
  }
  return weight;
}

export function sampleDeal(constraints: Constraints, rng: Rng): DealSample {
  const hands: SeatTuple<number> = [0, 0, 0, 0];
  const remaining: SeatTuple<number> = [
    constraints.handCount[0],
    constraints.handCount[1],
    constraints.handCount[2],
    constraints.handCount[3]
  ];

  const ownSeat = constraints.perspective;
  hands[ownSeat] = constraints.possible[ownSeat];
  remaining[ownSeat] = 0;

  const unknownTiles = collectUnknownTiles(ALL_TILES_MASK & ~constraints.playedMask & ~hands[ownSeat]);
  const candidateMasks = new Int8Array(28);
  let unconstrainedMask = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    if (remaining[seat as Seat] > 0) {
      unconstrainedMask |= 1 << seat;
    }
  }

  let allUnconstrained = true;
  for (const tile of unknownTiles) {
    const mask = candidateMaskForTile(tile, constraints, remaining);
    if (mask === 0) {
      throw new Error(`No candidate seat for tile ${tile}.`);
    }
    candidateMasks[tile] = mask;
    if (mask !== unconstrainedMask) {
      allUnconstrained = false;
    }
  }

  if (allUnconstrained) {
    dealUnconstrained(unknownTiles, hands, remaining, rng);
    return { hands };
  }

  const orderedTiles = [...unknownTiles].sort((left, right) => countMask(candidateMasks[left] as number) - countMask(candidateMasks[right] as number));
  if (!assignConstrained(0, orderedTiles, candidateMasks, hands, remaining, rng)) {
    throw new Error("Unable to sample a deal satisfying constraints.");
  }

  return { hands };
}

export function validateDealSample(sample: DealSample, constraints: Constraints): boolean {
  let combined = constraints.playedMask;
  for (let seat = 0; seat < 4; seat += 1) {
    const typedSeat = seat as Seat;
    const hand = sample.hands[typedSeat];
    if (countBits(hand) !== constraints.handCount[typedSeat]) {
      return false;
    }
    if ((hand & ~constraints.possible[typedSeat]) !== 0) {
      return false;
    }
    if ((combined & hand) !== 0) {
      return false;
    }
    combined |= hand;
  }

  return combined === ALL_TILES_MASK;
}

function dealUnconstrained(tiles: number[], hands: SeatTuple<number>, remaining: SeatTuple<number>, rng: Rng): void {
  shuffleInPlace(tiles, rng);
  let index = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    const typedSeat = seat as Seat;
    for (let count = 0; count < remaining[typedSeat]; count += 1) {
      hands[typedSeat] |= tileBit(tiles[index] as number);
      index += 1;
    }
    remaining[typedSeat] = 0;
  }
}

function assignConstrained(
  index: number,
  tiles: number[],
  candidateMasks: Int8Array,
  hands: SeatTuple<number>,
  remaining: SeatTuple<number>,
  rng: Rng
): boolean {
  if (index === tiles.length) {
    return remaining[0] === 0 && remaining[1] === 0 && remaining[2] === 0 && remaining[3] === 0;
  }

  const tile = tiles[index] as number;
  const seats = shuffledCandidateSeats(candidateMasks[tile] as number, remaining, rng);
  for (const seat of seats) {
    const bit = tileBit(tile);
    hands[seat] |= bit;
    remaining[seat] -= 1;
    if (assignConstrained(index + 1, tiles, candidateMasks, hands, remaining, rng)) {
      return true;
    }
    remaining[seat] += 1;
    hands[seat] &= ~bit;
  }

  return false;
}

function candidateMaskForTile(tile: number, constraints: Constraints, remaining: SeatTuple<number>): number {
  const bit = tileBit(tile);
  let mask = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    const typedSeat = seat as Seat;
    if (remaining[typedSeat] > 0 && (constraints.possible[typedSeat] & bit) !== 0) {
      mask |= 1 << seat;
    }
  }
  return mask;
}

function shuffledCandidateSeats(mask: number, remaining: SeatTuple<number>, rng: Rng): Seat[] {
  const seats: Seat[] = [];
  for (let seat = 0; seat < 4; seat += 1) {
    const typedSeat = seat as Seat;
    if ((mask & (1 << seat)) !== 0 && remaining[typedSeat] > 0) {
      seats.push(typedSeat);
    }
  }
  shuffleInPlace(seats, rng);
  return seats;
}

function collectUnknownTiles(mask: number): number[] {
  const tiles: number[] = [];
  let remaining = mask;
  while (remaining !== 0) {
    const bit = remaining & -remaining;
    tiles.push(Math.clz32(bit) ^ 31);
    remaining &= remaining - 1;
  }
  return tiles;
}

function shuffleInPlace<T>(values: T[], rng: Rng): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const value = values[index] as T;
    values[index] = values[swapIndex] as T;
    values[swapIndex] = value;
  }
}

function countMask(mask: number): number {
  let count = 0;
  let value = mask;
  while (value !== 0) {
    value &= value - 1;
    count += 1;
  }
  return count;
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
