import { describe, expect, it } from "vitest";

import { SystemTurnTimerScheduler } from "../../src/timers/SystemTurnTimerScheduler.js";

type Handle = ReturnType<typeof setTimeout>;

function makeRecorder(now = 1000) {
  const scheduled: Array<{ readonly delay: number; readonly run: () => void }> = [];
  let cleared = 0;
  let handleSeq = 0;
  const scheduler = new SystemTurnTimerScheduler({
    clock: () => now,
    setTimeoutFn: (run, delay) => {
      scheduled.push({ delay, run });
      handleSeq += 1;
      return handleSeq as unknown as Handle;
    },
    clearTimeoutFn: () => {
      cleared += 1;
    }
  });
  return { scheduler, scheduled, clearedCount: () => cleared };
}

describe("SystemTurnTimerScheduler (Phase 7.1)", () => {
  it("computes the delay as fireAt minus the current clock", () => {
    const { scheduler, scheduled } = makeRecorder(1000);
    scheduler.schedule(3500, () => {});
    expect(scheduled[0]?.delay).toBe(2500);
  });

  it("clamps a past fireAt to a zero delay", () => {
    const { scheduler, scheduled } = makeRecorder(1000);
    scheduler.schedule(500, () => {});
    expect(scheduled[0]?.delay).toBe(0);
  });

  it("replaces the previous timer when re-scheduled (one active timer)", () => {
    const { scheduler, scheduled, clearedCount } = makeRecorder(1000);
    scheduler.schedule(2000, () => {});
    scheduler.schedule(3000, () => {});
    expect(clearedCount()).toBe(1);
    expect(scheduled).toHaveLength(2);
  });

  it("cancel clears the pending timer and is idempotent", () => {
    const { scheduler, clearedCount } = makeRecorder(1000);
    scheduler.schedule(2000, () => {});
    scheduler.cancel();
    scheduler.cancel();
    expect(clearedCount()).toBe(1);
  });
});
