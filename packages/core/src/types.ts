export type AIDifficulty = "easy" | "medium" | "hard";
export type PlayerType = "human" | "cpu";
export type GamePhase = "bidding" | "playing" | "roundEnd" | "gameEnd";

export interface DominoTile {
  readonly side1: number;
  readonly side2: number;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly isAI: boolean;
  readonly aiDifficulty?: AIDifficulty | undefined;
  readonly playerType: PlayerType;
  readonly hand: readonly DominoTile[];
  readonly bid: number;
  readonly tricksWon: number;
  readonly totalScore: number;
  readonly lastAiComment?: string | null | undefined;
}

export interface PlayedTile {
  readonly tile: DominoTile;
  readonly playerIndex: number;
  readonly declaredNumber?: number | undefined;
}

export interface TrickValidation {
  readonly isValid: boolean;
  readonly actualWinnerIndex: number;
  readonly expectedWinnerIndex: number;
  readonly errorMessage?: string | undefined;
}

export interface GameState {
  readonly players: readonly Player[];
  readonly currentPlayerIndex: number;
  readonly dealerIndex: number;
  readonly currentRound: number;
  readonly totalRounds: number;
  readonly phase: GamePhase;
  readonly lastRoundWinnerIndex?: number | undefined;
  readonly currentTrick: readonly PlayedTile[];
  readonly trickLeaderIndex: number;
  readonly leadTile?: DominoTile | undefined;
  readonly requiredNumber?: number | undefined;
  readonly isTrumpLead: boolean;
  readonly isAceLead: boolean;
  readonly completedTricks: readonly (readonly PlayedTile[])[];
  readonly trickWinners: readonly number[];
  readonly trickValidations: readonly TrickValidation[];
}

export interface NewGameOptions {
  readonly playerName?: string | undefined;
  readonly numberOfRounds?: number | undefined;
  readonly aiDifficulty?: AIDifficulty | undefined;
  readonly dealerIndex?: number | undefined;
  readonly deck?: readonly DominoTile[] | undefined;
  readonly rng?: (() => number) | undefined;
}
