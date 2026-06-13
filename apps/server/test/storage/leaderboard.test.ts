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

/** Reģistrē kontu un ieskaita `wins` uzvaras + `losses` zaudējumus (atsevišķas partijas). */
async function seed(
  storage: SqliteStorage,
  id: string,
  wins: number,
  losses: number
): Promise<void> {
  await storage.createUser(user(id));
  let match = 0;
  for (let i = 0; i < wins; i += 1) {
    await storage.recordUserMatchOutcome(`${id}-m${match}`, id, "win", 2000 + match);
    match += 1;
  }
  for (let i = 0; i < losses; i += 1) {
    await storage.recordUserMatchOutcome(`${id}-m${match}`, id, "lose", 2000 + match);
    match += 1;
  }
}

describe("leaderboard (SqliteStorage)", () => {
  let storage: SqliteStorage;

  beforeEach(() => {
    storage = new SqliteStorage({ filename: ":memory:" });
  });

  afterEach(async () => {
    await storage.close();
  });

  it("ranks by win rate descending, 1-based ROW_NUMBER without gaps", async () => {
    await seed(storage, "carol", 9, 1); // 0.90
    await seed(storage, "alice", 8, 2); // 0.80
    await seed(storage, "bob", 6, 4); //   0.60

    const board = await storage.getLeaderboard(100, 1);
    expect(board.map((e) => [e.rank, e.userId])).toEqual([
      [1, "carol"],
      [2, "alice"],
      [3, "bob"]
    ]);
    expect(board[0]).toMatchObject({
      userId: "carol",
      wins: 9,
      losses: 1,
      gamesPlayed: 10,
      language: "en"
    });
    expect(board[0]?.winRate).toBeCloseTo(0.9, 6);
  });

  it("breaks win-rate ties by wins, then games, then username, then user_id", async () => {
    // Vienāds win rate 0.5 → tie-break pēc wins DESC (eve 4 > frank 2).
    await seed(storage, "eve", 4, 4); //   0.5, 8 games, 4 wins
    await seed(storage, "frank", 2, 2); // 0.5, 4 games, 2 wins

    const board = await storage.getLeaderboard(100, 1);
    expect(board.map((e) => e.userId)).toEqual(["eve", "frank"]);
  });

  it("excludes accounts below minGames and reflects it in getUserRank", async () => {
    await seed(storage, "veteran", 7, 3); // 10 games
    await seed(storage, "rookie", 5, 0); //   5 games, perfect 1.0 but too few

    const board = await storage.getLeaderboard(100, 10);
    expect(board.map((e) => e.userId)).toEqual(["veteran"]);

    // Spite of a perfect 1.0 win rate, rookie is not ranked (games < minGames).
    expect(await storage.getUserRank("rookie", 10)).toBeNull();
    expect(await storage.getUserRank("veteran", 10)).toMatchObject({ rank: 1, userId: "veteran" });
  });

  it("getUserRank returns the GLOBAL position even outside a limited window", async () => {
    await seed(storage, "p1", 10, 0); // 1.0
    await seed(storage, "p2", 9, 1); //  0.9
    await seed(storage, "p3", 8, 2); //  0.8
    await seed(storage, "p4", 7, 3); //  0.7 (outside a top-2 window)

    const top2 = await storage.getLeaderboard(2, 1);
    expect(top2.map((e) => e.userId)).toEqual(["p1", "p2"]);

    const mine = await storage.getUserRank("p4", 1);
    expect(mine).toMatchObject({ rank: 4, userId: "p4" });
  });

  it("getRankedSnapshot returns userId+rank for every qualifying account", async () => {
    await seed(storage, "a", 5, 5); // 0.5
    await seed(storage, "b", 6, 4); // 0.6
    await seed(storage, "c", 1, 0); // 1.0 but only 1 game

    const snapshot = await storage.getRankedSnapshot(2);
    // Only a (10g) and b (10g) qualify at minGames=2; c (1g) excluded.
    expect(snapshot).toEqual([
      { userId: "b", rank: 1 },
      { userId: "a", rank: 2 }
    ]);
  });

  it("returns empty results when nobody qualifies", async () => {
    await seed(storage, "solo", 1, 0);
    expect(await storage.getLeaderboard(100, 10)).toEqual([]);
    expect(await storage.getRankedSnapshot(10)).toEqual([]);
    expect(await storage.getUserRank("solo", 10)).toBeNull();
  });

  it("defaults language to 'en' and reflects setUserLanguage in the board", async () => {
    await seed(storage, "lina", 8, 2);

    // No preferences row yet → COALESCE default.
    expect((await storage.getLeaderboard(100, 1))[0]?.language).toBe("en");
    expect(await storage.getUserLanguage("lina")).toBeUndefined();

    await storage.setUserLanguage("lina", "lv", 5000);
    expect(await storage.getUserLanguage("lina")).toBe("lv");
    expect((await storage.getLeaderboard(100, 1))[0]?.language).toBe("lv");

    // Upsert is idempotent and overwrites.
    await storage.setUserLanguage("lina", "en", 6000);
    expect(await storage.getUserLanguage("lina")).toBe("en");
  });

  it("honours the limit argument", async () => {
    await seed(storage, "x1", 9, 1);
    await seed(storage, "x2", 8, 2);
    await seed(storage, "x3", 7, 3);

    expect((await storage.getLeaderboard(2, 1)).map((e) => e.userId)).toEqual(["x1", "x2"]);
  });
});
