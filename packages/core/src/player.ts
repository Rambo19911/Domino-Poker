import {
  isTrump,
  tileContains,
  tileEquals,
  trumpPriority
} from "./dominoTile";
import type { AIDifficulty, DominoTile, Player, PlayerType } from "./types";

export interface CreatePlayerOptions {
  readonly id: string;
  readonly name: string;
  readonly isAI?: boolean | undefined;
  readonly aiDifficulty?: AIDifficulty | undefined;
  readonly playerType?: PlayerType | undefined;
}

export function createPlayer(options: CreatePlayerOptions): Player {
  return {
    id: options.id,
    name: options.name,
    isAI: options.isAI ?? false,
    aiDifficulty: options.aiDifficulty,
    playerType: options.playerType ?? "cpu",
    hand: [],
    bid: -1,
    tricksWon: 0,
    totalScore: 0,
    lastAiComment: null
  };
}

export function playerHasTile(player: Player, tile: DominoTile): boolean {
  return player.hand.some((handTile) => tileEquals(handTile, tile));
}

export function removeTileFromHand(
  hand: readonly DominoTile[],
  tile: DominoTile
): DominoTile[] {
  let removed = false;
  const nextHand = hand.filter((handTile) => {
    if (!removed && tileEquals(handTile, tile)) {
      removed = true;
      return false;
    }
    return true;
  });

  if (!removed) {
    throw new Error(`Cannot remove ${tile.side1}-${tile.side2}: tile is not in hand.`);
  }

  return nextHand;
}

export function resetPlayerRound(player: Player): Player {
  return {
    ...player,
    hand: [],
    bid: -1,
    tricksWon: 0,
    lastAiComment: null
  };
}

export interface CanPlayTileOptions {
  readonly leadTile?: DominoTile | undefined;
  readonly requiredNumber?: number | undefined;
  readonly isTrumpLead?: boolean | undefined;
  readonly isAceLead?: boolean | undefined;
  readonly highestTrumpPriorityInTrick?: number | undefined;
}

function canPlayRequiredTrump(
  player: Player,
  tile: DominoTile,
  targetPriority: number | undefined
): boolean {
  if (!isTrump(tile)) return false;
  if (targetPriority === undefined) return true;

  const hasStrongerTrump = player.hand.some(
    (handTile) => isTrump(handTile) && trumpPriority(handTile) < targetPriority
  );

  if (!hasStrongerTrump) return true;

  return trumpPriority(tile) < targetPriority;
}

export function canPlayTile(
  player: Player,
  tile: DominoTile,
  options: CanPlayTileOptions = {}
): boolean {
  if (!playerHasTile(player, tile)) return false;
  const { leadTile, requiredNumber, isTrumpLead = false, isAceLead = false } = options;

  if (!leadTile) return true;

  if (isTrumpLead) {
    const hasTrump = player.hand.some((handTile) => isTrump(handTile));
    if (!hasTrump) return true;

    const targetPriority =
      options.highestTrumpPriorityInTrick ?? trumpPriority(leadTile);
    return canPlayRequiredTrump(player, tile, targetPriority);
  }

  if (isAceLead) {
    if (requiredNumber === undefined) {
      throw new Error("Ace lead requires a required number.");
    }

    const hasRequired = player.hand.some(
      (handTile) => tileContains(handTile, requiredNumber) && !isTrump(handTile)
    );
    if (hasRequired) {
      return tileContains(tile, requiredNumber) && !isTrump(tile);
    }

    const hasTrump = player.hand.some((handTile) => isTrump(handTile));
    return hasTrump
      ? canPlayRequiredTrump(player, tile, options.highestTrumpPriorityInTrick)
      : true;
  }

  if (requiredNumber !== undefined) {
    const hasRequired = player.hand.some(
      (handTile) => tileContains(handTile, requiredNumber) && !isTrump(handTile)
    );
    if (hasRequired) {
      return tileContains(tile, requiredNumber) && !isTrump(tile);
    }

    const hasTrump = player.hand.some((handTile) => isTrump(handTile));
    return hasTrump
      ? canPlayRequiredTrump(player, tile, options.highestTrumpPriorityInTrick)
      : true;
  }

  return true;
}

export function calculateRoundScore(player: Pick<Player, "bid" | "tricksWon">): number {
  if (player.bid === player.tricksWon) {
    if (player.bid === 7) {
      return 7 * 15 + 50;
    }
    return player.bid * 15;
  }

  if (player.tricksWon > player.bid) {
    return player.tricksWon * 5;
  }

  if (player.bid === 7) {
    return -50;
  }

  return (player.tricksWon - player.bid) * 5;
}
