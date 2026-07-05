import { describe, expect, it } from "vitest";

import {
  WeeklyTaskService,
  WEEKLY_TASK_MIN_GAME_MS_FLOOR,
  WEEKLY_TASK_MIN_MS_PER_ROUND
} from "../../src/weekly/WeeklyTaskService.js";
import type { CoinDifficulty, SpVariant } from "@domino-poker/shared";

/**
 * `WeeklyTaskService` unit testi (sk. `docs/TODO/weekly-tasks-plan.md`). Fake counters +
 * wallet, injicēts pulkstenis / launch epoch. Modelis: count-based progress, neatkarīga
 * savākšana, UTC pirmdienas logs, variant + exact-round + min-ilguma vārti. BEZ DB.
 */

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Fake pabeigta SP uzvara. */
interface SpWin {
  readonly difficulty: CoinDifficulty;
  readonly rounds: number;
  readonly placement: number;
  readonly durationMs: number;
  readonly variant?: SpVariant;
}

interface SpCall {
  readonly difficulty: CoinDifficulty;
  readonly variant: SpVariant | null;
  readonly exactRounds: number;
  readonly since: number;
  readonly until: number;
  readonly minDuration: number;
  readonly placementMax: number;
}

interface MpCall {
  readonly since: number;
  readonly until: number;
}

/**
 * Fake statistikas skaitītāji: atspoguļo servera SQL vārtus.
 *   - `countMpFinishedSince`: fiksēts MP spēļu skaits logā.
 *   - `countSpTaskWins`: filtrē pēc difficulty, variant (null=standard), TIEŠA raundu skaita,
 *     placement<=max, durationMs>=minDuration.
 */
function makeStats(mpFinished: number, spWins: readonly SpWin[]) {
  const spCalls: SpCall[] = [];
  const mpCalls: MpCall[] = [];
  return {
    spCalls,
    mpCalls,
    countMpFinishedSince: async (_u: string, since: number, until: number): Promise<number> => {
      mpCalls.push({ since, until });
      return mpFinished;
    },
    countSpTaskWins: async (
      _u: string,
      difficulty: CoinDifficulty,
      variant: SpVariant | null,
      exactRounds: number,
      since: number,
      until: number,
      minDuration: number,
      placementMax: number
    ): Promise<number> => {
      spCalls.push({ difficulty, variant, exactRounds, since, until, minDuration, placementMax });
      return spWins.filter(
        (g) =>
          g.difficulty === difficulty &&
          (g.variant ?? null) === variant &&
          g.rounds === exactRounds &&
          g.placement <= placementMax &&
          g.durationMs >= minDuration
      ).length;
    }
  };
}

/** Fake maks: atmiņā claims + bilance; idempotents kredīts pēc ref. */
function makeWallet(startBalance = 5000) {
  const claims = new Set<string>();
  let balance = startBalance;
  return {
    claims,
    getBalance: async (): Promise<number> => balance,
    listWeeklyTaskClaims: async (): Promise<readonly string[]> => [...claims],
    creditWeeklyTaskReward: async (
      _u: string,
      ref: string,
      amount: number
    ): Promise<{ applied: boolean; balance: number }> => {
      if (claims.has(ref)) {
        return { applied: false, balance };
      }
      claims.add(ref);
      balance += amount;
      return { applied: true, balance };
    }
  };
}

// 2026-07-08 (trešdiena) 12:00 UTC → nedēļas pirmdiena = 2026-07-06.
const NOW = Date.UTC(2026, 6, 8, 12, 0, 0);
const WEEK_START = Date.UTC(2026, 6, 6);
const WEEK_KEY = "20260706";

function makeService(
  mpFinished: number,
  spWins: readonly SpWin[],
  opts: { launchEpochMs?: number; now?: number } = {}
) {
  const stats = makeStats(mpFinished, spWins);
  const wallet = makeWallet();
  const service = new WeeklyTaskService({
    stats,
    wallet,
    clock: () => opts.now ?? NOW,
    launchEpochMs: opts.launchEpochMs ?? 0
  });
  return { service, stats, wallet };
}

/** Ērtas uzvaras ar pietiekamu ilgumu (neizkrīt pa min-ilguma vārtiem). */
const longEpic = (rounds: number, placement = 1, variant?: SpVariant): SpWin => ({
  difficulty: "epic",
  rounds,
  placement,
  durationMs: 999_999,
  ...(variant === undefined ? {} : { variant })
});

describe("WeeklyTaskService", () => {
  it("computes count-based progress and caps it at the threshold", async () => {
    const { service } = makeService(12, []);
    const state = await service.getState("u1", NOW);
    const mp = state.tasks.find((t) => t.id === "mp_finish_20")!;
    expect(mp.progress).toBe(12); // 12/20
    expect(mp.threshold).toBe(20);
    expect(mp.claimable).toBe(false);

    const { service: full } = makeService(25, []);
    const mpFull = (await full.getState("u1", NOW)).tasks.find((t) => t.id === "mp_finish_20")!;
    expect(mpFull.progress).toBe(20); // ierobežots pie sliekšņa
    expect(mpFull.claimable).toBe(true);
  });

  it("separates tasks by variant + exact rounds (special room only counts boss tasks)", async () => {
    // Viena speciālās istabas 50-raundu uzvara.
    const { service } = makeService(0, [longEpic(50, 1, "weekly_bosses")]);
    const tasks = (await service.getState("u1", NOW)).tasks;
    expect(tasks.find((t) => t.id === "boss50")!.progress).toBe(1);
    expect(tasks.find((t) => t.id === "boss50")!.claimable).toBe(true);
    // Standard uzd. 2 (variant IS NULL) šo NEskaita.
    expect(tasks.find((t) => t.id === "sp_epic50_x2")!.progress).toBe(0);
    // boss30 (30 raundi) arī NE.
    expect(tasks.find((t) => t.id === "boss30")!.progress).toBe(0);
  });

  it("sp_epic50_x2 counts standard epic-50 wins and needs two for claimable", async () => {
    const one = makeService(0, [longEpic(50)]);
    const t1 = (await one.service.getState("u1", NOW)).tasks.find((t) => t.id === "sp_epic50_x2")!;
    expect(t1.progress).toBe(1);
    expect(t1.claimable).toBe(false);

    const two = makeService(0, [longEpic(50), longEpic(50, 2)]);
    const t2 = (await two.service.getState("u1", NOW)).tasks.find((t) => t.id === "sp_epic50_x2")!;
    expect(t2.progress).toBe(2);
    expect(t2.claimable).toBe(true);
  });

  it("gates sp wins by round-scaled min duration (boss30 needs >= 30s, boss50 >= 50s)", async () => {
    const perRound = WEEKLY_TASK_MIN_MS_PER_ROUND;
    const floor = WEEKLY_TASK_MIN_GAME_MS_FLOOR;
    expect(Math.max(floor, perRound * 30)).toBe(30_000);
    expect(Math.max(floor, perRound * 50)).toBe(50_000);

    // 29s boss30 spēle → zem 30s vārtiem → neskaitās.
    const tooFast = makeService(0, [
      { difficulty: "epic", rounds: 30, placement: 1, durationMs: 29_000, variant: "weekly_bosses" }
    ]);
    expect((await tooFast.service.getState("u1", NOW)).tasks.find((t) => t.id === "boss30")!.progress).toBe(0);
    // Tieši 30s → skaitās.
    const ok = makeService(0, [
      { difficulty: "epic", rounds: 30, placement: 1, durationMs: 30_000, variant: "weekly_bosses" }
    ]);
    expect((await ok.service.getState("u1", NOW)).tasks.find((t) => t.id === "boss30")!.progress).toBe(1);
  });

  it("uses the UTC-Monday window [weekStart, weekStart+7d) for the counters", async () => {
    const { service, stats } = makeService(0, []);
    await service.getState("u1", NOW);
    expect(stats.mpCalls[0]).toEqual({ since: WEEK_START, until: WEEK_START + WEEK });
    for (const call of stats.spCalls) {
      expect(call.since).toBe(WEEK_START);
      expect(call.until).toBe(WEEK_START + WEEK);
    }
    const state = await service.getState("u1", NOW);
    expect(state.serverWeek).toBe(WEEK_KEY);
  });

  it("clamps the window start to the launch epoch mid-week", async () => {
    const launch = Date.UTC(2026, 6, 7); // otrdiena — pēc pirmdienas sākuma
    const { service, stats } = makeService(0, [], { launchEpochMs: launch });
    await service.getState("u1", NOW);
    expect(stats.mpCalls[0]!.since).toBe(launch); // max(weekStart, launch)
    expect(stats.mpCalls[0]!.until).toBe(WEEK_START + WEEK);
  });

  it("treats Sunday 23:59 and Monday 00:00 as different weeks", async () => {
    const sunday = Date.UTC(2026, 6, 5, 23, 59, 59); // svētdiena (iepriekšējā nedēļa)
    const monday = Date.UTC(2026, 6, 6, 0, 0, 0); // pirmdiena (jaunā nedēļa)
    const sun = makeService(0, [], { now: sunday });
    const mon = makeService(0, [], { now: monday });
    expect((await sun.service.getState("u1", sunday)).serverWeek).toBe("20260629"); // iepr. pirmd.
    expect((await mon.service.getState("u1", monday)).serverWeek).toBe("20260706");
  });

  it("claims independently (no sequential lock) and is idempotent", async () => {
    const { service, wallet } = makeService(25, [longEpic(50, 1, "weekly_bosses")]);
    // boss50 savācams bez jebkuru citu uzdevumu savākšanas (neatkarīgi).
    const first = await service.claim("u1", "boss50", NOW);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.awarded).toBe(400000);
      expect(first.alreadyClaimed).toBe(false);
    }
    expect(wallet.claims.has(`weekly:${WEEK_KEY}:boss50`)).toBe(true);

    // Atkārtots savākums → stabils success, awarded 0.
    const second = await service.claim("u1", "boss50", NOW);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.awarded).toBe(0);
      expect(second.alreadyClaimed).toBe(true);
    }
  });

  it("rejects claiming an unmet task (not_met) and an unknown id (unknown_task)", async () => {
    const { service } = makeService(5, []); // mp 5 < 20
    const notMet = await service.claim("u1", "mp_finish_20", NOW);
    expect(notMet).toEqual({ ok: false, reason: "not_met" });

    const unknown = await service.claim("u1", "nope", NOW);
    expect(unknown).toEqual({ ok: false, reason: "unknown_task" });
  });

  it("reports secondsUntilReset counting down to next Monday 00:00 UTC", async () => {
    const { service } = makeService(0, []);
    const state = await service.getState("u1", NOW);
    expect(state.secondsUntilReset).toBe(Math.ceil((WEEK_START + WEEK - NOW) / 1000));
  });
});
