import { jsonInit, requestJson, type AuthResult } from "../auth/authApi";

/**
 * Klienta puses dienas uzdevumu HTTP API (pret servera `/daily/*`). Atkārtoti lieto auth
 * `requestJson`/`jsonInit` (viena HTTP bāze + Bearer tokens). Anonīmie nesaņem neko (401).
 * Serveris ir autoritatīvs: progress, sliekšņi + summas nāk no servera; klients tikai rāda.
 * DTO atspoguļo servera `DailyTasksState` (serverī nav shared; definēts šeit, kā `spReward`).
 */

export type DailyDifficulty = "medium" | "hard" | "epic";

export interface DailyTaskView {
  readonly id: string;
  readonly difficulty: DailyDifficulty;
  readonly threshold: number;
  readonly rewardCoins: number;
  readonly order: number;
  /** Šodienas uzvaras (ierobežots ar `threshold`). */
  readonly progress: number;
  readonly claimed: boolean;
  readonly unlocked: boolean;
  readonly claimable: boolean;
}

export interface DailyTasksView {
  readonly serverDay: string;
  readonly secondsUntilReset: number;
  readonly tasks: readonly DailyTaskView[];
  readonly anyClaimable: boolean;
}

export interface DailyClaimView {
  readonly awarded: number;
  readonly balance: number;
  readonly alreadyClaimed: boolean;
  readonly state: DailyTasksView;
}

/** Ielasa dienas uzdevumu stāvokli (auth). */
export function apiDailyTasks(token: string): Promise<AuthResult<DailyTasksView>> {
  return requestJson<DailyTasksView>("/daily/tasks", jsonInit("GET", undefined, token));
}

/** Savāc uzdevuma balvu (auth). 409 → `locked`/`not_met`; 400 → nederīgs id. */
export function apiClaimDailyTask(
  token: string,
  taskId: string
): Promise<AuthResult<DailyClaimView>> {
  return requestJson<DailyClaimView>("/daily/tasks/claim", jsonInit("POST", { taskId }, token));
}
