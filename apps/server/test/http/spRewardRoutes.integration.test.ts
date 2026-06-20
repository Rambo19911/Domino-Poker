import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import { createAuthHandler } from "../../src/http/authRoutes.js";
import { createSpRewardHandler } from "../../src/http/spRewardRoutes.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { SpRewardTokens } from "../../src/sp/SpRewardTokens.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";

const ORIGIN = "http://localhost:3000";

describe("SP reward HTTP routes (integration)", () => {
  let storage: SqliteStorage;
  let wallet: WalletService;
  let server: ReturnType<typeof createHealthHttpServer>;
  let base: string;
  let nowMs: number;

  beforeEach(async () => {
    nowMs = 100_000;
    const clock = () => nowMs;
    storage = new SqliteStorage({ filename: ":memory:" });
    const auth = new AuthService({ store: storage, clock });
    wallet = new WalletService({ coins: storage, clock });
    const tokens = new SpRewardTokens({ clock, ttlMs: 30 * 60 * 1000, maxPerUser: 3, createId: idFactory() });
    server = createHealthHttpServer({
      authHandler: createAuthHandler({ auth, wallet, webOrigins: [ORIGIN], clock, dev: true, trustProxy: false }),
      spRewardHandler: createSpRewardHandler({ auth, wallet, tokens, webOrigins: [ORIGIN], clock, dev: true })
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

  function idFactory(): () => string {
    let n = 0;
    return () => `wf-${++n}`;
  }

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

  async function registerUser(username: string): Promise<{ token: string; id: string }> {
    const res = await post("/auth/register", {
      username,
      password: "secret123",
      email: `${username.toLowerCase()}@x.co`
    });
    const body = (await res.json()) as { token: string; user: { id: string } };
    return { token: body.token, id: body.user.id };
  }

  async function startGame(token: string, difficulty: string): Promise<string> {
    const res = await post("/sp/start", { difficulty }, token);
    const body = (await res.json()) as { gameToken: string };
    return body.gameToken;
  }

  it("rejects /sp/start and /sp/reward for anonymous users (401)", async () => {
    expect((await post("/sp/start", { difficulty: "hard" })).status).toBe(401);
    expect((await post("/sp/reward", { gameToken: "x", placement: 1 })).status).toBe(401);
  });

  it("awards the difficulty-based amount on a valid token after a full game", async () => {
    const { token } = await registerUser("Alice");
    const gameToken = await startGame(token, "hard");
    nowMs += 6000; // pārsniedz min spēles ilgumu (5s)
    const res = await post("/sp/reward", { gameToken, placement: 1 }, token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ awarded: 100, balance: 5100 }); // 5000 signup + 100 hard
  });

  it("derives the reward from the START difficulty, not the client", async () => {
    const { token } = await registerUser("Bob");
    const gameToken = await startGame(token, "medium"); // medium → 50
    nowMs += 6000;
    const res = await post("/sp/reward", { gameToken, placement: 1 }, token);
    expect((await res.json() as { awarded: number }).awarded).toBe(50);
  });

  it("is one-time: reusing a consumed token is rejected (409)", async () => {
    const { token } = await registerUser("Carol");
    const gameToken = await startGame(token, "epic");
    nowMs += 6000;
    expect((await post("/sp/reward", { gameToken, placement: 1 }, token)).status).toBe(200);
    expect((await post("/sp/reward", { gameToken, placement: 1 }, token)).status).toBe(409);
  });

  it("rejects an unknown game token (409)", async () => {
    const { token } = await registerUser("Dave");
    expect((await post("/sp/reward", { gameToken: "nope", placement: 1 }, token)).status).toBe(409);
  });

  it("awards nothing for a suspiciously fast game (under the minimum duration)", async () => {
    const { token } = await registerUser("Eve");
    const gameToken = await startGame(token, "epic");
    // bez clock advance → start≈reward → awarded 0 (graciozi)
    const res = await post("/sp/reward", { gameToken, placement: 1 }, token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ awarded: 0, balance: 5000 });
  });

  it("awards nothing once the daily cap is reached", async () => {
    const { token, id } = await registerUser("Frank");
    // Pirms-piepilda dienas SP balvu summu līdz griestiem (3000).
    await wallet.creditSpReward(id, "seed-cap", 3000);
    const gameToken = await startGame(token, "epic");
    nowMs += 6000;
    const res = await post("/sp/reward", { gameToken, placement: 1 }, token);
    expect(res.status).toBe(200);
    expect((await res.json() as { awarded: number }).awarded).toBe(0);
  });

  it("clamps the reward to the remaining daily cap (no overshoot)", async () => {
    const { token, id } = await registerUser("Grace");
    await wallet.creditSpReward(id, "seed-near-cap", 2900); // atliek 100 līdz 3000
    const gameToken = await startGame(token, "epic"); // epic = 300
    nowMs += 6000;
    const res = await post("/sp/reward", { gameToken, placement: 1 }, token);
    expect(res.status).toBe(200);
    expect((await res.json() as { awarded: number }).awarded).toBe(100);
  });
});
