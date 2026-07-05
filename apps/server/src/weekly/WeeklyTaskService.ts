import {
  WEEKLY_TASKS,
  WEEKLY_TASK_PLACEMENT_MAX,
  type CoinDifficulty,
  type SpVariant,
  type WeeklyTask,
  type WeeklyTaskKind
} from "@domino-poker/shared";

import type { PlayerStatsStore } from "../storage/PlayerStatsStore.js";
import type { Clock } from "../timers/TurnTimerScheduler.js";
import type { WalletService } from "../wallet/WalletService.js";

/**
 * Nedēļas uzdevumu (Weekly Tasks) lietišķais serviss (sk. `docs/TODO/weekly-tasks-plan.md`).
 * Paplašina dienas uzdevumu modeli; serveris ir autoritatīvs, route slānis tikai orķestrē.
 *
 * Atšķirības no dienas uzdevumiem:
 *   - LOGS = UTC nedēļa (pirmdiena 00:00 → nākamā pirmdiena), nevis diena.
 *   - PROGRESS ir COUNT-based (`min(threshold, count)`), nevis binārs.
 *   - SAVĀKŠANA ir NEATKARĪGA (nav secīga; katru savāc, tiklīdz izpildīts).
 *   - Divi uzdevumu tipi: `mp_finish` (jebkura pabeigta MP spēle logā) un `sp_win`
 *     (SP uzvara ar TIEŠU raundu skaitu + variant filtru; anti-abuse min-ilgums skalēts pēc raundiem).
 * SAVĀKŠANA = ledger rinda (`creditWeeklyTaskReward`, reason `weekly_task_reward`, ref
 * `weekly:{pirmdienas-yyyymmdd}:{taskId}`), idempotenta pēc `UNIQUE(user_id, reason, ref)`.
 *
 * ANTI-ABUSE ATLIKUŠAIS RISKS (pieņemts, tāds pats līmenis kā SP balvām): SP `placement` UN
 * `variant` ir klienta-deklarēti (`/sp/start` + `/sp/complete`). Round-skalētais min-ilguma vārts
 * (`spMinDurationMs`) bloķē momentānus start→complete skriptus, BET ne fabricētu vietu/variantu.
 * Pilns labojums = servera puses spēles replay/verifikācija — ārpus apjoma. MP uzdevumam nav
 * min-vārtu (īpašnieka lēmums; maza balva). Sk. `project_context/ai_rules.md` → "Weekly Tasks".
 */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Nedēļas uzdevumu funkcijas palaišanas laiks (UTC pirmdiena, ms). `windowStart =
 * max(weekStart, šis)` → uzvaras/spēles PIRMS palaišanas neskaitās.
 *
 * **SVARĪGI:** šai vērtībai JĀBŪT pirmdienai, kas ir ≤ pašreizējā nedēļa, citādi tekošās
 * nedēļas logs kļūst TUKŠS (`windowStart == weekEnd`) un NEVIENA spēle neskaitās (tas bija
 * bugs: 2026-07-06 bija NĀKAMĀ pirmdiena pret testa datumu 2026-07-05 → tukšs logs). Nedēļas
 * uzdevumi ir jauna funkcija bez vēsturiskiem datiem, tāpēc drošs "grīdas" datums der.
 * **Deployot iestatīt uz deploy nedēļas pirmdienu (UTC).** 2026-06-29 ir pirmdiena.
 */
export const FEATURE_LAUNCH_EPOCH_MS = Date.UTC(2026, 5, 29); // 2026-06-29T00:00:00Z (pirmdiena)

/**
 * SP uzvaru anti-abuse min-ilgums skalēts pēc raundiem: `max(FLOOR, PER_ROUND * exactRounds)`.
 * 30 raundi → 30s; 50 raundi → 50s. Bloķē momentānus skriptus, NEbloķējot reālu spēli
 * (īpašnieka epic-50 temps ~72s). Tunable; serverī tikai (klients nesūta). MP uzdevumam
 * ilguma vārtu NAV (MP `duration_ms` = NULL; īpašnieka lēmums — maza balva).
 */
export const WEEKLY_TASK_MIN_MS_PER_ROUND = 1000;
export const WEEKLY_TASK_MIN_GAME_MS_FLOOR = 8000;

/** Viena nedēļas uzdevuma stāvoklis UI formā. */
export interface WeeklyTaskState {
  readonly id: string;
  readonly kind: WeeklyTaskKind;
  readonly difficulty?: CoinDifficulty;
  readonly variant?: SpVariant;
  readonly exactRounds?: number;
  readonly threshold: number;
  readonly rewardCoins: number;
  readonly hasPlayButton: boolean;
  /** Count-based: `min(threshold, count)`. */
  readonly progress: number;
  readonly claimed: boolean;
  /** `progress >= threshold && !claimed` (bez secības — neatkarīgi). */
  readonly claimable: boolean;
}

/** Pilns nedēļas uzdevumu stāvoklis (viens GET). */
export interface WeeklyTasksState {
  /** UTC pirmdienas atslēga `yyyymmdd` (klients var rādīt / kešot). */
  readonly serverWeek: string;
  /** Sekundes līdz nākamajai pirmdienas 00:00 UTC atiestatīšanai. */
  readonly secondsUntilReset: number;
  readonly tasks: readonly WeeklyTaskState[];
  /** Vismaz viens uzdevums savācams (ikonas pulsēšanai). */
  readonly anyClaimable: boolean;
}

export type WeeklyClaimResult =
  | {
      readonly ok: true;
      /** Faktiski piešķirtās monētas (0, ja jau bija savākts). */
      readonly awarded: number;
      readonly balance: number;
      readonly alreadyClaimed: boolean;
      readonly state: WeeklyTasksState;
    }
  | { readonly ok: false; readonly reason: "unknown_task" | "not_met" };

export interface WeeklyTaskServiceOptions {
  readonly stats: Pick<PlayerStatsStore, "countMpFinishedSince" | "countSpTaskWins">;
  readonly wallet: Pick<
    WalletService,
    "listWeeklyTaskClaims" | "creditWeeklyTaskReward" | "getBalance"
  >;
  readonly clock: Clock;
  /** Testiem injicējams; noklusējums `FEATURE_LAUNCH_EPOCH_MS`. */
  readonly launchEpochMs?: number;
  /** Testiem injicējams; noklusējums `WEEKLY_TASK_MIN_MS_PER_ROUND`. */
  readonly minMsPerRound?: number;
  /** Testiem injicējams; noklusējums `WEEKLY_TASK_MIN_GAME_MS_FLOOR`. */
  readonly minGameMsFloor?: number;
}

/** UTC dienas sākums (ms). */
function utcDayStart(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

/** UTC nedēļas sākums (pirmdiena 00:00, ms). `getUTCDay()`: 0=svētdiena → pārkārto uz 0=pirmdiena. */
function utcWeekStart(now: number): number {
  const dayStart = utcDayStart(now);
  const mondayIndexed = (new Date(dayStart).getUTCDay() + 6) % 7; // 0=pirmd .. 6=svētd
  return dayStart - mondayIndexed * DAY_MS;
}

/** Pirmdienas datuma atslēga `yyyymmdd` (ledger ref daļa + klienta serverWeek). */
function utcWeekKey(now: number): string {
  const d = new Date(utcWeekStart(now));
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}${mm}${dd}`;
}

/** Ledger `ref` konkrētam uzdevumam konkrētā UTC nedēļā. */
function claimRef(weekKey: string, taskId: string): string {
  return `weekly:${weekKey}:${taskId}`;
}

export class WeeklyTaskService {
  private readonly stats: WeeklyTaskServiceOptions["stats"];
  private readonly wallet: WeeklyTaskServiceOptions["wallet"];
  private readonly clock: Clock;
  private readonly launchEpochMs: number;
  private readonly minMsPerRound: number;
  private readonly minGameMsFloor: number;
  /** Per-lietotāja ķēde (serializē check-then-act; pašattīrās). */
  private readonly userChains = new Map<string, Promise<void>>();

  constructor(options: WeeklyTaskServiceOptions) {
    this.stats = options.stats;
    this.wallet = options.wallet;
    this.clock = options.clock;
    this.launchEpochMs = options.launchEpochMs ?? FEATURE_LAUNCH_EPOCH_MS;
    this.minMsPerRound = options.minMsPerRound ?? WEEKLY_TASK_MIN_MS_PER_ROUND;
    this.minGameMsFloor = options.minGameMsFloor ?? WEEKLY_TASK_MIN_GAME_MS_FLOOR;
  }

  private withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.userChains.get(userId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.then(
      () => undefined,
      () => undefined
    );
    this.userChains.set(userId, tail);
    void tail.then(() => {
      if (this.userChains.get(userId) === tail) {
        this.userChains.delete(userId);
      }
    });
    return run;
  }

  /** SP min-ilguma vārti šim raundu skaitam (anti-abuse; skalēts + grīda). */
  private spMinDurationMs(exactRounds: number): number {
    return Math.max(this.minGameMsFloor, this.minMsPerRound * exactRounds);
  }

  /**
   * Viena uzdevuma atvasinātais skaits logā `[windowStart, windowEnd)`. `mp_finish` skaita
   * pabeigtas MP spēles; `sp_win` — SP uzvaras ar tiešu raundu skaitu + variant + min-ilgumu.
   */
  private countTask(
    task: WeeklyTask,
    userId: string,
    windowStart: number,
    windowEnd: number
  ): Promise<number> {
    if (task.kind === "mp_finish") {
      return this.stats.countMpFinishedSince(userId, windowStart, windowEnd);
    }
    // sp_win: difficulty + exactRounds vienmēr definēti (katalogs to garantē).
    return this.stats.countSpTaskWins(
      userId,
      task.difficulty!,
      task.variant ?? null,
      task.exactRounds!,
      windowStart,
      windowEnd,
      this.spMinDurationMs(task.exactRounds!),
      WEEKLY_TASK_PLACEMENT_MAX
    );
  }

  /** Pilns nedēļas uzdevumu stāvoklis lietotājam (atvasināts; nemaina stāvokli). */
  async getState(userId: string, now: number): Promise<WeeklyTasksState> {
    const weekStart = utcWeekStart(now);
    const windowStart = Math.max(weekStart, this.launchEpochMs);
    const windowEnd = weekStart + WEEK_MS;
    const week = utcWeekKey(now);
    const claimed = new Set(await this.wallet.listWeeklyTaskClaims(userId));

    const tasks: WeeklyTaskState[] = [];
    // Widen no heterogēnā `as const` union uz `WeeklyTask`, lai optional lauki (difficulty/
    // variant/exactRounds) ir pieejami arī tiem uzdevumiem, kuru literālī to nav (mp_finish).
    for (const task of WEEKLY_TASKS as readonly WeeklyTask[]) {
      const isClaimed = claimed.has(claimRef(week, task.id));
      const count = await this.countTask(task, userId, windowStart, windowEnd);
      const progress = Math.min(task.threshold, count);
      tasks.push({
        id: task.id,
        kind: task.kind,
        ...(task.difficulty === undefined ? {} : { difficulty: task.difficulty }),
        ...(task.variant === undefined ? {} : { variant: task.variant }),
        ...(task.exactRounds === undefined ? {} : { exactRounds: task.exactRounds }),
        threshold: task.threshold,
        rewardCoins: task.rewardCoins,
        hasPlayButton: task.hasPlayButton,
        progress,
        claimed: isClaimed,
        claimable: count >= task.threshold && !isClaimed
      });
    }

    return {
      serverWeek: week,
      secondsUntilReset: Math.max(0, Math.ceil((windowEnd - now) / 1000)),
      tasks,
      anyClaimable: tasks.some((task) => task.claimable)
    };
  }

  /**
   * Savāc vienu uzdevumu (zem per-user lock). Kārtība: validē id → jau savākts? (stabils
   * success) → slieksnis (atvasināts skaits) → idempotents ledger kredīts. NAV secības vārtu
   * (neatkarīgi). Ledger `UNIQUE` ir īstais correctness sargs.
   */
  async claim(userId: string, taskId: string, now: number): Promise<WeeklyClaimResult> {
    return this.withUserLock(userId, async () => {
      const task: WeeklyTask | undefined = WEEKLY_TASKS.find((t) => t.id === taskId);
      if (!task) {
        return { ok: false, reason: "unknown_task" };
      }
      const weekStart = utcWeekStart(now);
      const windowStart = Math.max(weekStart, this.launchEpochMs);
      const windowEnd = weekStart + WEEK_MS;
      const week = utcWeekKey(now);
      const claimed = new Set(await this.wallet.listWeeklyTaskClaims(userId));

      // Jau savākts → stabils success (idempotents).
      if (claimed.has(claimRef(week, task.id))) {
        return {
          ok: true,
          awarded: 0,
          balance: await this.wallet.getBalance(userId),
          alreadyClaimed: true,
          state: await this.getState(userId, now)
        };
      }

      // Vārti: sasniegts slieksnis (atvasināts skaits).
      const count = await this.countTask(task, userId, windowStart, windowEnd);
      if (count < task.threshold) {
        return { ok: false, reason: "not_met" };
      }

      const { applied, balance } = await this.wallet.creditWeeklyTaskReward(
        userId,
        claimRef(week, task.id),
        task.rewardCoins
      );
      return {
        ok: true,
        awarded: applied ? task.rewardCoins : 0,
        balance,
        alreadyClaimed: !applied,
        state: await this.getState(userId, now)
      };
    });
  }
}
