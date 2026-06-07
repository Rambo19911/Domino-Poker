import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { UserRecord } from "../../src/auth/AuthStore.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";

function user(id: string): UserRecord {
  return {
    id,
    username: id,
    usernameNorm: id.toLowerCase(),
    passwordHash: "scrypt$16384$8$1$AA==$AA==",
    avatar: "avatar-01",
    createdAt: 1000,
    updatedAt: 1000
  };
}

describe("user MP stats (SqliteStorage)", () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    await storage.createUser(user("u1"));
  });

  afterEach(async () => {
    await storage.close();
  });

  it("records a win and aggregates into user_stats", async () => {
    const isNew = await storage.recordUserMatchOutcome("m1", "u1", "win", 2000);
    expect(isNew).toBe(true);
    expect(await storage.getUserStats("u1")).toEqual({
      userId: "u1",
      gamesPlayed: 1,
      wins: 1,
      losses: 0,
      updatedAt: 2000
    });
  });

  it("is idempotent per (match, user): a second outcome for the same match is ignored", async () => {
    expect(await storage.recordUserMatchOutcome("m1", "u1", "win", 2000)).toBe(true);
    // Atkārtots tā paša lietotāja iznākums tajā pašā partijā → ignorēts, stats nemainās.
    expect(await storage.recordUserMatchOutcome("m1", "u1", "lose", 3000)).toBe(false);
    expect(await storage.getUserStats("u1")).toMatchObject({
      gamesPlayed: 1,
      wins: 1,
      losses: 0
    });
  });

  it("accumulates across distinct matches", async () => {
    await storage.recordUserMatchOutcome("m1", "u1", "win", 2000);
    await storage.recordUserMatchOutcome("m2", "u1", "lose", 3000);
    await storage.recordUserMatchOutcome("m3", "u1", "win", 4000);
    expect(await storage.getUserStats("u1")).toMatchObject({
      gamesPlayed: 3,
      wins: 2,
      losses: 1
    });
  });

  it("returns undefined for a user with no recorded games", async () => {
    await storage.createUser(user("u2"));
    expect(await storage.getUserStats("u2")).toBeUndefined();
  });
});
