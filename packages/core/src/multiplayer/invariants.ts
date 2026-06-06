import { tileKey } from "../dominoTile";
import type { DominoTile, GameState } from "../types";
import type { MultiplayerGameState } from "./types";

export class MultiplayerInvariantError extends Error {
  readonly violations: readonly string[];

  constructor(violations: readonly string[]) {
    super(`Multiplayer state invariant violation: ${violations.join("; ")}`);
    this.name = "MultiplayerInvariantError";
    this.violations = violations;
  }
}

export function assertInvariants(state: MultiplayerGameState): void {
  const violations = getInvariantViolations(state);
  if (violations.length > 0) {
    throw new MultiplayerInvariantError(violations);
  }
}

export function getInvariantViolations(
  state: MultiplayerGameState
): readonly string[] {
  const violations: string[] = [];

  if (state.gameId.trim() === "") {
    violations.push("gameId must not be empty.");
  }
  if (state.seed.trim() === "") {
    violations.push("seed must not be empty.");
  }
  if (!Number.isInteger(state.eventSeq) || state.eventSeq < 0) {
    violations.push("eventSeq must be a non-negative integer.");
  }

  collectPlayerViolations(state, violations);
  collectIndexViolations(state.coreState, violations);
  collectTurnViolations(state, violations);
  collectTileViolations(state.coreState, violations);

  return violations;
}

function collectPlayerViolations(
  state: MultiplayerGameState,
  violations: string[]
): void {
  if (state.players.length !== state.coreState.players.length) {
    violations.push("multiplayer player count must match core player count.");
  }

  const corePlayerIds = new Set(state.coreState.players.map((player) => player.id));
  const mpPlayerIds = new Set<string>();
  const seatIndexes = new Set<number>();

  state.players.forEach((player, index) => {
    if (!corePlayerIds.has(player.playerId)) {
      violations.push(`multiplayer player ${player.playerId} must exist in core players.`);
    }
    if (mpPlayerIds.has(player.playerId)) {
      violations.push(`duplicate multiplayer playerId ${player.playerId}.`);
    }
    mpPlayerIds.add(player.playerId);

    if (!Number.isInteger(player.seatIndex) || player.seatIndex < 0) {
      violations.push(`seatIndex for player ${player.playerId} must be a non-negative integer.`);
    } else if (seatIndexes.has(player.seatIndex)) {
      violations.push(`duplicate multiplayer seatIndex ${player.seatIndex}.`);
    }
    seatIndexes.add(player.seatIndex);

    const corePlayer = state.coreState.players[index];
    if (corePlayer && player.playerId !== corePlayer.id) {
      violations.push(
        `multiplayer player ${player.playerId} must match core player ${corePlayer.id} at seat ${index}.`
      );
    }
  });
}

function collectIndexViolations(
  coreState: GameState,
  violations: string[]
): void {
  if (coreState.players.length === 0) {
    violations.push("core players must not be empty.");
    return;
  }

  if (!isPlayerIndex(coreState, coreState.currentPlayerIndex)) {
    violations.push("currentPlayerIndex must reference an existing player.");
  }
  if (!isPlayerIndex(coreState, coreState.dealerIndex)) {
    violations.push("dealerIndex must reference an existing player.");
  }
  if (!isPlayerIndex(coreState, coreState.trickLeaderIndex)) {
    violations.push("trickLeaderIndex must reference an existing player.");
  }
  if (
    coreState.lastRoundWinnerIndex !== undefined &&
    !isPlayerIndex(coreState, coreState.lastRoundWinnerIndex)
  ) {
    violations.push("lastRoundWinnerIndex must reference an existing player.");
  }

  coreState.currentTrick.forEach((play) => {
    if (!isPlayerIndex(coreState, play.playerIndex)) {
      violations.push(`currentTrick playerIndex ${play.playerIndex} is out of bounds.`);
    }
  });
  coreState.completedTricks.forEach((trick, trickIndex) => {
    trick.forEach((play) => {
      if (!isPlayerIndex(coreState, play.playerIndex)) {
        violations.push(
          `completedTricks[${trickIndex}] playerIndex ${play.playerIndex} is out of bounds.`
        );
      }
    });
  });
  coreState.trickWinners.forEach((winnerIndex) => {
    if (!isPlayerIndex(coreState, winnerIndex)) {
      violations.push(`trick winner index ${winnerIndex} is out of bounds.`);
    }
  });
}

function collectTurnViolations(
  state: MultiplayerGameState,
  violations: string[]
): void {
  const turn = state.currentTurn;
  if (!turn) return;

  if (turn.turnId.trim() === "") {
    violations.push("currentTurn.turnId must not be empty.");
  }
  if (turn.playerId.trim() === "") {
    violations.push("currentTurn.playerId must not be empty.");
  }
  if (turn.phase !== state.coreState.phase) {
    violations.push("currentTurn.phase must match core phase.");
  }
  if (turn.startedAt > turn.deadlineAt) {
    violations.push("currentTurn.startedAt must not be after deadlineAt.");
  }

  const actionTypes = new Set(turn.allowedActionTypes);
  if (actionTypes.size !== turn.allowedActionTypes.length) {
    violations.push("currentTurn.allowedActionTypes must not contain duplicates.");
  }
  if (turn.allowedActionTypes.length === 0) {
    violations.push("currentTurn.allowedActionTypes must not be empty.");
  }

  const currentPlayer = state.coreState.players[state.coreState.currentPlayerIndex];
  if (!state.coreState.players.some((player) => player.id === turn.playerId)) {
    violations.push("currentTurn.playerId must reference an existing core player.");
  }
  if (
    (actionTypes.has("SUBMIT_BID") || actionTypes.has("SUBMIT_MOVE")) &&
    currentPlayer &&
    turn.playerId !== currentPlayer.id
  ) {
    violations.push("currentTurn player must match current core player for bid/move actions.");
  }
}

function collectTileViolations(
  coreState: GameState,
  violations: string[]
): void {
  const seenTiles = new Map<string, string>();

  coreState.players.forEach((player) => {
    player.hand.forEach((tile) =>
      collectTile(tile, `hand:${player.id}`, seenTiles, violations)
    );
  });
  coreState.currentTrick.forEach((play) =>
    collectTile(play.tile, `currentTrick:${play.playerIndex}`, seenTiles, violations)
  );
  coreState.completedTricks.forEach((trick, trickIndex) => {
    trick.forEach((play) =>
      collectTile(
        play.tile,
        `completedTricks:${trickIndex}:${play.playerIndex}`,
        seenTiles,
        violations
      )
    );
  });

  if (seenTiles.size !== 28) {
    violations.push(`round must contain exactly 28 unique tiles, found ${seenTiles.size}.`);
  }
}

function collectTile(
  tile: DominoTile,
  owner: string,
  seenTiles: Map<string, string>,
  violations: string[]
): void {
  const key = tileKey(tile);
  const previousOwner = seenTiles.get(key);
  if (previousOwner) {
    violations.push(`duplicate tile ${key} in ${previousOwner} and ${owner}.`);
    return;
  }

  seenTiles.set(key, owner);
}

function isPlayerIndex(coreState: GameState, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < coreState.players.length;
}
