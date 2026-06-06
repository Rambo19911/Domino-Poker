import { selectAITile, selectNumber } from "../aiService";
import { tileEquals } from "../dominoTile";
import type { GameState } from "../types";
import { legalMoves, type MultiplayerLegalMove } from "./legalMoves";
import type { MultiplayerGameState } from "./types";

export interface MultiplayerAutoMove extends MultiplayerLegalMove {
  readonly playerId: string;
}

export function autoMove(
  state: MultiplayerGameState,
  playerId: string
): MultiplayerAutoMove | undefined {
  const allowedMoves = legalMoves(state, playerId);
  if (allowedMoves.length === 0) return undefined;

  const player = state.coreState.players.find((candidate) => candidate.id === playerId);
  if (!player) return undefined;

  const scopedState = createPlayerScopedCoreState(state.coreState, playerId);
  const preferredTile = selectAITile(player, scopedState);
  const preferredMoves = allowedMoves.filter((move) =>
    tileEquals(move.tile, preferredTile)
  );
  const selectedMove =
    selectDeclaredMove(preferredMoves, preferredTile, player) ?? allowedMoves[0]!;

  return {
    playerId,
    ...selectedMove
  };
}

function selectDeclaredMove(
  moves: readonly MultiplayerLegalMove[],
  preferredTile: MultiplayerLegalMove["tile"],
  player: GameState["players"][number]
): MultiplayerLegalMove | undefined {
  if (moves.length === 0) return undefined;
  if (moves.length === 1) return moves[0];

  const declaredNumber = selectNumber(preferredTile, player);
  return (
    moves.find((move) => move.declaredNumber === declaredNumber) ?? moves[0]
  );
}

function createPlayerScopedCoreState(
  state: GameState,
  playerId: string
): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? player : { ...player, hand: [] }
    )
  };
}
