import { beforeEach, describe, expect, it } from "vitest";

import type { LeaderboardEntryRecord, RankSnapshotRecord } from "../../src/auth/AuthStore.js";
import {
  LeaderboardService,
  type LeaderboardDataSource
} from "../../src/leaderboard/LeaderboardService.js";
import type { UserStatsRecord } from "../../src/storage/StoragePort.js";

function record(rank: number, userId: string, wins: number, losses: number): LeaderboardEntryRecord {
  const games = wins + losses;
  return {
    rank,
    userId,
    username: `user-${userId}`,
    avatar: "avatar-01",
    wins,
    losses,
    gamesPlayed: games,
    winRate: games > 0 ? wins / games : 0,
    language: "en",
    updatedAt: 1000
  };
}

/** Kontrolējams `LeaderboardDataSource` (skaita izsaukumus keša testiem). */
class FakeStore implements LeaderboardDataSource {
  records: LeaderboardEntryRecord[] = [];
  stats = new Map<string, UserStatsRecord>();
  leaderboardCalls = 0;
  snapshotCalls = 0;
  /** Test hook: izsaukts katra `getLeaderboard` SĀKUMĀ (race scenāriju injekcijai). */
  onGetLeaderboard: (() => Promise<void> | void) | undefined = undefined;

  async getLeaderboard(limit: number, _minGames: number): Promise<readonly LeaderboardEntryRecord[]> {
    this.leaderboardCalls += 1;
    if (this.onGetLeaderboard) {
      await this.onGetLeaderboard();
    }
    return this.records.slice(0, limit);
  }

  async getRankedSnapshot(_minGames: number): Promise<readonly RankSnapshotRecord[]> {
    this.snapshotCalls += 1;
    return this.records.map((r) => ({ userId: r.userId, rank: r.rank }));
  }

  async getUserRank(userId: string, _minGames: number): Promise<LeaderboardEntryRecord | null> {
    return this.records.find((r) => r.userId === userId) ?? null;
  }

  async getUserStats(userId: string): Promise<UserStatsRecord | undefined> {
    return this.stats.get(userId);
  }
}

describe("LeaderboardService", () => {
  let store: FakeStore;
  let now: number;
  let svc: LeaderboardService;

  beforeEach(() => {
    store = new FakeStore();
    store.records = [
      record(1, "a", 10, 0),
      record(2, "b", 8, 2),
      record(3, "c", 6, 4),
      record(4, "d", 5, 5),
      record(5, "e", 4, 6)
    ];
    now = 1_000_000;
    svc = new LeaderboardService({
      store,
      clock: () => now,
      size: 3,
      minGames: 10,
      refreshMs: 30_000
    });
  });

  it("returns top `size` entries without internal userId, and anonymous self", async () => {
    const res = await svc.getResponse(null, 100);
    expect(res.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(res.entries[0]).not.toHaveProperty("userId");
    expect(res.entries[0]).toMatchObject({ rank: 1, username: "user-a", wins: 10, losses: 0 });
    expect(res.me).toEqual({ status: "anonymous" });
  });

  it("clamps the limit to the configured size", async () => {
    const res = await svc.getResponse(null, 100);
    expect(res.entries).toHaveLength(3); // size = 3, even though limit = 100
  });

  it("reports a ranked viewer inside the top window from cache", async () => {
    const res = await svc.getResponse("b", 3);
    expect(res.me).toEqual({ status: "ranked", entry: expect.objectContaining({ rank: 2, username: "user-b" }) });
  });

  it("reports a ranked viewer OUTSIDE the top window via a dedicated lookup", async () => {
    // 'e' is rank 5 but size = 3, so not in the cached entries.
    const res = await svc.getResponse("e", 3);
    expect(res.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
    expect(res.me).toEqual({ status: "ranked", entry: expect.objectContaining({ rank: 5, username: "user-e" }) });
  });

  it("reports an authenticated but unranked viewer with their game count", async () => {
    store.stats.set("rookie", { userId: "rookie", gamesPlayed: 4, wins: 4, losses: 0, updatedAt: 1 });
    const res = await svc.getResponse("rookie", 3);
    expect(res.me).toEqual({ status: "unranked", minGames: 10, gamesPlayed: 4 });
  });

  it("unranked viewer with no stats row reports 0 games", async () => {
    const res = await svc.getResponse("ghost", 3);
    expect(res.me).toEqual({ status: "unranked", minGames: 10, gamesPlayed: 0 });
  });

  it("resolves seat badges synchronously from the cache", async () => {
    await svc.getResponse(null, 3); // warm the cache
    expect(svc.getRankBadge("a")).toBe("Trophy-11"); // rank 1
    expect(svc.getRankBadge("d")).toBe("Trophy-8"); // rank 4 -> 4-5 bucket
    expect(svc.getRankBadge("e")).toBe("Trophy-8"); // rank 5 -> 4-5 bucket
    expect(svc.getRankBadge("ghost")).toBeNull(); // not ranked
  });

  it("caches within the TTL and rebuilds after it expires", async () => {
    await svc.getResponse(null, 3);
    await svc.getResponse(null, 3);
    expect(store.leaderboardCalls).toBe(1); // second call served from cache

    now += 30_000; // TTL elapsed
    await svc.getResponse(null, 3);
    expect(store.leaderboardCalls).toBe(2);
  });

  it("rebuilds once (deduped) after notifyStatsChanged", async () => {
    await svc.getResponse(null, 3);
    expect(store.leaderboardCalls).toBe(1);

    store.records = [record(1, "z", 20, 0), ...store.records.map((r) => record(r.rank + 1, r.userId, r.wins, r.losses))];
    svc.notifyStatsChanged(); // kicks off a background rebuild
    const res = await svc.getResponse(null, 3); // shares the in-flight rebuild

    expect(store.leaderboardCalls).toBe(2); // exactly one extra rebuild, not two
    expect(res.entries[0]).toMatchObject({ username: "user-z" });
  });

  it("does not lose a stats change that arrives DURING an in-flight rebuild", async () => {
    await svc.getResponse(null, 3); // initial build (generation 0)

    // Gate the next rebuild so we can inject a notify while it is awaiting storage.
    let release!: () => void;
    let injected = false;
    store.onGetLeaderboard = () => {
      if (injected) {
        return;
      }
      injected = true;
      // A second stats change lands mid-rebuild; it must NOT be swallowed.
      store.records = [record(1, "late", 30, 0)];
      svc.notifyStatsChanged();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    };

    store.records = [record(1, "first", 10, 0)];
    svc.notifyStatsChanged(); // starts rebuild A (will be gated)
    await Promise.resolve();
    release(); // let rebuild A finish (with the now-stale "first" data)
    store.onGetLeaderboard = undefined;

    // The mid-rebuild notify bumped the generation, forcing AT LEAST one more rebuild
    // after the gated rebuild A (so >= 3 total: initial + A + forced), and the cache
    // reflects the LATEST data. A buggy boolean `dirty` flag would clear after rebuild
    // A and never rebuild again (stuck at 2 until TTL) — this asserts that did not happen.
    const res = await svc.getResponse(null, 3);
    expect(store.leaderboardCalls).toBeGreaterThanOrEqual(3);
    expect(res.entries[0]).toMatchObject({ username: "user-late" });
  });
});
