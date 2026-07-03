import { describe, expect, it } from "vitest";

import {
  DAILY_TASK_MIN_GAME_MS,
  DailyTaskService
} from "../../src/daily/DailyTaskService.js";
import type { CoinDifficulty } from "@domino-poker/shared";

/**
 * `DailyTaskService` unit testi (sk. `docs/TODO/daily-tasks-plan.md`). Fake stats +
 * wallet, injicēts pulkstenis / launch epoch, lai pārbaudītu atvasināto progresu, secīgo
 * savākšanu, idempotenci, UTC dienas logu un launch clamp BEZ DB.
 */

interface CountCall {
  readonly difficulty: CoinDifficulty;
  readonly since: number;
  readonly until: number;
  readonly minDuration: number;
}

/** Fake `countSpWinsSince`: atgriež konfigurētas uzvaras pa grūtībai + reģistrē izsaukumus. */
function makeStats(wins: Partial<Record<CoinDifficulty, number>>) {
  const calls: CountCall[] = [];
  return {
    calls,
    countSpWinsSince: async (
      _userId: string,
      difficulty: CoinDifficulty,
      since: number,
      until: number,
      minDuration: number
    ): Promise<number> => {
      calls.push({ difficulty, since, until, minDuration });
      return wins[difficulty] ?? 0;
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
    listDailyTaskClaims: async (): Promise<readonly string[]> => [...claims],
    creditDailyTaskReward: async (
      _userId: string,
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

const DAY = 86_400_000;
// 2026-07-10 12:00 UTC (labi pēc noklusējuma launch epoch).
const NOW = Date.UTC(2026, 6, 10, 12, 0, 0);
const DAY_START = Date.UTC(2026, 6, 10);
const DAY_KEY = "20260710";

function makeService(
  wins: Partial<Record<CoinDifficulty, number>>,
  opts: { launchEpochMs?: number } = {}
) {
  const stats = makeStats(wins);
  const wallet = makeWallet();
  const service = new DailyTaskService({
    stats,
    wallet,
    clock: () => NOW,
    launchEpochMs: opts.launchEpochMs ?? 0
  });
  return { service, stats, wallet };
}

describe("DailyTaskService", () => {
  it("derives progress; task 1 unlocked, later tasks locked until previous claimed", async () => {
    const { service } = makeService({ medium: 4, hard: 0, epic: 0 });
    const state = await service.getState("u1", NOW);
    expect(state.serverDay).toBe(DAY_KEY);
    expect(state.secondsUntilReset).toBe(43_200); // 12h
    const t1 = state.tasks[0]!;
    const t2 = state.tasks[1]!;
    expect(t1).toMatchObject({ id: "win10_medium", progress: 4, unlocked: true, claimed: false, claimable: false });
    expect(t2).toMatchObject({ id: "win20_hard", unlocked: false, claimable: false });
    expect(state.anyClaimable).toBe(false);
  });

  it("task is claimable only when threshold met AND unlocked", async () => {
    const { service } = makeService({ medium: 10, hard: 20 });
    const state = await service.getState("u1", NOW);
    // medium met + order 1 → claimable; hard met BUT locked (medium not claimed) → not claimable.
    expect(state.tasks[0]).toMatchObject({ progress: 10, claimable: true });
    expect(state.tasks[1]).toMatchObject({ progress: 20, unlocked: false, claimable: false });
    expect(state.anyClaimable).toBe(true);
  });

  it("queries with the correct UTC window and per-difficulty min duration", async () => {
    const { service, stats } = makeService({ epic: 50 });
    await service.getState("u1", NOW);
    const epicCall = stats.calls.find((c) => c.difficulty === "epic")!;
    expect(epicCall.since).toBe(DAY_START);
    expect(epicCall.until).toBe(DAY_START + DAY);
    expect(epicCall.minDuration).toBe(DAILY_TASK_MIN_GAME_MS.epic);
    // Epic uzdevumi 3 un 4 dalās ar VIENU skaitu (kešots) → epic vaicāts tikai reizi.
    expect(stats.calls.filter((c) => c.difficulty === "epic")).toHaveLength(1);
  });

  it("clamps the window start to the launch epoch on launch day", async () => {
    const launchDay = Date.UTC(2026, 6, 3, 4, 0, 0); // 04:00 palaišanas dienā
    const nowOnLaunch = Date.UTC(2026, 6, 3, 6, 0, 0); // 06:00
    const stats = makeStats({ medium: 1 });
    const service = new DailyTaskService({
      stats,
      wallet: makeWallet(),
      clock: () => nowOnLaunch,
      launchEpochMs: launchDay
    });
    await service.getState("u1", nowOnLaunch);
    const call = stats.calls[0]!;
    expect(call.since).toBe(launchDay); // max(dayStart=00:00, launch=04:00) = 04:00
  });

  it("claims a met task sequentially and awards coins", async () => {
    const { service, wallet } = makeService({ medium: 10 });
    const res = await service.claim("u1", "win10_medium", NOW);
    expect(res).toMatchObject({ ok: true, awarded: 2000, balance: 7000, alreadyClaimed: false });
    if (res.ok) {
      expect(res.state.tasks[0]).toMatchObject({ claimed: true });
    }
    expect(wallet.claims.has(`daily:${DAY_KEY}:win10_medium`)).toBe(true);
  });

  it("unlocks the next task after the previous is claimed", async () => {
    const { service } = makeService({ medium: 10, hard: 20 });
    await service.claim("u1", "win10_medium", NOW);
    const state = await service.getState("u1", NOW);
    expect(state.tasks[1]).toMatchObject({ id: "win20_hard", unlocked: true, claimable: true });
  });

  it("rejects claiming a locked task (previous not claimed)", async () => {
    const { service } = makeService({ medium: 10, hard: 20 });
    const res = await service.claim("u1", "win20_hard", NOW);
    expect(res).toEqual({ ok: false, reason: "locked" });
  });

  it("rejects claiming when the threshold is not met", async () => {
    const { service } = makeService({ medium: 9 });
    const res = await service.claim("u1", "win10_medium", NOW);
    expect(res).toEqual({ ok: false, reason: "not_met" });
  });

  it("rejects an unknown task id", async () => {
    const { service } = makeService({ medium: 10 });
    const res = await service.claim("u1", "nope", NOW);
    expect(res).toEqual({ ok: false, reason: "unknown_task" });
  });

  it("is idempotent: claiming an already-claimed task returns a stable success with no re-award", async () => {
    const { service } = makeService({ medium: 10 });
    const first = await service.claim("u1", "win10_medium", NOW);
    expect(first).toMatchObject({ ok: true, awarded: 2000, balance: 7000 });
    const second = await service.claim("u1", "win10_medium", NOW);
    expect(second).toMatchObject({ ok: true, awarded: 0, balance: 7000, alreadyClaimed: true });
  });

  it("epic tasks 3 and 4 share the same epic win count", async () => {
    const { service } = makeService({ medium: 10, hard: 20, epic: 50 });
    await service.claim("u1", "win10_medium", NOW);
    await service.claim("u1", "win20_hard", NOW);
    const afterHard = await service.claim("u1", "win30_epic", NOW);
    expect(afterHard).toMatchObject({ ok: true, awarded: 8000 });
    const afterEpic30 = await service.claim("u1", "win50_epic", NOW);
    expect(afterEpic30).toMatchObject({ ok: true, awarded: 16000 });
  });

  it("serializes concurrent claims of the same task (only one awards)", async () => {
    const { service } = makeService({ medium: 10 });
    const [a, b] = await Promise.all([
      service.claim("u1", "win10_medium", NOW),
      service.claim("u1", "win10_medium", NOW)
    ]);
    const awarded = [a, b].filter((r) => r.ok && r.awarded > 0);
    expect(awarded).toHaveLength(1);
  });
});
