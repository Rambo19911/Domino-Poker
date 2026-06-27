import { THEME_PRICE } from "@domino-poker/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { UserRecord } from "../../src/auth/AuthStore.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { StoreService } from "../../src/store/StoreService.js";
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

describe("StoreService", () => {
  let storage: SqliteStorage;
  let wallet: WalletService;
  let store: StoreService;
  let ids: number;

  beforeEach(async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    await storage.createUser(user("u1"));
    ids = 0;
    wallet = new WalletService({ coins: storage, clock: () => 5000, createId: () => `led-${++ids}` });
    store = new StoreService(wallet);
  });

  afterEach(async () => {
    await storage.close();
  });

  it("rejects an unknown item id (client cannot invent items/prices)", async () => {
    await wallet.grantSignupBonus("u1");
    expect(await store.purchase("u1", "theme.nope")).toEqual({ ok: false, reason: "unknown_item" });
  });

  it("rejects when the balance is below the catalog price (no debit)", async () => {
    await wallet.grantSignupBonus("u1"); // 5000 < THEME_PRICE
    expect(await store.purchase("u1", "theme.bubbles")).toEqual({
      ok: false,
      reason: "insufficient",
      balance: 5000
    });
    expect(await store.listOwned("u1")).toEqual([]);
  });

  it("purchases at the catalog price, is idempotent (alreadyOwned), and lists owned", async () => {
    await wallet.grantSignupBonus("u1"); // 5000
    await wallet.adminAdjust("u1", "topup-1", 300_000); // 305000
    const expectedBalance = 305_000 - THEME_PRICE;

    const first = await store.purchase("u1", "theme.bubbles");
    expect(first).toEqual({ ok: true, alreadyOwned: false, balance: expectedBalance });

    // Atkārtots pirkums = alreadyOwned, bez dubulta debeta.
    const second = await store.purchase("u1", "theme.bubbles");
    expect(second).toEqual({ ok: true, alreadyOwned: true, balance: expectedBalance });
    expect(await storage.getBalance("u1")).toBe(expectedBalance);

    expect(await store.listOwned("u1")).toEqual(["theme.bubbles"]);
  });
});
