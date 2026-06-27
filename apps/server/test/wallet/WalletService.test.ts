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
    expect(await wallet.creditSpReward("u1", "game-A", 100)).toEqual({ applied: true, balance: 5100 });
    // Tas pats tokens → idempotents (applied:false), neieskaita divreiz.
    expect(await wallet.creditSpReward("u1", "game-A", 100)).toEqual({ applied: false, balance: 5100 });
    // Cits tokens → ieskaita (applied:true).
    expect(await wallet.creditSpReward("u1", "game-B", 300)).toEqual({ applied: true, balance: 5400 });
  });

  it("purchaseItem debits the price, is idempotent per item, and derives owned items from the ledger", async () => {
    await wallet.grantSignupBonus("u1"); // 5000
    // Pirkums atskaita cenu.
    expect(await wallet.purchaseItem("u1", "theme.bubbles", 2000)).toEqual({
      ok: true,
      applied: true,
      balance: 3000
    });
    expect(await storage.getBalance("u1")).toBe(3000);
    // Atkārtots tās pašas preces pirkums = idempotents (applied:false), NEdebetē divreiz.
    expect(await wallet.purchaseItem("u1", "theme.bubbles", 2000)).toEqual({
      ok: true,
      applied: false,
      balance: 3000
    });
    expect(await storage.getBalance("u1")).toBe(3000);
    // Cita prece = atsevišķs debets.
    expect(await wallet.purchaseItem("u1", "theme.rain", 1000)).toEqual({
      ok: true,
      applied: true,
      balance: 2000
    });
    // Īpašumtiesības atvasinātas no ledger (reason theme_purchase, ref = itemId).
    expect([...(await wallet.listOwnedItems("u1"))].sort()).toEqual(["theme.bubbles", "theme.rain"]);
  });

  it("purchaseItem rejects when balance is insufficient (no debit, not owned)", async () => {
    await wallet.grantSignupBonus("u1"); // 5000
    expect(await wallet.purchaseItem("u1", "theme.bubbles", 6000)).toEqual({
      ok: false,
      reason: "insufficient"
    });
    expect(await storage.getBalance("u1")).toBe(5000);
    expect(await wallet.listOwnedItems("u1")).toEqual([]);
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

  describe("MP entry fee / refund / payout (Phase 3)", () => {
    it("debits an entry fee and rejects when funds are insufficient", async () => {
      await wallet.grantSignupBonus("u1"); // 5000
      const ok = await wallet.debitEntryFee("u1", "entry-A", 2000);
      expect(ok).toEqual({ ok: true, balance: 3000 });
      const tooMuch = await wallet.debitEntryFee("u1", "entry-B", 4000);
      expect(tooMuch).toEqual({ ok: false, reason: "insufficient" });
      // Bilance nemainās pēc noraidīta debeta.
      expect(await storage.getBalance("u1")).toBe(3000);
    });

    it("debit is idempotent per entryId (reconnect / replay never double-charges)", async () => {
      await wallet.grantSignupBonus("u1");
      await wallet.debitEntryFee("u1", "entry-A", 1000);
      // Tas pats entryId → idempotents no-op, bilance nemainās.
      const replay = await wallet.debitEntryFee("u1", "entry-A", 1000);
      expect(replay).toEqual({ ok: true, balance: 4000 });
      expect(await storage.getBalance("u1")).toBe(4000);
    });

    it("refunds exactly the matching entry and is idempotent per entryId", async () => {
      await wallet.grantSignupBonus("u1");
      await wallet.debitEntryFee("u1", "entry-A", 1500); // 3500
      expect(await wallet.refundEntryFee("u1", "entry-A", 1500)).toBe(5000);
      // Dubults refund (leave + TTL sweep) → idempotents, neieskaita divreiz.
      expect(await wallet.refundEntryFee("u1", "entry-A", 1500)).toBe(5000);
    });

    it("refund→rejoin the same room is NOT a free seat (entryId differs per occupation)", async () => {
      await wallet.grantSignupBonus("u1");
      await wallet.debitEntryFee("u1", "entry-1", 1000); // 4000
      await wallet.refundEntryFee("u1", "entry-1", 1000); // 5000
      // Atkārtota ieņemšana = JAUNS entryId → reāls debets (nevis idempotents no-op).
      const rejoin = await wallet.debitEntryFee("u1", "entry-2", 1000);
      expect(rejoin).toEqual({ ok: true, balance: 4000 });
    });

    it("pays out a pot share once per match (idempotent by matchId)", async () => {
      await wallet.grantSignupBonus("u1");
      expect(await wallet.payoutCoins("u1", "match-X", 700)).toBe(5700);
      // Atkārtots GAME_OVER tam pašam match → idempotents, neizmaksā divreiz.
      expect(await wallet.payoutCoins("u1", "match-X", 700)).toBe(5700);
      // Cits match → izmaksā.
      expect(await wallet.payoutCoins("u1", "match-Y", 300)).toBe(6000);
    });
  });
});
