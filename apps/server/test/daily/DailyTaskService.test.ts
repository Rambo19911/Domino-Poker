import { describe, expect, it } from "vitest";

import {
  DAILY_TASK_MIN_GAME_MS,
  DailyTaskService
} from "../../src/daily/DailyTaskService.js";
import type { CoinDifficulty } from "@domino-poker/shared";

/**
 * `DailyTaskService` unit testi (sk. `docs/TODO/daily-tasks-plan.md`). Fake stats +
 * wallet, injicēts pulkstenis / launch epoch. Modelis: uzdevums izpildīts, kad šodien ir
 * ≥1 SP uzvara dotajā grūtībā ar `round_count >= requiredRounds` (`>=` semantika). Progress
 * ir BINĀRS (0/1). Pārbaudām atvasināto progresu, secīgo savākšanu, idempotenci, UTC dienas
 * logu, raundu vārtus un launch clamp BEZ DB.
 */

interface CountCall {
  readonly difficulty: CoinDifficulty;
  readonly since: number;
  readonly until: number;
  readonly minDuration: number;
  readonly minRounds: number;
}

/** Viena pabeigta SP uzvara (placement ≤ 2) fake-modelī. */
interface WonGame {
  readonly difficulty: CoinDifficulty;
  readonly rounds: number;
}

/**
 * Fake `countSpWinsSince`: skaita uzvarētās spēles, kas atbilst grūtībai UN `rounds >=
 * minRounds` (atspoguļo servera SQL `round_count >= ?` vārtus) + reģistrē izsaukumus.
 */
function makeStats(games: readonly WonGame[]) {
  const calls: CountCall[] = [];
  return {
    calls,
    countSpWinsSince: async (
      _userId: string,
      difficulty: CoinDifficulty,
      since: number,
      until: number,
      minDuration: number,
      minRounds: number
    ): Promise<number> => {
      calls.push({ difficulty, since, until, minDuration, minRounds });
      return games.filter((g) => g.difficulty === difficulty && g.rounds >= minRounds).length;
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

function makeService(games: readonly WonGame[], opts: { launchEpochMs?: number } = {}) {
  const stats = makeStats(games);
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
  it("a win with too few rounds does not qualify (binary progress 0)", async () => {
    const { service } = makeService([{ difficulty: "medium", rounds: 9 }]); // < 10
    const state = await service.getState("u1", NOW);
    expect(state.serverDay).toBe(DAY_KEY);
    expect(state.secondsUntilReset).toBe(43_200); // 12h
    const t1 = state.tasks[0]!;
    expect(t1).toMatchObject({
      id: "win10_medium",
      requiredRounds: 10,
      progress: 0,
      unlocked: true,
      claimable: false
    });
    expect(state.anyClaimable).toBe(false);
  });

  it("a qualifying win makes task 1 claimable; later tasks locked until previous claimed", async () => {
    const { service } = makeService([
      { difficulty: "medium", rounds: 10 },
      { difficulty: "hard", rounds: 20 }
    ]);
    const state = await service.getState("u1", NOW);
    // medium qualifies + order 1 → claimable; hard qualifies BUT locked (medium not claimed).
    expect(state.tasks[0]).toMatchObject({ id: "win10_medium", progress: 1, claimable: true });
    expect(state.tasks[1]).toMatchObject({
      id: "win20_hard",
      progress: 1,
      unlocked: false,
      claimable: false
    });
    expect(state.anyClaimable).toBe(true);
  });

  it("queries each task with the correct UTC window, min duration, and round gate", async () => {
    const { service, stats } = makeService([{ difficulty: "epic", rounds: 50 }]);
    await service.getState("u1", NOW);
    const epicCalls = stats.calls.filter((c) => c.difficulty === "epic");
    // Epic uzdevumi 3 (≥30) un 4 (≥50) prasa ATŠĶIRĪGU raundu skaitu → 2 atsevišķi vaicājumi.
    expect(epicCalls).toHaveLength(2);
    expect(epicCalls.map((c) => c.minRounds).sort((a, b) => a - b)).toEqual([30, 50]);
    for (const call of epicCalls) {
      expect(call.since).toBe(DAY_START);
      expect(call.until).toBe(DAY_START + DAY);
      expect(call.minDuration).toBe(DAILY_TASK_MIN_GAME_MS.epic);
    }
  });

  it("clamps the window start to the launch epoch on launch day", async () => {
    const launchDay = Date.UTC(2026, 6, 3, 4, 0, 0); // 04:00 palaišanas dienā
    const nowOnLaunch = Date.UTC(2026, 6, 3, 6, 0, 0); // 06:00
    const stats = makeStats([{ difficulty: "medium", rounds: 10 }]);
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
    const { service, wallet } = makeService([{ difficulty: "medium", rounds: 10 }]);
    const res = await service.claim("u1", "win10_medium", NOW);
    expect(res).toMatchObject({ ok: true, awarded: 2000, balance: 7000, alreadyClaimed: false });
    if (res.ok) {
      expect(res.state.tasks[0]).toMatchObject({ claimed: true });
    }
    expect(wallet.claims.has(`daily:${DAY_KEY}:win10_medium`)).toBe(true);
  });

  it("unlocks the next task after the previous is claimed", async () => {
    const { service } = makeService([
      { difficulty: "medium", rounds: 10 },
      { difficulty: "hard", rounds: 20 }
    ]);
    await service.claim("u1", "win10_medium", NOW);
    const state = await service.getState("u1", NOW);
    expect(state.tasks[1]).toMatchObject({ id: "win20_hard", unlocked: true, claimable: true });
  });

  it("rejects claiming a locked task (previous not claimed)", async () => {
    const { service } = makeService([
      { difficulty: "medium", rounds: 10 },
      { difficulty: "hard", rounds: 20 }
    ]);
    const res = await service.claim("u1", "win20_hard", NOW);
    expect(res).toEqual({ ok: false, reason: "locked" });
  });

  it("rejects claiming when no win meets the required round count", async () => {
    const { service } = makeService([{ difficulty: "medium", rounds: 9 }]); // < 10
    const res = await service.claim("u1", "win10_medium", NOW);
    expect(res).toEqual({ ok: false, reason: "not_met" });
  });

  it("rejects an unknown task id", async () => {
    const { service } = makeService([{ difficulty: "medium", rounds: 10 }]);
    const res = await service.claim("u1", "nope", NOW);
    expect(res).toEqual({ ok: false, reason: "unknown_task" });
  });

  it("is idempotent: claiming an already-claimed task returns a stable success with no re-award", async () => {
    const { service } = makeService([{ difficulty: "medium", rounds: 10 }]);
    const first = await service.claim("u1", "win10_medium", NOW);
    expect(first).toMatchObject({ ok: true, awarded: 2000, balance: 7000 });
    const second = await service.claim("u1", "win10_medium", NOW);
    expect(second).toMatchObject({ ok: true, awarded: 0, balance: 7000, alreadyClaimed: true });
  });

  it("(>= semantics) one 50-round epic win satisfies both the 30- and 50-round epic tasks", async () => {
    const { service } = makeService([
      { difficulty: "medium", rounds: 10 },
      { difficulty: "hard", rounds: 20 },
      { difficulty: "epic", rounds: 50 }
    ]);
    await service.claim("u1", "win10_medium", NOW);
    await service.claim("u1", "win20_hard", NOW);
    const afterHard = await service.claim("u1", "win30_epic", NOW);
    expect(afterHard).toMatchObject({ ok: true, awarded: 8000 });
    const afterEpic30 = await service.claim("u1", "win50_epic", NOW);
    expect(afterEpic30).toMatchObject({ ok: true, awarded: 16000 });
  });

  it("serializes concurrent claims of the same task (only one awards)", async () => {
    const { service } = makeService([{ difficulty: "medium", rounds: 10 }]);
    const [a, b] = await Promise.all([
      service.claim("u1", "win10_medium", NOW),
      service.claim("u1", "win10_medium", NOW)
    ]);
    const awarded = [a, b].filter((r) => r.ok && r.awarded > 0);
    expect(awarded).toHaveLength(1);
  });
});
