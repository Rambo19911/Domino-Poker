import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import { createAuthHandler } from "../../src/http/authRoutes.js";
import { createSpRewardHandler } from "../../src/http/spRewardRoutes.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { SpRewardTokens } from "../../src/sp/SpRewardTokens.js";
import { PlayerStatsService } from "../../src/stats/PlayerStatsService.js";
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
    const stats = new PlayerStatsService({ store: storage });
    server = createHealthHttpServer({
      authHandler: createAuthHandler({ auth, wallet, webOrigins: [ORIGIN], clock, dev: true, trustProxy: false }),
      spRewardHandler: createSpRewardHandler({ auth, wallet, tokens, stats, webOrigins: [ORIGIN], clock, dev: true })
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

  async function startGame(token: string, difficulty: string, rounds = 7): Promise<string> {
    const res = await post("/sp/start", { difficulty, rounds }, token);
    const body = (await res.json()) as { gameToken: string };
    return body.gameToken;
  }

  function complete(
    token: string,
    gameToken: string,
    body: { placement: number; bidMet: number; bidExceeded: number; bidMissed: number }
  ): Promise<Response> {
    return post("/sp/complete", { gameToken, ...body }, token);
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

  describe("/sp/complete (deep stats)", () => {
    it("records a completed game and (placement 1) awards coins", async () => {
      const { token, id } = await registerUser("Heidi");
      const gameToken = await startGame(token, "hard", 7);
      nowMs += 6000;
      const res = await complete(token, gameToken, { placement: 1, bidMet: 5, bidExceeded: 1, bidMissed: 1 });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ recorded: true, coinsAwarded: 100, balance: 5100 });
      expect(await storage.getPlayerGameStats(id)).toEqual([
        { mode: "sp", difficulty: "hard", placement: 1, games: 1, bidMet: 5, bidExceeded: 1, bidMissed: 1 }
      ]);
    });

    it("records a losing game (placement 3) with no coins", async () => {
      const { token, id } = await registerUser("Ivan");
      const gameToken = await startGame(token, "medium", 5);
      nowMs += 6000;
      const res = await complete(token, gameToken, { placement: 3, bidMet: 2, bidExceeded: 2, bidMissed: 1 });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ recorded: true, coinsAwarded: 0, balance: 5000 });
      expect(await storage.getPlayerGameStats(id)).toEqual([
        { mode: "sp", difficulty: "medium", placement: 3, games: 1, bidMet: 2, bidExceeded: 2, bidMissed: 1 }
      ]);
    });

    it("records stats even for a too-fast game but awards no coins", async () => {
      const { token, id } = await registerUser("Judy");
      const gameToken = await startGame(token, "epic", 4);
      // bez clock advance → zem min ilguma → monētas 0, bet statistika ierakstīta
      const res = await complete(token, gameToken, { placement: 1, bidMet: 2, bidExceeded: 1, bidMissed: 1 });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ recorded: true, coinsAwarded: 0, balance: 5000 });
      expect(await storage.getPlayerGameStats(id)).toHaveLength(1);
    });

    it("rejects when bid counts do not sum to the token round count (400)", async () => {
      const { token } = await registerUser("Mallory");
      const gameToken = await startGame(token, "hard", 7);
      nowMs += 6000;
      // summa 1+1+1=3 != 7
      expect((await complete(token, gameToken, { placement: 1, bidMet: 1, bidExceeded: 1, bidMissed: 1 })).status).toBe(400);
    });

    it("is replayable: a second completion of the same token is a stable success (recorded:false, no re-award)", async () => {
      const { token } = await registerUser("Niaj");
      const gameToken = await startGame(token, "hard", 7);
      nowMs += 6000;
      const first = await complete(token, gameToken, { placement: 1, bidMet: 7, bidExceeded: 0, bidMissed: 0 });
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ recorded: true, coinsAwarded: 100, balance: 5100 });
      // Tokens patērēts, BET rinda eksistē → stabils success, monētas NETIEK piešķirtas atkārtoti.
      const second = await complete(token, gameToken, { placement: 1, bidMet: 7, bidExceeded: 0, bidMissed: 0 });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ recorded: false, coinsAwarded: 0, balance: 5100 });
    });

    it("rejects anonymous (401) and unknown token (409)", async () => {
      expect(
        (await post("/sp/complete", { gameToken: "x", placement: 1, bidMet: 1, bidExceeded: 0, bidMissed: 0 })).status
      ).toBe(401);
      const { token } = await registerUser("Olivia");
      expect((await complete(token, "nope", { placement: 1, bidMet: 1, bidExceeded: 0, bidMissed: 0 })).status).toBe(409);
    });

    it("rejects another user's consumed token (409, no cross-user leak)", async () => {
      const alice = await registerUser("Peggy");
      const bob = await registerUser("Quentin");
      const gameToken = await startGame(alice.token, "hard", 7);
      nowMs += 6000;
      // Alise pabeidz → rinda pieder Alisei, tokens patērēts.
      expect(
        (await complete(alice.token, gameToken, { placement: 1, bidMet: 7, bidExceeded: 0, bidMissed: 0 })).status
      ).toBe(200);
      // Bobs mēģina ar Alises tokenu → replay īpašnieks ir Alise (≠ Bobs) → 409, NE stabils success.
      expect(
        (await complete(bob.token, gameToken, { placement: 1, bidMet: 7, bidExceeded: 0, bidMissed: 0 })).status
      ).toBe(409);
    });
  });
});
