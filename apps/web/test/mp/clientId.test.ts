import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLIENT_ID_STORAGE_KEY, getOrCreateClientId } from "../../lib/mp/clientId";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      }
    }
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("getOrCreateClientId (8.3)", () => {
  it("generates and persists a client id on first use", () => {
    const id = getOrCreateClientId();
    expect(id.length).toBeGreaterThan(0);
    expect(store.get(CLIENT_ID_STORAGE_KEY)).toBe(id);
  });

  it("returns the same id on subsequent calls", () => {
    const first = getOrCreateClientId();
    const second = getOrCreateClientId();
    expect(second).toBe(first);
  });

  it("reuses an already-stored id", () => {
    store.set(CLIENT_ID_STORAGE_KEY, "existing-client");
    expect(getOrCreateClientId()).toBe("existing-client");
  });
});
