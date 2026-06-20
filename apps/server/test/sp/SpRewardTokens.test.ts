import { describe, expect, it } from "vitest";

import { SpRewardTokens } from "../../src/sp/SpRewardTokens.js";

function makeTokens(nowRef: { ms: number }, overrides: { ttlMs?: number; maxPerUser?: number } = {}) {
  let id = 0;
  return new SpRewardTokens({
    clock: () => nowRef.ms,
    ttlMs: overrides.ttlMs ?? 30 * 60 * 1000,
    maxPerUser: overrides.maxPerUser ?? 3,
    createId: () => `tok-${++id}`
  });
}

describe("SpRewardTokens", () => {
  it("issues a token that consume resolves to its difficulty + issuedAt for the owner", () => {
    const now = { ms: 1000 };
    const tokens = makeTokens(now);
    const token = tokens.issue("u1", "hard");
    expect(tokens.consume(token, "u1")).toEqual({ difficulty: "hard", issuedAt: 1000 });
  });

  it("is one-time: a second consume of the same token returns null", () => {
    const now = { ms: 1000 };
    const tokens = makeTokens(now);
    const token = tokens.issue("u1", "epic");
    expect(tokens.consume(token, "u1")).not.toBeNull();
    expect(tokens.consume(token, "u1")).toBeNull();
  });

  it("rejects consume by a different user (ownership)", () => {
    const now = { ms: 1000 };
    const tokens = makeTokens(now);
    const token = tokens.issue("u1", "medium");
    expect(tokens.consume(token, "u2")).toBeNull();
  });

  it("rejects an expired token after the TTL elapses", () => {
    const now = { ms: 1000 };
    const tokens = makeTokens(now, { ttlMs: 10_000 });
    const token = tokens.issue("u1", "medium");
    now.ms = 1000 + 10_000; // exactly at TTL → expired
    expect(tokens.consume(token, "u1")).toBeNull();
  });

  it("evicts the oldest token when a user exceeds maxPerUser", () => {
    const now = { ms: 1000 };
    const tokens = makeTokens(now, { maxPerUser: 2 });
    const t1 = tokens.issue("u1", "medium");
    now.ms += 1;
    const t2 = tokens.issue("u1", "hard");
    now.ms += 1;
    const t3 = tokens.issue("u1", "epic"); // exceeds 2 → t1 evicted
    expect(tokens.consume(t1, "u1")).toBeNull();
    expect(tokens.consume(t2, "u1")).toEqual({ difficulty: "hard", issuedAt: 1001 });
    expect(tokens.consume(t3, "u1")).toEqual({ difficulty: "epic", issuedAt: 1002 });
  });
});
