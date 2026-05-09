import {
  isAce,
  isSpecialTile,
  isTrump,
  shuffleSet,
  tileContains,
  tileEquals,
  trumpPriority
} from "./dominoTile";
import {
  calculateRoundScore,
  canPlayTile,
  createPlayer,
  removeTileFromHand,
  resetPlayerRound
} from "./player";
import type {
  AIDifficulty,
  DominoTile,
  GameState,
  NewGameOptions,
  PlayerType,
  PlayedTile,
  Player,
  TrickValidation
} from "./types";

export interface PlayTileResult {
  readonly state: GameState;
  readonly trickComplete: boolean;
}

interface GamePlayerOptions {
  readonly id: string;
  readonly name: string;
  readonly isAI: boolean;
  readonly aiDifficulty?: AIDifficulty | undefined;
  readonly playerType: PlayerType;
}

const minNumberOfRounds = 1;
const maxNumberOfRounds = 50;

export function createNewGame(options: NewGameOptions = {}): GameState {
  const playerName = options.playerName ?? "You";
  const aiDifficulty: AIDifficulty = options.aiDifficulty ?? "hard";
  const totalRounds = validateNumberOfRounds(options.numberOfRounds ?? 7);

  const players = createGamePlayers(createDefaultPlayerOptions(playerName, aiDifficulty), aiDifficulty);

  const dealerIndex =
    options.dealerIndex ?? Math.floor((options.rng ?? Math.random)() * players.length);
  const deck = [...(options.deck ?? shuffleSet(options.rng))];
  const dealtPlayers = dealPlayers(players, deck);

  return {
    players: dealtPlayers,
    currentPlayerIndex: (dealerIndex + 1) % players.length,
    dealerIndex,
    currentRound: 1,
    totalRounds,
    phase: "bidding",
    currentTrick: [],
    trickLeaderIndex: 0,
    isTrumpLead: false,
    isAceLead: false,
    completedTricks: [],
    trickWinners: [],
    trickValidations: []
  };
}

function createDefaultPlayerOptions(
  playerName: string,
  aiDifficulty: AIDifficulty
): readonly GamePlayerOptions[] {
  return [
    { id: "1", name: playerName, isAI: false, playerType: "human" },
    { id: "2", name: "AI 1", isAI: true, aiDifficulty, playerType: "cpu" },
    { id: "3", name: "AI 2", isAI: true, aiDifficulty, playerType: "cpu" },
    { id: "4", name: "AI 3", isAI: true, aiDifficulty, playerType: "cpu" }
  ];
}

function createGamePlayers(
  playerOptions: readonly GamePlayerOptions[],
  defaultAiDifficulty: AIDifficulty
): Player[] {
  const seenIds = new Set<string>();
  return playerOptions.map((player, index) => {
    const id = player.id.trim();
    const name = player.name.trim();
    if (!id) throw new Error(`Player ${index + 1} must have an id.`);
    if (!name) throw new Error(`Player ${index + 1} must have a name.`);
    if (seenIds.has(id)) throw new Error(`Duplicate player id: ${id}.`);
    seenIds.add(id);

    const isAI = player.isAI ?? false;
    return createPlayer({
      id,
      name,
      isAI,
      aiDifficulty: isAI ? player.aiDifficulty ?? defaultAiDifficulty : player.aiDifficulty,
      playerType: player.playerType ?? (isAI ? "cpu" : "human")
    });
  });
}

function validateNumberOfRounds(numberOfRounds: number): number {
  if (
    !Number.isInteger(numberOfRounds) ||
    numberOfRounds < minNumberOfRounds ||
    numberOfRounds > maxNumberOfRounds
  ) {
    throw new Error(
      `Number of rounds must be an integer from ${minNumberOfRounds} to ${maxNumberOfRounds}. Received ${numberOfRounds}.`
    );
  }

  return numberOfRounds;
}

export function makeBid(state: GameState, bid: number): GameState {
  if (state.phase !== "bidding") return state;
  if (!Number.isInteger(bid) || bid < 0 || bid > 7) {
    throw new Error(`Bid must be an integer from 0 to 7. Received ${bid}.`);
  }

  const biddingPlayer = state.players[state.currentPlayerIndex];
  assertPlayer(biddingPlayer, state.currentPlayerIndex);

  const players = replacePlayer(state.players, state.currentPlayerIndex, {
    ...biddingPlayer,
    bid
  });
  const nextState = { ...state, players };

  if (players.every((player) => player.bid >= 0)) {
    return {
      ...nextState,
      phase: "playing",
      currentPlayerIndex: state.dealerIndex
    };
  }

  return {
    ...nextState,
    currentPlayerIndex: nextPlayerIndex(state, state.currentPlayerIndex)
  };
}

export function playTile(
  state: GameState,
  tile: DominoTile,
  declaredNumber?: number
): PlayTileResult {
  if (state.phase !== "playing") {
    return { state, trickComplete: false };
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  assertPlayer(currentPlayer, state.currentPlayerIndex);

  if (
    !canPlayTile(currentPlayer, tile, {
      leadTile: state.leadTile,
      requiredNumber: state.requiredNumber,
      isTrumpLead: state.isTrumpLead,
      isAceLead: state.isAceLead,
      highestTrumpPriorityInTrick: highestTrumpPriorityInTrick(state)
    })
  ) {
    return { state, trickComplete: false };
  }

  if (
    state.currentTrick.length === 0 &&
    !isTrump(tile) &&
    tile.side1 !== tile.side2 &&
    declaredNumber === undefined
  ) {
    return { state, trickComplete: false };
  }

  if (declaredNumber !== undefined && !tileContains(tile, declaredNumber)) {
    throw new Error(`Declared number ${declaredNumber} is not on ${tile.side1}-${tile.side2}.`);
  }

  const playedTile: PlayedTile = {
    tile,
    playerIndex: state.currentPlayerIndex,
    ...(declaredNumber !== undefined ? { declaredNumber } : {})
  };

  const currentTrick = [...state.currentTrick, playedTile];
  let nextState: GameState = {
    ...state,
    players: replacePlayer(state.players, state.currentPlayerIndex, {
      ...currentPlayer,
      hand: removeTileFromHand(currentPlayer.hand, tile),
      lastAiComment: null
    }),
    currentTrick
  };

  if (state.currentTrick.length === 0) {
    const leadPatch = getLeadPatch(state, tile, declaredNumber);
    nextState = {
      ...nextState,
      ...leadPatch
    };
  }

  if (currentTrick.length === state.players.length) {
    return { state: nextState, trickComplete: true };
  }

  return {
    state: {
      ...nextState,
      currentPlayerIndex: nextPlayerIndex(state, state.currentPlayerIndex)
    },
    trickComplete: false
  };
}

export function completeTrick(state: GameState): GameState {
  if (state.currentTrick.length !== state.players.length) {
    return state;
  }

  const winnerIndex = determineTrickWinner(state);
  const validation = validateTrickWinner(state, winnerIndex);
  const winner = state.players[winnerIndex];
  assertPlayer(winner, winnerIndex);

  const players = replacePlayer(state.players, winnerIndex, {
    ...winner,
    tricksWon: winner.tricksWon + 1
  });

  const nextState: GameState = {
    ...state,
    players,
    currentPlayerIndex: winnerIndex,
    currentTrick: [],
    completedTricks: [...state.completedTricks, [...state.currentTrick]],
    trickWinners: [...state.trickWinners, winnerIndex],
    trickValidations: [...state.trickValidations, validation],
    leadTile: undefined,
    requiredNumber: undefined,
    isTrumpLead: false,
    isAceLead: false
  };

  if (nextState.completedTricks.length === 7) {
    return completeRound(nextState);
  }

  return nextState;
}

export function startNextRound(
  state: GameState,
  deck: readonly DominoTile[] = shuffleSet()
): GameState {
  if (state.phase !== "roundEnd") return state;

  if (state.currentRound >= state.totalRounds) {
    return { ...state, phase: "gameEnd" };
  }

  const dealerIndex =
    state.currentRound >= 1 && state.lastRoundWinnerIndex !== undefined
      ? state.lastRoundWinnerIndex
      : state.dealerIndex;

  const resetPlayers = state.players.map(resetPlayerRound);
  return {
    ...state,
    players: dealPlayers(resetPlayers, deck),
    dealerIndex,
    currentRound: state.currentRound + 1,
    currentPlayerIndex: (dealerIndex + 1) % state.players.length,
    phase: "bidding",
    currentTrick: [],
    completedTricks: [],
    trickWinners: [],
    trickValidations: [],
    leadTile: undefined,
    requiredNumber: undefined,
    isTrumpLead: false,
    isAceLead: false
  };
}

export function getWinner(state: GameState): Player | undefined {
  if (state.phase !== "gameEnd") return undefined;
  return state.players.reduce((winner, player) =>
    player.totalScore > winner.totalScore ? player : winner
  );
}

export function highestTrumpPriorityInTrick(state: GameState): number | undefined {
  let bestPriority: number | undefined;
  for (const play of state.currentTrick) {
    if (isTrump(play.tile)) {
      const priority = trumpPriority(play.tile);
      if (bestPriority === undefined || priority < bestPriority) {
        bestPriority = priority;
      }
    }
  }
  return bestPriority;
}

export function determineTrickWinner(state: GameState): number {
  const firstPlay = state.currentTrick[0];
  if (!firstPlay) {
    throw new Error("Cannot determine trick winner without played tiles.");
  }

  let winningPlay = firstPlay;
  for (const play of state.currentTrick) {
    if (isStrongerTile(state, play.tile, winningPlay.tile)) {
      winningPlay = play;
    }
  }

  return winningPlay.playerIndex;
}

export function isStrongerTile(
  state: Pick<GameState, "currentTrick" | "requiredNumber">,
  tile1: DominoTile,
  tile2: DominoTile
): boolean {
  const play1 = state.currentTrick.find((play) => tileEquals(play.tile, tile1));
  const play2 = state.currentTrick.find((play) => tileEquals(play.tile, tile2));

  const tile1IsTrump = isTrump(tile1);
  const tile2IsTrump = isTrump(tile2);

  if (tile1IsTrump && !tile2IsTrump) return true;
  if (!tile1IsTrump && tile2IsTrump) return false;

  if (tile1IsTrump && tile2IsTrump) {
    return trumpPriority(tile1) < trumpPriority(tile2);
  }

  if (state.requiredNumber === undefined) {
    return false;
  }

  const tile1HasRequired = tileContains(tile1, state.requiredNumber);
  const tile2HasRequired = tileContains(tile2, state.requiredNumber);

  if (tile1HasRequired && !tile2HasRequired) return true;
  if (!tile1HasRequired && tile2HasRequired) return false;
  if (!tile1HasRequired && !tile2HasRequired) return false;

  const tile1IsActualAce = isPlayedAsAce(state.requiredNumber, tile1, play1);
  const tile2IsActualAce = isPlayedAsAce(state.requiredNumber, tile2, play2);

  if (tile1IsActualAce && !tile2IsActualAce) return true;
  if (!tile1IsActualAce && tile2IsActualAce) return false;
  if (tile1IsActualAce && tile2IsActualAce) return false;

  const tile1OtherSide = getOtherSide(tile1, state.requiredNumber);
  const tile2OtherSide = getOtherSide(tile2, state.requiredNumber);
  return tile1OtherSide > tile2OtherSide;
}

function getLeadPatch(
  state: GameState,
  tile: DominoTile,
  declaredNumber: number | undefined
): Partial<GameState> {
  if (isTrump(tile)) {
    return {
      leadTile: tile,
      trickLeaderIndex: state.currentPlayerIndex,
      isTrumpLead: true,
      isAceLead: false,
      requiredNumber: undefined
    };
  }

  if (isAce(tile)) {
    return {
      leadTile: tile,
      trickLeaderIndex: state.currentPlayerIndex,
      isTrumpLead: false,
      isAceLead: true,
      requiredNumber: declaredNumber ?? tile.side1
    };
  }

  return {
    leadTile: tile,
    trickLeaderIndex: state.currentPlayerIndex,
    isTrumpLead: false,
    isAceLead: false,
    requiredNumber: declaredNumber
  };
}

function validateTrickWinner(
  state: GameState,
  actualWinnerIndex: number
): TrickValidation {
  const expectedWinnerIndex = determineTrickWinner(state);
  const isValid = actualWinnerIndex === expectedWinnerIndex;
  if (isValid) {
    return { isValid, actualWinnerIndex, expectedWinnerIndex };
  }

  const expectedWinner = state.players[expectedWinnerIndex];
  const actualWinner = state.players[actualWinnerIndex];
  return {
    isValid,
    actualWinnerIndex,
    expectedWinnerIndex,
    errorMessage: `Expected ${expectedWinner?.name ?? expectedWinnerIndex}, but got ${
      actualWinner?.name ?? actualWinnerIndex
    }`
  };
}

function completeRound(state: GameState): GameState {
  let highestRoundScore = Number.NEGATIVE_INFINITY;
  let roundTopCandidates: number[] = [];

  const scoredPlayers = state.players.map((player, index) => {
    const roundScore = calculateRoundScore(player);
    if (roundScore > highestRoundScore) {
      highestRoundScore = roundScore;
      roundTopCandidates = [index];
    } else if (roundScore === highestRoundScore) {
      roundTopCandidates.push(index);
    }
    return {
      ...player,
      totalScore: player.totalScore + roundScore
    };
  });

  const lastRoundWinnerIndex =
    roundTopCandidates.length > 0
      ? chooseRoundWinnerByTiebreakers(state, roundTopCandidates)
      : state.lastRoundWinnerIndex;

  return {
    ...state,
    players: scoredPlayers,
    lastRoundWinnerIndex,
    phase: "roundEnd"
  };
}

function chooseRoundWinnerByTiebreakers(
  state: GameState,
  candidates: readonly number[]
): number {
  const byBid = keepBest(candidates, (index) => state.players[index]?.bid ?? -1);
  if (byBid.length === 1) return byBid[0]!;

  const byTricks = keepBest(byBid, (index) => state.players[index]?.tricksWon ?? -1);
  if (byTricks.length === 1) return byTricks[0]!;

  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const index = (state.dealerIndex + offset) % state.players.length;
    if (byTricks.includes(index)) return index;
  }

  return byTricks[0] ?? candidates[0] ?? 0;
}

function keepBest(
  candidates: readonly number[],
  getValue: (index: number) => number
): number[] {
  let best = Number.NEGATIVE_INFINITY;
  let filtered: number[] = [];
  for (const index of candidates) {
    const value = getValue(index);
    if (value > best) {
      best = value;
      filtered = [index];
    } else if (value === best) {
      filtered.push(index);
    }
  }
  return filtered;
}

function isPlayedAsAce(
  requiredNumber: number | undefined,
  tile: DominoTile,
  play: PlayedTile | undefined
): boolean {
  if (!isSpecialTile(tile)) {
    return isAce(tile);
  }

  if (play?.declaredNumber !== undefined) {
    return play.declaredNumber === 0;
  }

  if (requiredNumber !== undefined) {
    return requiredNumber === 0;
  }

  return true;
}

function getOtherSide(tile: DominoTile, requiredNumber: number): number {
  if (tile.side1 === requiredNumber) return tile.side2;
  if (tile.side2 === requiredNumber) return tile.side1;
  return tile.side1;
}

function nextPlayerIndex(state: Pick<GameState, "players">, index: number): number {
  return (index + 1) % state.players.length;
}

function dealPlayers(players: readonly Player[], deck: readonly DominoTile[]): Player[] {
  if (deck.length < players.length * 7) {
    throw new Error(`A full round requires ${players.length * 7} tiles.`);
  }

  return players.map((player, playerIndex) => ({
    ...player,
    hand: deck.slice(playerIndex * 7, playerIndex * 7 + 7)
  }));
}

function replacePlayer(
  players: readonly Player[],
  index: number,
  player: Player
): Player[] {
  return players.map((existing, existingIndex) =>
    existingIndex === index ? player : existing
  );
}

function assertPlayer(player: Player | undefined, index: number): asserts player is Player {
  if (!player) {
    throw new Error(`Player index ${index} does not exist.`);
  }
}
