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
});
