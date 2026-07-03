import { DAILY_TASKS, type CoinDifficulty, type DailyTask } from "@domino-poker/shared";

import type { PlayerStatsStore } from "../storage/PlayerStatsStore.js";
import type { Clock } from "../timers/TurnTimerScheduler.js";
import type { WalletService } from "../wallet/WalletService.js";

/**
 * Dienas uzdevumu (Daily Tasks) lietišķais serviss (sk. `docs/TODO/daily-tasks-plan.md`).
 * Serveris ir autoritatīvs; route slānis tikai orķestrē (auth, rate-limit, JSON).
 *
 * Modelis (bez skaitītāja tabulas):
 *   - PROGRESS atvasināts no `player_game_results` (`countSpWinsSince`): SP uzvaras
 *     (placement ≤ 2) dotajā grūtībā ŠODIENAS UTC logā ar `duration_ms >= min` (anti-abuse
 *     UN "skaita no palaišanas" — NULL/legacy rindas izslēgtas).
 *   - SAVĀKŠANA = ledger rinda (`WalletService.creditDailyTaskReward`, reason
 *     `daily_task_reward`, ref `daily:{yyyymmdd}:{taskId}`), idempotenta pēc `UNIQUE(user_id,
 *     reason, ref)` → viena balva uz uzdevumu uz UTC dienu, exactly-once.
 *   - Ikdienas atiestatīšana pēc UTC 00:00; savākšana SECĪGA (order 1→4 tajā pašā dienā),
 *     progress PARALĒLS.
 */

const DAY_MS = 86_400_000;

/**
 * Dienas uzdevumu funkcijas palaišanas laiks (UTC, ms). `windowStart = max(utcDayStart,
 * šis)` → uzvaras PIRMS palaišanas neskaitās (īpašnieka lēmums). PRIMĀRais "no palaišanas"
 * sargs tomēr ir `duration_ms IS NOT NULL` (pirms-funkcijas rindām nav ilguma), šis ir
 * papildu skaidra robeža palaišanas dienai. **Iestatīt uz reālo deploy datumu (UTC).**
 */
export const FEATURE_LAUNCH_EPOCH_MS = Date.UTC(2026, 6, 3); // 2026-07-03T00:00:00Z

/**
 * Min spēles ilgums (ms) pēc grūtības, lai SP uzvara SKAITĪTOS dienas uzdevumā (anti-abuse).
 * Bloķē momentānus start→complete skriptus, NEbloķējot reālu spēli (īpašnieka temps ~72s/epic).
 * Heiristisks + tunable; testi apstiprina precīzās vērtības. Serverī tikai (klients nesūta).
 */
export const DAILY_TASK_MIN_GAME_MS: Readonly<Record<CoinDifficulty, number>> = {
  medium: 8000,
  hard: 10000,
  epic: 12000
};

/** Viena uzdevuma stāvoklis UI formā. */
export interface DailyTaskState {
  readonly id: string;
  readonly difficulty: CoinDifficulty;
  readonly threshold: number;
  readonly rewardCoins: number;
  readonly order: number;
  /** Šodienas uzvaras (ierobežots ar `threshold`). */
  readonly progress: number;
  readonly claimed: boolean;
  /** `order===1` VAI iepriekšējais uzdevums šodien savākts. */
  readonly unlocked: boolean;
  /** `unlocked && progress>=threshold && !claimed`. */
  readonly claimable: boolean;
}

/** Pilns dienas uzdevumu stāvoklis (viens GET). */
export interface DailyTasksState {
  /** UTC diena `yyyymmdd` (klients var rādīt / kešot). */
  readonly serverDay: string;
  /** Sekundes līdz nākamajai UTC 00:00 atiestatīšanai. */
  readonly secondsUntilReset: number;
  readonly tasks: readonly DailyTaskState[];
  /** Vismaz viens uzdevums savācams (ikonas pulsēšanai). */
  readonly anyClaimable: boolean;
}

export type DailyClaimResult =
  | {
      readonly ok: true;
      /** Faktiski piešķirtās monētas (0, ja jau bija savākts). */
      readonly awarded: number;
      readonly balance: number;
      readonly alreadyClaimed: boolean;
      readonly state: DailyTasksState;
    }
  | { readonly ok: false; readonly reason: "unknown_task" | "locked" | "not_met" };

export interface DailyTaskServiceOptions {
  readonly stats: Pick<PlayerStatsStore, "countSpWinsSince">;
  readonly wallet: Pick<
    WalletService,
    "listDailyTaskClaims" | "creditDailyTaskReward" | "getBalance"
  >;
  readonly clock: Clock;
  /** Testiem injicējams; noklusējums `FEATURE_LAUNCH_EPOCH_MS`. */
  readonly launchEpochMs?: number;
  /** Testiem injicējams; noklusējums `DAILY_TASK_MIN_GAME_MS`. */
  readonly minGameMs?: Readonly<Record<CoinDifficulty, number>>;
}

/** UTC dienas sākums (ms) dotam laikam. */
function utcDayStart(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

/** UTC dienas atslēga `yyyymmdd` (ledger ref daļa + klienta serverDay). */
function utcDayKey(now: number): string {
  const d = new Date(utcDayStart(now));
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}${mm}${dd}`;
}

/** Ledger `ref` konkrētam uzdevumam konkrētā UTC dienā. */
function claimRef(dayKey: string, taskId: string): string {
  return `daily:${dayKey}:${taskId}`;
}

export class DailyTaskService {
  private readonly stats: DailyTaskServiceOptions["stats"];
  private readonly wallet: DailyTaskServiceOptions["wallet"];
  private readonly clock: Clock;
  private readonly launchEpochMs: number;
  private readonly minGameMs: Readonly<Record<CoinDifficulty, number>>;
  /** Per-lietotāja secības ķēde (serializē secīgo-vārtu check-then-act; pašattīrās). */
  private readonly userChains = new Map<string, Promise<void>>();

  constructor(options: DailyTaskServiceOptions) {
    this.stats = options.stats;
    this.wallet = options.wallet;
    this.clock = options.clock;
    this.launchEpochMs = options.launchEpochMs ?? FEATURE_LAUNCH_EPOCH_MS;
    this.minGameMs = options.minGameMs ?? DAILY_TASK_MIN_GAME_MS;
  }

  /**
   * Serializē darbības uz vienu lietotāju (in-process; vienas instances, kā `WalletService`).
   * Novērš sacensību starp secīgo-vārtu lasījumu ("vai iepriekšējais savākts?") un savākšanu.
   */
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

  /** Šodienas uzvaru skaits grūtībā (kešots pa grūtību — epic uzdevumi 3+4 dalās). */
  private makeWinCounter(
    userId: string,
    windowStart: number,
    windowEnd: number
  ): (difficulty: CoinDifficulty) => Promise<number> {
    const cache = new Map<CoinDifficulty, Promise<number>>();
    return (difficulty) => {
      let pending = cache.get(difficulty);
      if (!pending) {
        pending = this.stats.countSpWinsSince(
          userId,
          difficulty,
          windowStart,
          windowEnd,
          this.minGameMs[difficulty]
        );
        cache.set(difficulty, pending);
      }
      return pending;
    };
  }

  /** Pilns dienas uzdevumu stāvoklis lietotājam (atvasināts; nemaina stāvokli). */
  async getState(userId: string, now: number): Promise<DailyTasksState> {
    const dayStart = utcDayStart(now);
    const windowStart = Math.max(dayStart, this.launchEpochMs);
    const windowEnd = dayStart + DAY_MS;
    const day = utcDayKey(now);
    const claimed = new Set(await this.wallet.listDailyTaskClaims(userId));
    const countWins = this.makeWinCounter(userId, windowStart, windowEnd);

    const tasks: DailyTaskState[] = [];
    let prevClaimed = true; // order 1 vienmēr atbloķēts
    for (const task of DAILY_TASKS) {
      const isClaimed = claimed.has(claimRef(day, task.id));
      const wins = await countWins(task.difficulty);
      const unlocked = task.order === 1 ? true : prevClaimed;
      const progress = Math.min(task.threshold, wins);
      tasks.push({
        id: task.id,
        difficulty: task.difficulty,
        threshold: task.threshold,
        rewardCoins: task.rewardCoins,
        order: task.order,
        progress,
        claimed: isClaimed,
        unlocked,
        claimable: unlocked && wins >= task.threshold && !isClaimed
      });
      prevClaimed = isClaimed;
    }

    return {
      serverDay: day,
      secondsUntilReset: Math.max(0, Math.ceil((windowEnd - now) / 1000)),
      tasks,
      anyClaimable: tasks.some((task) => task.claimable)
    };
  }

  /**
   * Savāc vienu uzdevumu (zem per-user lock, lai secīgā pārbaude nav sacensība). Kārtība:
   * validē id → jau savākts? (stabils success) → secība (iepriekšējais šodien savākts) →
   * slieksnis (atvasināts skaits) → idempotents ledger kredīts. Dublikāts/vienlaicīgs =
   * idempotents (favor under-grant). Ledger `UNIQUE` ir īstais correctness sargs.
   */
  async claim(userId: string, taskId: string, now: number): Promise<DailyClaimResult> {
    return this.withUserLock(userId, async () => {
      const task: DailyTask | undefined = DAILY_TASKS.find((t) => t.id === taskId);
      if (!task) {
        return { ok: false, reason: "unknown_task" };
      }
      const dayStart = utcDayStart(now);
      const windowStart = Math.max(dayStart, this.launchEpochMs);
      const windowEnd = dayStart + DAY_MS;
      const day = utcDayKey(now);
      const claimed = new Set(await this.wallet.listDailyTaskClaims(userId));

      // Jau savākts → stabils success (idempotents), atgriež svaigu stāvokli.
      if (claimed.has(claimRef(day, task.id))) {
        return {
          ok: true,
          awarded: 0,
          balance: await this.wallet.getBalance(userId),
          alreadyClaimed: true,
          state: await this.getState(userId, now)
        };
      }

      // Secīgi: iepriekšējais uzdevums (order-1) šodien jāsavāc.
      if (task.order > 1) {
        const prev = DAILY_TASKS.find((t) => t.order === task.order - 1)!;
        if (!claimed.has(claimRef(day, prev.id))) {
          return { ok: false, reason: "locked" };
        }
      }

      // Slieksnis no atvasinātā skaita.
      const wins = await this.stats.countSpWinsSince(
        userId,
        task.difficulty,
        windowStart,
        windowEnd,
        this.minGameMs[task.difficulty]
      );
      if (wins < task.threshold) {
        return { ok: false, reason: "not_met" };
      }

      const { applied, balance } = await this.wallet.creditDailyTaskReward(
        userId,
        claimRef(day, task.id),
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
