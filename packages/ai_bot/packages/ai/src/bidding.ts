import type { GameState, PlayerView, Rng, Seat, SeatTuple } from "@domino-poker/engine";
import {
  applyBid,
  applyMoveInPlace,
  createGameState,
  currentTrickSeat,
  mulberry32,
  score
} from "@domino-poker/engine";
import { sampleDeal } from "./dealer.js";
import { inferConstraints } from "./inference.js";
import { chooseRolloutBid, chooseRolloutMove } from "./rollout.js";

export type BidEvaluation = {
  bid: number;
  averageScore: number;
  variance: number;
};

export type BidStats = {
  samples: number;
  evaluations: BidEvaluation[];
};

export type ChooseBidOptions = {
  samples?: number;
};

export const DEFAULT_BID_SAMPLES = 5000;

export function chooseBid(view: PlayerView, rng: Rng, options: ChooseBidOptions = {}): { bid: number; stats: BidStats } {
  const samples = options.samples ?? DEFAULT_BID_SAMPLES;
  if (!Number.isInteger(samples) || samples <= 0) {
    throw new RangeError(`Bid sample count must be a positive integer: ${samples}`);
  }

  const constraints = inferConstraints(view);
  const deals: SeatTuple<number>[] = [];
  for (let index = 0; index < samples; index += 1) {
    deals.push(sampleDeal(constraints, rng).hands);
  }

  const evaluations: BidEvaluation[] = [];
  for (let bid = 0; bid <= 7; bid += 1) {
    let sum = 0;
    let sumSquares = 0;
    for (let sampleIndex = 0; sampleIndex < deals.length; sampleIndex += 1) {
      // Common random numbers: the rollout RNG stream depends only on the deal,
      // not on the candidate bid. Every candidate replays the same deal from the
      // same RNG state, so EV[b] differences reflect the bid, not RNG noise (4.4 step 2).
      const simulationSeed = ((view.seat + 1) * 0x1000000 + sampleIndex) >>> 0;
      const taken = simulateCandidateBid(view, deals[sampleIndex] as SeatTuple<number>, bid, mulberry32(simulationSeed));
      const value = score(bid, taken);
      sum += value;
      sumSquares += value * value;
    }

    const averageScore = sum / deals.length;
    evaluations.push({
      bid,
      averageScore,
      variance: sumSquares / deals.length - averageScore * averageScore
    });
  }

  let best = evaluations[0] as BidEvaluation;
  for (let index = 1; index < evaluations.length; index += 1) {
    const candidate = evaluations[index] as BidEvaluation;
    if (
      candidate.averageScore > best.averageScore ||
      (candidate.averageScore === best.averageScore && candidate.variance < best.variance)
    ) {
      best = candidate;
    }
  }

  return { bid: best.bid, stats: { samples, evaluations } };
}

export type InclusionBidEvaluation = {
  bid: number;
  hitRate: number;
  averageScore: number;
};

// Inclusion-oriented bidder (project acceptance goal): pick the bid the bot can most reliably
// land (taken == bid) under its own bid-aware play, breaking near-ties toward the more valuable
// (higher) bid. Unlike chooseBid (which maximizes expected score and is happy to bid 0 and then
// over-take), this targets the taken==bid criterion directly while still preferring value.
export function chooseInclusionBid(
  view: PlayerView,
  rng: Rng,
  options: ChooseBidOptions & { evTolerance?: number } = {}
): { bid: number; stats: { samples: number; evaluations: InclusionBidEvaluation[] } } {
  const samples = options.samples ?? DEFAULT_BID_SAMPLES;
  if (!Number.isInteger(samples) || samples <= 0) {
    throw new RangeError(`Bid sample count must be a positive integer: ${samples}`);
  }
  // Bids whose expected score is within evTolerance of the best are treated as statistically
  // indistinguishable (acceptance criterion 1); among those we take the most hittable one.
  const evTolerance = options.evTolerance ?? 8;

  const constraints = inferConstraints(view);
  const deals: SeatTuple<number>[] = [];
  for (let index = 0; index < samples; index += 1) {
    deals.push(sampleDeal(constraints, rng).hands);
  }

  const evaluations: InclusionBidEvaluation[] = [];
  for (let bid = 0; bid <= 7; bid += 1) {
    let hits = 0;
    let scoreSum = 0;
    for (let sampleIndex = 0; sampleIndex < deals.length; sampleIndex += 1) {
      const simulationSeed = ((view.seat + 1) * 0x1000000 + sampleIndex) >>> 0;
      const taken = simulateCandidateBid(view, deals[sampleIndex] as SeatTuple<number>, bid, mulberry32(simulationSeed));
      if (taken === bid) {
        hits += 1;
      }
      scoreSum += score(bid, taken);
    }
    evaluations.push({ bid, hitRate: hits / deals.length, averageScore: scoreSum / deals.length });
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  for (const evaluation of evaluations) {
    if (evaluation.averageScore > bestScore) {
      bestScore = evaluation.averageScore;
    }
  }
  // Among the EV-indistinguishable bids (criterion 1), take the most hittable (criterion 2),
  // breaking ties toward the higher (more valuable) bid.
  let best = evaluations[0] as InclusionBidEvaluation;
  let bestEligibleHit = -1;
  for (const evaluation of evaluations) {
    if (evaluation.averageScore < bestScore - evTolerance) {
      continue;
    }
    if (evaluation.hitRate > bestEligibleHit || (evaluation.hitRate === bestEligibleHit && evaluation.bid > best.bid)) {
      bestEligibleHit = evaluation.hitRate;
      best = evaluation;
    }
  }

  return { bid: best.bid, stats: { samples, evaluations } };
}

function simulateCandidateBid(view: PlayerView, hands: SeatTuple<number>, candidateBid: number, rng: Rng): number {
  let state = createGameState(hands, view.firstSeat);

  for (let offset = 0; offset < 4; offset += 1) {
    const seat = ((view.firstSeat + offset) & 3) as Seat;
    const knownBid = view.bids[seat];
    const bid = seat === view.seat
      ? candidateBid
      : knownBid !== -1
        ? knownBid
        : chooseRolloutBid(hands[seat], seat, view.firstSeat);
    state = applyBid(state, seat, bid);
  }

  while (state.phase === "PLAYING") {
    applyMoveInPlace(state, chooseRolloutMove(state, rng));
  }

  return state.taken[view.seat];
}

export function chooseMcBidOnly(view: PlayerView, rng: Rng, options: ChooseBidOptions = {}): number {
  return chooseBid(view, rng, options).bid;
}
