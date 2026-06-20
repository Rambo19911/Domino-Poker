import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { UserRecord } from "../../src/auth/AuthStore.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";

function user(id: string): UserRecord {
  return {
    id,
    username: id,
    usernameNorm: id.toLowerCase(),
    passwordHash: "scrypt$fake",
    avatar: "avatar-01",
    createdAt: 1000,
    updatedAt: 1000
  };
}

describe("WalletService", () => {
  let storage: SqliteStorage;
  let wallet: WalletService;
  let ids: number;

  beforeEach(async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    await storage.createUser(user("u1"));
    ids = 0;
    wallet = new WalletService({
      coins: storage,
      clock: () => 5000,
      createId: () => `led-${++ids}`
    });
  });

  afterEach(async () => {
    await storage.close();
  });

  it("grants the 5000 starting bonus on first call", async () => {
    expect(await wallet.grantSignupBonus("u1")).toBe(5000);
    expect(await storage.getBalance("u1")).toBe(5000);
  });

  it("is idempotent: a second signup grant does not double the balance", async () => {
    await wallet.grantSignupBonus("u1");
    expect(await wallet.grantSignupBonus("u1")).toBe(5000);
    expect(await storage.getBalance("u1")).toBe(5000);
  });

  it("getBalance is repair-on-read: it lazily grants the bonus for a fresh wallet", async () => {
    // Maks vēl nav aizskarts → tieša storage bilance ir 0.
    expect(await storage.getBalance("u1")).toBe(0);
    // getBalance nodrošina starta bonusu (jauns lietotājs / esošo backfill).
    expect(await wallet.getBalance("u1")).toBe(5000);
    expect(await storage.getBalance("u1")).toBe(5000);
  });

  it("credits an SP reward and is idempotent per gameToken", async () => {
    await wallet.grantSignupBonus("u1");
    expect(await wallet.creditSpReward("u1", "game-A", 100)).toBe(5100);
    // Tas pats tokens → idempotents, neieskaita divreiz.
    expect(await wallet.creditSpReward("u1", "game-A", 100)).toBe(5100);
    // Cits tokens → ieskaita.
    expect(await wallet.creditSpReward("u1", "game-B", 300)).toBe(5400);
  });

  it("sums SP rewards within the last 24h for the daily cap", async () => {
    await wallet.grantSignupBonus("u1");
    await wallet.creditSpReward("u1", "game-A", 100);
    await wallet.creditSpReward("u1", "game-B", 300);
    // clock() = 5000 (fiksēts); pēdējās 24h logs aptver abas balvas.
    expect(await wallet.spRewardLast24h("u1", 5000)).toBe(400);
    // Signup bonuss NETIEK skaitīts (cits reason).
    expect(await wallet.spRewardLast24h("u1", 5000)).not.toBe(5400);
  });

  it("clamps an SP reward to the remaining daily cap (no overshoot)", async () => {
    await wallet.grantSignupBonus("u1");
    await wallet.creditSpReward("u1", "seed", 2900); // jau nopelnīts šodien
    const r = await wallet.creditSpRewardCapped("u1", "g1", 300, 3000, 5000);
    expect(r.awarded).toBe(100); // min(300, 3000-2900)
    expect(await wallet.spRewardLast24h("u1", 5000)).toBe(3000);
  });

  it("never overspends the daily cap under concurrent rewards (per-user lock)", async () => {
    await wallet.grantSignupBonus("u1");
    await wallet.creditSpReward("u1", "seed", 2900);
    const [a, b] = await Promise.all([
      wallet.creditSpRewardCapped("u1", "g1", 300, 3000, 5000),
      wallet.creditSpRewardCapped("u1", "g2", 300, 3000, 5000)
    ]);
    // Serializēts: viens saņem 100, otrs 0 → kopā tieši atlikušais griestu apjoms.
    expect(a.awarded + b.awarded).toBe(100);
    expect(await wallet.spRewardLast24h("u1", 5000)).toBe(3000);
  });
});
