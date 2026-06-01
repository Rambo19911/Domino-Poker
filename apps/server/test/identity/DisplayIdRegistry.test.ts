import { describe, expect, it } from "vitest";

import {
  DISPLAY_ID_PATTERN,
  DisplayIdRegistry
} from "../../src/identity/DisplayIdRegistry.js";

describe("DisplayIdRegistry", () => {
  it("assigns ids in the #????? (5-digit) format", () => {
    const registry = new DisplayIdRegistry();
    const displayId = registry.assign("player-1");
    expect(displayId).toMatch(DISPLAY_ID_PATTERN);
  });

  it("is stable within a session (same playerId → same displayId)", () => {
    const registry = new DisplayIdRegistry();
    const first = registry.assign("player-1");
    const second = registry.assign("player-1");
    expect(second).toBe(first);
    expect(registry.size()).toBe(1);
  });

  it("derives deterministically (same playerId → same id in a fresh registry)", () => {
    const a = new DisplayIdRegistry().assign("player-42");
    const b = new DisplayIdRegistry().assign("player-42");
    expect(a).toBe(b);
  });

  it("uses the same format for bot players", () => {
    const registry = new DisplayIdRegistry();
    const botId = registry.assign("bot-seat-3");
    expect(botId).toMatch(DISPLAY_ID_PATTERN);
  });

  it("keeps every assigned id unique, regenerating on collisions", () => {
    const registry = new DisplayIdRegistry();
    const assigned = new Set<string>();

    // Daudz spēlētāju → birthday-paradox sadursmes izpilda pārģenerēšanas ceļu.
    for (let index = 0; index < 1_000; index += 1) {
      const displayId = registry.assign(`player-${index}`);
      expect(displayId).toMatch(DISPLAY_ID_PATTERN);
      expect(assigned.has(displayId)).toBe(false);
      assigned.add(displayId);
    }
    expect(registry.size()).toBe(1_000);
  });

  it("frees an id on release so it can be reused", () => {
    const registry = new DisplayIdRegistry();
    const original = registry.assign("player-1");
    registry.release("player-1");
    expect(registry.has("player-1")).toBe(false);
    expect(registry.size()).toBe(0);

    // Pēc atbrīvošanas tas pats playerId atkal saņem to pašu deterministisko id.
    const reassigned = registry.assign("player-1");
    expect(reassigned).toBe(original);
  });

  it("reports get/has correctly", () => {
    const registry = new DisplayIdRegistry();
    expect(registry.get("player-1")).toBeUndefined();
    expect(registry.has("player-1")).toBe(false);

    const displayId = registry.assign("player-1");
    expect(registry.get("player-1")).toBe(displayId);
    expect(registry.has("player-1")).toBe(true);
  });

  it("rejects an empty playerId", () => {
    const registry = new DisplayIdRegistry();
    expect(() => registry.assign("   ")).toThrow("non-empty playerId");
  });
});
