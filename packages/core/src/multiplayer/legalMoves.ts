import { isTrump } from "../dominoTile";
import { highestTrumpPriorityInTrick } from "../gameState";
import { canPlayTile } from "../player";
import type { DominoTile } from "../types";
import type { MultiplayerGameState } from "./types";

export interface MultiplayerLegalMove {
  readonly tile: DominoTile;
  readonly declaredNumber?: number | undefined;
}

export function legalMoves(
  state: MultiplayerGameState,
  playerId: string
): MultiplayerLegalMove[] {
  if (state.coreState.phase !== "playing") return [];

  const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return [];

  const playableTiles = currentPlayer.hand.filter((tile) =>
    canPlayTile(currentPlayer, tile, {
      leadTile: state.coreState.leadTile,
      requiredNumber: state.coreState.requiredNumber,
      isTrumpLead: state.coreState.isTrumpLead,
      isAceLead: state.coreState.isAceLead,
      highestTrumpPriorityInTrick: highestTrumpPriorityInTrick(state.coreState)
    })
  );

  return playableTiles.flatMap((tile) => expandLeadDeclarations(state, tile));
}

function expandLeadDeclarations(
  state: MultiplayerGameState,
  tile: DominoTile
): MultiplayerLegalMove[] {
  if (
    state.coreState.currentTrick.length > 0 ||
    isTrump(tile) ||
    tile.side1 === tile.side2
  ) {
    return [{ tile }];
  }

  return uniqueNumbers(tile).map((declaredNumber) => ({
    tile,
    declaredNumber
  }));
}

function uniqueNumbers(tile: DominoTile): readonly number[] {
  return tile.side1 === tile.side2 ? [tile.side1] : [tile.side1, tile.side2];
}
