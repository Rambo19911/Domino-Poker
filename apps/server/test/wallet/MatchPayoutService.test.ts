import { describe, expect, it, vi } from "vitest";

import type { MatchSeatRecord, MatchStartedRecord } from "../../src/storage/StoragePort.js";
import { MatchPayoutService } from "../../src/wallet/MatchPayoutService.js";

/** Viltus maks: reģistrē izmaksas, atgriež pieaugošu bilanci uz lietotāju. */
function fakeWallet() {
  const calls: { userId: string; matchId: string; amount: number }[] = [];
  const balances = new Map<string, number>();
  return {
    calls,
    async payoutCoins(userId: string, matchId: string, amount: number): Promise<number> {
      calls.push({ userId, matchId, amount });
      const next = (balances.get(userId) ?? 5000) + amount;
      balances.set(userId, next);
      return next;
    }
  };
}

function seat(
  index: number,
  kind: "human" | "bot",
  opts: { userId?: string; clientId?: string } = {}
): MatchSeatRecord {
  return {
    seatIndex: index,
    corePlayerId: String(index + 1),
    kind,
    ...(opts.clientId !== undefined ? { clientId: opts.clientId } : {}),
    ...(opts.userId !== undefined ? { userId: opts.userId } : {})
  };
}

function startedRecord(
  matchId: string,
  players: readonly MatchSeatRecord[],
  pot: number | undefined
): MatchStartedRecord {
  return {
    matchId,
    seed: "seed",
    numberOfRounds: 7,
    players,
    startedAt: 1000,
    ...(pot !== undefined ? { pot } : {})
  };
}

describe("MatchPayoutService", () => {
  it("splits a pot 70/30 between the top-2 registered humans (remainder to 1st)", async () => {
    const wallet = fakeWallet();
    const svc = new MatchPayoutService({ wallet });
    const roster = [
      seat(0, "human", { userId: "u1", clientId: "c1" }),
      seat(1, "human", { userId: "u2", clientId: "c2" }),
      seat(2, "human", { userId: "u3", clientId: "c3" }),
      seat(3, "human", { userId: "u4", clientId: "c4" })
    ];
    svc.matchStarted(startedRecord("m1", roster, 250));
    // standings: 1. vieta core "2" (u2), 2. vieta core "1" (u1), tad pārējie.
    const results = await svc.gameOver("m1", ["2", "1", "3", "4"]);

    expect(results).toEqual([
      { clientId: "c2", userId: "u2", amount: 175, balance: 5175 }, // 250-75
      { clientId: "c1", userId: "u1", amount: 75, balance: 5075 } // floor(250*0.3)
    ]);
  });

  it("gives 100% to the single registered human (A2)", async () => {
    const wallet = fakeWallet();
    const svc = new MatchPayoutService({ wallet });
    const roster = [
      seat(0, "human", { userId: "u1", clientId: "c1" }),
      seat(1, "bot"),
      seat(2, "bot"),
      seat(3, "bot")
    ];
    svc.matchStarted(startedRecord("m1", roster, 50));
    const results = await svc.gameOver("m1", ["2", "1", "3", "4"]);
    expect(results).toEqual([{ clientId: "c1", userId: "u1", amount: 50, balance: 5050 }]);
    // Boti nesaņem neko.
    expect(wallet.calls).toHaveLength(1);
  });

  it("excludes forfeited humans even if their bot-played seat finishes top-2", async () => {
    const wallet = fakeWallet();
    const svc = new MatchPayoutService({ wallet });
    const roster = [
      seat(0, "human", { userId: "u1", clientId: "c1" }),
      seat(1, "human", { userId: "u2", clientId: "c2" }),
      seat(2, "human", { userId: "u3", clientId: "c3" }),
      seat(3, "bot")
    ];
    svc.matchStarted(startedRecord("m1", roster, 300));
    svc.playerForfeited("m1", "1"); // u1 forfeitē
    // standings: 1. vieta core "1" (u1, forfeitējis → izslēgts), tad "2", "3".
    const results = await svc.gameOver("m1", ["1", "2", "3", "4"]);
    // Izmaksā u2 (70%) un u3 (30%); u1 izlaists.
    expect(results.map((r) => r.userId)).toEqual(["u2", "u3"]);
    expect(results[0]!.amount).toBe(210); // 300-90
    expect(results[1]!.amount).toBe(90); // floor(300*0.3)
  });

  it("is idempotent: a second gameOver pays nothing (cache cleared)", async () => {
    const wallet = fakeWallet();
    const svc = new MatchPayoutService({ wallet });
    svc.matchStarted(
      startedRecord("m1", [seat(0, "human", { userId: "u1", clientId: "c1" })], 100)
    );
    await svc.gameOver("m1", ["1"]);
    const second = await svc.gameOver("m1", ["1"]);
    expect(second).toEqual([]);
    expect(wallet.calls).toHaveLength(1);
  });

  it("ignores free games (no pot) and abandoned matches", async () => {
    const wallet = fakeWallet();
    const svc = new MatchPayoutService({ wallet });
    // Bezmaksas (pot izlaists) → nekešo → nav izmaksas.
    svc.matchStarted(startedRecord("free", [seat(0, "human", { userId: "u1" })], undefined));
    expect(await svc.gameOver("free", ["1"])).toEqual([]);
    // Pamesta maksas spēle → nav kam izmaksāt.
    svc.matchStarted(startedRecord("ab", [seat(0, "human", { userId: "u1" })], 100));
    svc.matchAbandoned("ab");
    expect(await svc.gameOver("ab", ["1"])).toEqual([]);
    expect(wallet.calls).toHaveLength(0);
  });

  it("reports a payout DB error without throwing (fire-and-forget safety)", async () => {
    const onError = vi.fn();
    const wallet = {
      payoutCoins: vi.fn().mockRejectedValue(new Error("db down"))
    };
    const svc = new MatchPayoutService({ wallet, onError });
    svc.matchStarted(
      startedRecord("m1", [seat(0, "human", { userId: "u1", clientId: "c1" })], 100)
    );
    const results = await svc.gameOver("m1", ["1"]);
    expect(results).toEqual([]); // izmaksa neizdevās → nav push
    expect(onError).toHaveBeenCalledOnce();
  });
});
