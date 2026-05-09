import type {
  GameOutcome,
  GameSessionMutationResponse,
  GameSessionStartResponse,
  StatsSummary
} from "./types";

const statsStorageKey = "domino-poker-local-stats";
const activeSessionsStorageKey = "domino-poker-active-sessions";

export async function fetchStatsSummary(): Promise<StatsSummary> {
  return readStats();
}

export async function startStatsSession(): Promise<GameSessionStartResponse> {
  const sessionId = crypto.randomUUID();
  const stats = mutateStats((current) => ({
    ...current,
    started: current.started + 1,
    activeGames: current.activeGames + 1,
    updatedAt: new Date().toISOString()
  }));
  writeActiveSessions([...readActiveSessions(), sessionId]);
  return { sessionId, stats };
}

export async function finishStatsSession(
  sessionId: string,
  outcome: GameOutcome
): Promise<GameSessionMutationResponse> {
  return { stats: finishSession(sessionId, outcome) };
}

export async function abandonStatsSession(
  sessionId: string,
  reason: string
): Promise<GameSessionMutationResponse> {
  void reason;
  return { stats: abandonSession(sessionId) };
}

export function sendAbandonStatsBeacon(sessionId: string, reason: string): boolean {
  void reason;
  abandonSession(sessionId);
  return true;
}

function finishSession(sessionId: string, outcome: GameOutcome): StatsSummary {
  if (!consumeActiveSession(sessionId)) return readStats();
  return mutateStats((current) =>
    normalizeStats({
      ...current,
      gamesPlayed: current.gamesPlayed + 1,
      completed: current.completed + 1,
      activeGames: Math.max(0, current.activeGames - 1),
      wins: current.wins + (outcome === "win" ? 1 : 0),
      losses: current.losses + (outcome === "loss" ? 1 : 0),
      updatedAt: new Date().toISOString()
    })
  );
}

function abandonSession(sessionId: string): StatsSummary {
  if (!consumeActiveSession(sessionId)) return readStats();
  return mutateStats((current) =>
    normalizeStats({
      ...current,
      gamesPlayed: current.gamesPlayed + 1,
      abandoned: current.abandoned + 1,
      activeGames: Math.max(0, current.activeGames - 1),
      losses: current.losses + 1,
      updatedAt: new Date().toISOString()
    })
  );
}

function mutateStats(mutator: (stats: StatsSummary) => StatsSummary): StatsSummary {
  const nextStats = normalizeStats(mutator(readStats()));
  window.localStorage.setItem(statsStorageKey, JSON.stringify(nextStats));
  return nextStats;
}

function readStats(): StatsSummary {
  if (typeof window === "undefined") return createEmptyStats();
  const rawStats = window.localStorage.getItem(statsStorageKey);
  if (!rawStats) return createEmptyStats();

  try {
    return normalizeStats(JSON.parse(rawStats));
  } catch {
    return createEmptyStats();
  }
}

function createEmptyStats(): StatsSummary {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    winLossRatio: null,
    started: 0,
    activeGames: 0,
    abandoned: 0,
    completed: 0,
    updatedAt: null
  };
}

function normalizeStats(value: unknown): StatsSummary {
  const candidate =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Partial<StatsSummary>)
      : {};
  const wins = safeNumber(candidate.wins);
  const losses = safeNumber(candidate.losses);
  const completed = safeNumber(candidate.completed);
  const abandoned = safeNumber(candidate.abandoned);
  const gamesPlayed = Math.max(completed + abandoned, safeNumber(candidate.gamesPlayed));
  return {
    gamesPlayed,
    wins,
    losses,
    winRate: gamesPlayed > 0 ? wins / gamesPlayed : 0,
    winLossRatio: losses === 0 ? (wins > 0 ? wins : null) : wins / losses,
    started: safeNumber(candidate.started),
    activeGames: safeNumber(candidate.activeGames),
    abandoned,
    completed,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : null
  };
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function readActiveSessions(): string[] {
  if (typeof window === "undefined") return [];
  const rawSessions = window.localStorage.getItem(activeSessionsStorageKey);
  if (!rawSessions) return [];

  try {
    const sessions = JSON.parse(rawSessions);
    return Array.isArray(sessions)
      ? sessions.filter((session): session is string => typeof session === "string")
      : [];
  } catch {
    return [];
  }
}

function writeActiveSessions(sessionIds: readonly string[]): void {
  window.localStorage.setItem(activeSessionsStorageKey, JSON.stringify([...new Set(sessionIds)]));
}

function consumeActiveSession(sessionId: string): boolean {
  const sessions = readActiveSessions();
  if (!sessions.includes(sessionId)) return false;
  writeActiveSessions(sessions.filter((session) => session !== sessionId));
  return true;
}
