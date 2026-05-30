export type GameOutcome = "win" | "loss";

export interface StatsSummary {
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly winLossRatio: number | null;
  readonly started: number;
  readonly activeGames: number;
  readonly abandoned: number;
  readonly completed: number;
  readonly updatedAt: string | null;
}

export interface GameSessionStartResponse {
  readonly sessionId: string;
  readonly stats: StatsSummary;
}

export interface GameSessionMutationResponse {
  readonly stats: StatsSummary;
}
