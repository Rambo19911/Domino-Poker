import type { MultiplayerGameState } from "./types";

export function legalBids(
  state: MultiplayerGameState,
  playerId: string
): readonly number[] {
  if (state.coreState.phase !== "bidding") return [];

  const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return [];

  return [0, 1, 2, 3, 4, 5, 6, 7];
}
