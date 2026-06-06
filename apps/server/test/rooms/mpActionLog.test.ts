import { describe, expect, it } from "vitest";

import { resolveMpActionLogEnabled } from "../../src/rooms/mpActionLog.js";

describe("mpActionLog enable flag (F8 — opt-in)", () => {
  it("is OFF by default when no env flag is set", () => {
    expect(resolveMpActionLogEnabled({})).toBe(false);
  });

  it("is ON only when MP_ACTION_LOG is 1 or true", () => {
    expect(resolveMpActionLogEnabled({ MP_ACTION_LOG: "1" })).toBe(true);
    expect(resolveMpActionLogEnabled({ MP_ACTION_LOG: "true" })).toBe(true);
  });

  it("stays OFF for explicit 0/false or unrelated values", () => {
    expect(resolveMpActionLogEnabled({ MP_ACTION_LOG: "0" })).toBe(false);
    expect(resolveMpActionLogEnabled({ MP_ACTION_LOG: "false" })).toBe(false);
    expect(resolveMpActionLogEnabled({ MP_ACTION_LOG: "yes" })).toBe(false);
  });

  it("does not depend on VITEST (default-off no longer needs a test special-case)", () => {
    expect(resolveMpActionLogEnabled({ VITEST: "true" })).toBe(false);
  });
});
