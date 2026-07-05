import { describe, expect, it } from "vitest";

import { WEEKLY_TASKS, WEEKLY_TASK_PLACEMENT_MAX, type WeeklyTask } from "../src/economy.js";

// Widen no heterogēnā `as const` union uz `WeeklyTask`, lai optional lauki ir pieejami visiem.
const TASKS: readonly WeeklyTask[] = WEEKLY_TASKS;

/**
 * `WEEKLY_TASKS` kataloga invarianti. `WeeklyTaskService` PAĻAUJAS uz to, ka `sp_win`
 * uzdevumiem ir definēti `difficulty` + `exactRounds` (tos lieto ar `!`), un ka `mp_finish`
 * uzdevumiem šo lauku NAV. Šie testi noķer bojātu katalogu tā definīcijas avotā.
 */
describe("WEEKLY_TASKS catalog invariants", () => {
  it("has unique ids", () => {
    const ids = WEEKLY_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("thresholds and rewards are positive integers", () => {
    for (const task of TASKS) {
      expect(Number.isInteger(task.threshold) && task.threshold > 0).toBe(true);
      expect(Number.isInteger(task.rewardCoins) && task.rewardCoins > 0).toBe(true);
    }
  });

  it("sp_win tasks define difficulty + exactRounds; mp_finish tasks define neither", () => {
    for (const task of TASKS) {
      if (task.kind === "sp_win") {
        expect(["medium", "hard", "epic"]).toContain(task.difficulty);
        expect(Number.isInteger(task.exactRounds) && (task.exactRounds ?? 0) > 0).toBe(true);
      } else {
        expect(task.kind).toBe("mp_finish");
        expect(task.difficulty).toBeUndefined();
        expect(task.exactRounds).toBeUndefined();
        expect(task.variant).toBeUndefined();
      }
    }
  });

  it("only special-room tasks carry a variant; play-button tasks are the special-room ones", () => {
    for (const task of TASKS) {
      if (task.variant !== undefined) {
        expect(task.variant).toBe("weekly_bosses");
        expect(task.kind).toBe("sp_win");
      }
      // [Play] poga ⇔ speciālā istaba (weekly_bosses variants).
      expect(task.hasPlayButton).toBe(task.variant === "weekly_bosses");
    }
  });

  it("uses top-2 as the winning-place threshold", () => {
    expect(WEEKLY_TASK_PLACEMENT_MAX).toBe(2);
  });
});
