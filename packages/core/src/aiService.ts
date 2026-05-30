import {
  isAce,
  isTrump,
  tileContains,
  tileTotalValue,
  trumpPriority
} from "./dominoTile";
import { canPlayTile } from "./player";
import {
  highestTrumpPriorityInTrick,
  isStrongerTileWithContext
} from "./gameState";
import type { DominoTile, GameState, Player } from "./types";

export function makeAIBid(player: Player): number {
  const handStrength = evaluateHandStrength(player.hand);
  return calculateOptimalBid(player.hand, handStrength);
}

export function selectAITile(
  player: Player,
  gameState: GameState
): DominoTile {
  const validTiles = getValidTiles(player, gameState);
  if (validTiles.length === 0) {
    throw new Error("No valid tiles available for AI.");
  }

  return selectHardTile(player, gameState, validTiles);
}

export function selectNumber(tile: DominoTile, player: Player): number {
  if (tile.side1 === tile.side2) {
    return tile.side1;
  }

  const count1 = player.hand.filter((handTile) => tileContains(handTile, tile.side1)).length;
  const count2 = player.hand.filter((handTile) => tileContains(handTile, tile.side2)).length;
  return count1 >= count2 ? tile.side1 : tile.side2;
}

export function getValidTiles(player: Player, gameState: GameState): DominoTile[] {
  if (gameState.currentTrick.length === 0) {
    return [...player.hand];
  }

  return player.hand.filter((tile) =>
    canPlayTile(player, tile, {
      leadTile: gameState.leadTile,
      requiredNumber: gameState.requiredNumber,
      isTrumpLead: gameState.isTrumpLead,
      isAceLead: gameState.isAceLead,
      highestTrumpPriorityInTrick: highestTrumpPriorityInTrick(gameState)
    })
  );
}

function evaluateHandStrength(hand: readonly DominoTile[]): number {
  let strength = 0;
  for (const tile of hand) {
    if (isTrump(tile)) {
      strength += 15 - trumpPriority(tile);
    } else if (isAce(tile)) {
      strength += 8;
    } else {
      strength += 3;
    }
  }

  return Math.min(strength, 100);
}

function calculateOptimalBid(hand: readonly DominoTile[], strength: number): number {
  const trumpCount = hand.filter((tile) => isTrump(tile)).length;
  const highTrumps = hand.filter(
    (tile) => isTrump(tile) && trumpPriority(tile) < 3
  ).length;
  const aceCount = hand.filter((tile) => isAce(tile) && !isTrump(tile)).length;

  let bid = 0;
  bid += highTrumps;
  if (trumpCount > highTrumps) {
    bid += Math.floor((trumpCount - highTrumps) / 2);
  }
  bid += Math.floor(aceCount / 3);
  if (strength > 70) bid += 1;
  if (strength > 85) bid += 1;
  return Math.min(bid, 7);
}

function selectHardTile(
  player: Player,
  gameState: GameState,
  validTiles: DominoTile[]
): DominoTile {
  const tricksLeft = 7 - gameState.completedTricks.length;
  const tricksNeeded = player.bid - player.tricksWon;

  if (gameState.currentTrick.length === 0) {
    if (tricksNeeded > tricksLeft) return getStrongestTile(validTiles);
    if (tricksNeeded === 0) return getWeakestTile(validTiles);
    if (tricksNeeded === tricksLeft) return getStrongestTile(validTiles);
    return selectBalancedTile(validTiles);
  }

  const canWin = canWinTrick(validTiles, gameState);
  if (tricksNeeded > 0 && canWin) {
    return getWinningTile(validTiles, gameState);
  }

  if (tricksNeeded === 0 && canWin) {
    const weakest = getWeakestTile(validTiles);
    if (!wouldWinTrick(weakest, gameState)) {
      return weakest;
    }
    return weakest;
  }

  return getWeakestTile(validTiles);
}

function getStrongestTile(tiles: readonly DominoTile[]): DominoTile {
  let strongest = tiles[0];
  if (!strongest) throw new Error("Cannot select from an empty tile list.");

  for (const tile of tiles) {
    if (isTrump(tile) && !isTrump(strongest)) {
      strongest = tile;
    } else if (isTrump(tile) && isTrump(strongest)) {
      if (trumpPriority(tile) < trumpPriority(strongest)) {
        strongest = tile;
      }
    } else if (tileTotalValue(tile) > tileTotalValue(strongest)) {
      strongest = tile;
    }
  }
  return strongest;
}

function getWeakestTile(tiles: readonly DominoTile[]): DominoTile {
  let weakest = tiles[0];
  if (!weakest) throw new Error("Cannot select from an empty tile list.");

  for (const tile of tiles) {
    if (!isTrump(tile) && isTrump(weakest)) {
      weakest = tile;
    } else if (!isTrump(tile) && !isTrump(weakest)) {
      if (tileTotalValue(tile) < tileTotalValue(weakest)) {
        weakest = tile;
      }
    } else if (isTrump(tile) && isTrump(weakest)) {
      if (trumpPriority(tile) > trumpPriority(weakest)) {
        weakest = tile;
      }
    }
  }
  return weakest;
}

function selectBalancedTile(tiles: readonly DominoTile[]): DominoTile {
  const sorted = [...tiles].sort((a, b) => {
    const aValue = isTrump(a) ? 20 - trumpPriority(a) : tileTotalValue(a);
    const bValue = isTrump(b) ? 20 - trumpPriority(b) : tileTotalValue(b);
    return aValue - bValue;
  });
  return sorted[Math.floor(sorted.length / 2)]!;
}

function canWinTrick(tiles: readonly DominoTile[], gameState: GameState): boolean {
  return tiles.some((tile) => wouldWinTrick(tile, gameState));
}

function wouldWinTrick(tile: DominoTile, gameState: GameState): boolean {
  for (const played of gameState.currentTrick) {
    if (isStrongerTileForAi(played.tile, tile, gameState.requiredNumber)) {
      return false;
    }
  }
  return true;
}

function getWinningTile(tiles: readonly DominoTile[], gameState: GameState): DominoTile {
  const winningTiles = tiles.filter((tile) => wouldWinTrick(tile, gameState));
  return winningTiles.length === 0 ? getWeakestTile(tiles) : getWeakestTile(winningTiles);
}

function isStrongerTileForAi(
  tile1: DominoTile,
  tile2: DominoTile,
  requiredNumber: number | undefined
): boolean {
  return isStrongerTileWithContext(tile1, tile2, {
    requiredNumber,
    tile1IsAce: isAce(tile1),
    tile2IsAce: isAce(tile2),
    breakAceTiesByTotalValue: true
  });
}
