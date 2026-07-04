import { describe, expect, it } from "vitest";

import { DAILY_TASKS } from "../src/economy.js";

/**
 * `DAILY_TASKS` kataloga invarianti. `DailyTaskService` PAĻAUJAS uz to, ka masīvs ir
 * kārtots pēc `order`, un ka `order` ir secīgs 1..N (secīgā savākšana meklē `order-1`).
 * Šie testi noķer bojātu katalogu tā definīcijas avotā (nevis tikai servisa uzvedībā).
 */
describe("DAILY_TASKS catalog invariants", () => {
  it("has unique ids", () => {
    const ids = DAILY_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("orders are contiguous 1..N and the array is sorted by order", () => {
    const orders = DAILY_TASKS.map((t) => t.order);
    expect(orders).toEqual(DAILY_TASKS.map((_, i) => i + 1));
  });

  it("requiredRounds and rewards are positive integers; difficulties are valid", () => {
    for (const task of DAILY_TASKS) {
      expect(Number.isInteger(task.requiredRounds) && task.requiredRounds > 0).toBe(true);
      expect(Number.isInteger(task.rewardCoins) && task.rewardCoins > 0).toBe(true);
      expect(["medium", "hard", "epic"]).toContain(task.difficulty);
    }
  });
});
