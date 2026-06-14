import { describe, expect, it } from "vitest";

import { decideReloadAction, isReloadSafe, setReloadSafe } from "../../lib/pwa/reloadGate";

describe("decideReloadAction", () => {
  it("ignores the first install (page was not yet controlled)", () => {
    expect(decideReloadAction({ hadController: false, reloadSafe: true })).toBe("ignore");
    expect(decideReloadAction({ hadController: false, reloadSafe: false })).toBe("ignore");
  });

  it("reloads silently on update when reload is safe (main lobby)", () => {
    expect(decideReloadAction({ hadController: true, reloadSafe: true })).toBe("reload");
  });

  it("prompts (no silent reload) on update during an active game", () => {
    expect(decideReloadAction({ hadController: true, reloadSafe: false })).toBe("prompt");
  });
});

describe("reloadSafe signal", () => {
  it("defaults to unsafe (prompt) and reflects the last set value", () => {
    expect(isReloadSafe()).toBe(false);
    setReloadSafe(true);
    expect(isReloadSafe()).toBe(true);
    setReloadSafe(false);
    expect(isReloadSafe()).toBe(false);
  });
});
