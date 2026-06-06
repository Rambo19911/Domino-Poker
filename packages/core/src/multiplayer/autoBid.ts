import { makeAIBid } from "../aiService";
import type { MultiplayerGameState } from "./types";
import { legalBids } from "./legalBids";

export interface MultiplayerAutoBid {
  readonly playerId: string;
  readonly bid: number;
}

export function autoBid(
  state: MultiplayerGameState,
  playerId: string
): MultiplayerAutoBid | undefined {
  const allowedBids = legalBids(state, playerId);
  if (allowedBids.length === 0) return undefined;

  const player = state.coreState.players.find((candidate) => candidate.id === playerId);
  if (!player) return undefined;

  const preferredBid = makeAIBid(player);
  return {
    playerId,
    bid: allowedBids.includes(preferredBid) ? preferredBid : allowedBids[0]!
  };
}
