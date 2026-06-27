import type { AddressInfo } from "node:net";

import { THEME_PRICE } from "@domino-poker/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import { createAuthHandler } from "../../src/http/authRoutes.js";
import { createStoreHandler } from "../../src/http/storeRoutes.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { StoreService } from "../../src/store/StoreService.js";
import { WalletService } from "../../src/wallet/WalletService.js";

const ORIGIN = "http://localhost:3000";

describe("Store HTTP routes (integration)", () => {
  let storage: SqliteStorage;
  let wallet: WalletService;
  let server: ReturnType<typeof createHealthHttpServer>;
  let base: string;

  beforeEach(async () => {
    const clock = () => 100_000;
    storage = new SqliteStorage({ filename: ":memory:" });
    const auth = new AuthService({ store: storage, clock });
    wallet = new WalletService({ coins: storage, clock });
    const store = new StoreService(wallet);
    server = createHealthHttpServer({
      authHandler: createAuthHandler({ auth, wallet, webOrigins: [ORIGIN], clock, dev: true, trustProxy: false }),
      storeHandler: createStoreHandler({ auth, store, webOrigins: [ORIGIN], clock, dev: true })
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    await storage.close();
  });

  function post(path: string, body: unknown, token?: string): Promise<Response> {
    return fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    });
  }

  function get(path: string, token?: string): Promise<Response> {
    return fetch(`${base}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {}
    });
  }

  async function registerUser(username: string): Promise<{ token: string; id: string }> {
    const res = await post("/auth/register", {
      username,
      password: "secret123",
      email: `${username.toLowerCase()}@x.co`
    });
    const body = (await res.json()) as { token: string; user: { id: string } };
    return { token: body.token, id: body.user.id };
  }

  it("rejects buy and owned for anonymous users (401)", async () => {
    expect((await post("/store/buy", { itemId: "theme.bubbles" })).status).toBe(401);
    expect((await get("/store/owned")).status).toBe(401);
  });

  it("rejects an unknown item id (400)", async () => {
    const { token } = await registerUser("Alice");
    const res = await post("/store/buy", { itemId: "theme.nope" }, token);
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toEqual({ error: "unknown_item" });
  });

  it("returns 402 when the balance is below the catalog price", async () => {
    const { token } = await registerUser("Bob"); // 5000 signup < THEME_PRICE
    const res = await post("/store/buy", { itemId: "theme.bubbles" }, token);
    expect(res.status).toBe(402);
    expect((await res.json()) as { error: string; balance: number }).toEqual({
      error: "insufficient_coins",
      balance: 5000
    });
  });

  it("buys after a top-up, lists owned, and is idempotent on re-buy", async () => {
    const { token, id } = await registerUser("Carol");
    await wallet.adminAdjust(id, "topup-1", 300_000); // 305000 (in-process, kā admin korekcija)
    const expectedBalance = 305_000 - THEME_PRICE;

    const buy = await post("/store/buy", { itemId: "theme.bubbles" }, token);
    expect(buy.status).toBe(200);
    expect((await buy.json()) as unknown).toEqual({
      owned: true,
      alreadyOwned: false,
      balance: expectedBalance
    });

    const owned = await get("/store/owned", token);
    expect(owned.status).toBe(200);
    expect((await owned.json()) as { owned: string[] }).toEqual({ owned: ["theme.bubbles"] });

    // Atkārtots pirkums = alreadyOwned, bez dubulta debeta.
    const rebuy = await post("/store/buy", { itemId: "theme.bubbles" }, token);
    expect(rebuy.status).toBe(200);
    expect((await rebuy.json()) as { alreadyOwned: boolean; balance: number }).toMatchObject({
      alreadyOwned: true,
      balance: expectedBalance
    });
  });
});
