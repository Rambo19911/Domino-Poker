import type { PlayEvent, Seat, SeatTuple } from "@domino-poker/engine";
import { ACE_MASK, TRUMP_MASK, tileBit } from "@domino-poker/engine";
import { estimateExpectedTricks } from "./rollout.js";

// Human profiling (plan 4.6). A completed game exposes every hand (all 28 tiles were played),
// so profiles are pure functions of public post-game records - no cheating. Profiles feed the
// dealer's Bayes weights (4.2B, via bidProbability) and rollout opponent tendencies.

export type OpponentProfile = {
  games: number;
  bidBias: number; // average (bid - estimated expected tricks)
  bidSigma: number; // spread of that residual, floored at MIN_BID_SIGMA
  leadAceEarly: number; // fraction of tricks-1/2 leads that were aces
  trumpHold: number; // fraction of the seat's trumps played in the last two tricks
};

export type GameRecord = {
  firstSeat: Seat;
  bids: SeatTuple<number>;
  history: PlayEvent[];
};

const MIN_BID_SIGMA = 0.5;
const SQRT_2PI = Math.sqrt(2 * Math.PI);

export const DEFAULT_PROFILE: OpponentProfile = {
  games: 0,
  bidBias: 0,
  bidSigma: 1,
  leadAceEarly: 0,
  trumpHold: 0
};

export function computeProfile(games: GameRecord[], seat: Seat): OpponentProfile {
  let residualSum = 0;
  let residualSquares = 0;
  let bidCount = 0;
  let earlyLeads = 0;
  let earlyLeadAces = 0;
  let totalTrumps = 0;
  let lateTrumps = 0;

  for (const game of games) {
    let hand = 0;
    for (const event of game.history) {
      if (event.seat !== seat) {
        continue;
      }
      const bit = tileBit(event.move.tile);
      hand |= bit;
      if ((TRUMP_MASK & bit) !== 0) {
        totalTrumps += 1;
        if (event.trickNo >= 5) {
          lateTrumps += 1;
        }
      }
      if (event.posInTrick === 0 && event.trickNo <= 1) {
        earlyLeads += 1;
        if ((ACE_MASK & bit) !== 0) {
          earlyLeadAces += 1;
        }
      }
    }

    const bid = game.bids[seat];
    if (bid >= 0) {
      const residual = bid - estimateExpectedTricks(hand, seat, game.firstSeat);
      residualSum += residual;
      residualSquares += residual * residual;
      bidCount += 1;
    }
  }

  const bidBias = bidCount > 0 ? residualSum / bidCount : 0;
  const variance = bidCount > 0 ? Math.max(residualSquares / bidCount - bidBias * bidBias, 0) : 0;

  return {
    games: bidCount,
    bidBias,
    bidSigma: Math.max(Math.sqrt(variance), MIN_BID_SIGMA),
    leadAceEarly: earlyLeads > 0 ? earlyLeadAces / earlyLeads : 0,
    trumpHold: totalTrumps > 0 ? lateTrumps / totalTrumps : 0
  };
}

// Likelihood that a seat with the given expected-tricks estimate would announce `bid`, under a
// normal model centred on the profile's bias (4.2B). Used to weight determinizations.
export function bidProbability(bid: number, expectedTricks: number, profile: OpponentProfile): number {
  const mean = expectedTricks + profile.bidBias;
  const z = (bid - mean) / profile.bidSigma;
  return Math.exp(-0.5 * z * z) / (profile.bidSigma * SQRT_2PI);
}
