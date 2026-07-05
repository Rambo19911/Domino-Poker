import { jsonInit, requestJson, type AuthResult } from "../auth/authApi";

/**
 * Klienta puses nedēļas uzdevumu HTTP API (pret servera `/weekly/*`). Mirror `dailyApi.ts`.
 * Serveris ir autoritatīvs: progress, sliekšņi + summas nāk no servera; klients tikai rāda.
 * DTO atspoguļo servera `WeeklyTasksState`. Progress ir COUNT-based (`progress` + `threshold`).
 */

export type WeeklyDifficulty = "medium" | "hard" | "epic";
export type WeeklyVariant = "weekly_bosses";
export type WeeklyTaskKind = "mp_finish" | "sp_win";

export interface WeeklyTaskView {
  readonly id: string;
  readonly kind: WeeklyTaskKind;
  readonly difficulty?: WeeklyDifficulty;
  readonly variant?: WeeklyVariant;
  readonly exactRounds?: number;
  readonly threshold: number;
  readonly rewardCoins: number;
  readonly hasPlayButton: boolean;
  /** Count-based: `min(threshold, count)`. */
  readonly progress: number;
  readonly claimed: boolean;
  readonly claimable: boolean;
}

export interface WeeklyTasksView {
  readonly serverWeek: string;
  readonly secondsUntilReset: number;
  readonly tasks: readonly WeeklyTaskView[];
  readonly anyClaimable: boolean;
}

export interface WeeklyClaimView {
  readonly awarded: number;
  readonly balance: number;
  readonly alreadyClaimed: boolean;
  readonly state: WeeklyTasksView;
}

/** Ielasa nedēļas uzdevumu stāvokli (auth). */
export function apiWeeklyTasks(token: string): Promise<AuthResult<WeeklyTasksView>> {
  return requestJson<WeeklyTasksView>("/weekly/tasks", jsonInit("GET", undefined, token));
}

/** Savāc uzdevuma balvu (auth). 409 → `not_met`; 400 → nederīgs id. */
export function apiClaimWeeklyTask(
  token: string,
  taskId: string
): Promise<AuthResult<WeeklyClaimView>> {
  return requestJson<WeeklyClaimView>("/weekly/tasks/claim", jsonInit("POST", { taskId }, token));
}
