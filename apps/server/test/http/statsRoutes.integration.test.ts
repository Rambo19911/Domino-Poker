import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import { createAuthHandler } from "../../src/http/authRoutes.js";
import { createStatsHandler } from "../../src/http/statsRoutes.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { PlayerStatsService } from "../../src/stats/PlayerStatsService.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";

const ORIGIN = "http://localhost:3000";

describe("Stats HTTP route (integration)", () => {
  let storage: SqliteStorage;
  let server: ReturnType<typeof createHealthHttpServer>;
  let base: string;
  const clock = () => 1000;

  beforeEach(async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    const auth = new AuthService({ store: storage, clock });
    const wallet = new WalletService({ coins: storage, clock });
    const stats = new PlayerStatsService({ store: storage });
    server = createHealthHttpServer({
      authHandler: createAuthHandler({ auth, wallet, webOrigins: [ORIGIN], clock, dev: true, trustProxy: false }),
      statsHandler: createStatsHandler({ auth, stats, webOrigins: [ORIGIN], clock, dev: true })
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

  async function register(username: string): Promise<{ token: string; id: string }> {
    const res = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: "secret123", email: `${username.toLowerCase()}@x.co` })
    });
    const body = (await res.json()) as { token: string; user: { id: string } };
    return { token: body.token, id: body.user.id };
  }

  function getStats(token?: string): Promise<Response> {
    return fetch(`${base}/stats`, {
      headers: token ? { authorization: `Bearer ${token}` } : {}
    });
  }

  it("rejects anonymous users (401)", async () => {
    expect((await getStats()).status).toBe(401);
  });

  it("returns zeroed stats for a user with no games", async () => {
    const { token } = await register("Alice");
    const res = await getStats(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      bidAccuracy: { met: 0, exceeded: 0, missed: 0 },
      spByDifficulty: {
        medium: { p1: 0, p2: 0, p3: 0, p4: 0 },
        hard: { p1: 0, p2: 0, p3: 0, p4: 0 },
        epic: { p1: 0, p2: 0, p3: 0, p4: 0 }
      },
      mpPlacement: { p1: 0, p2: 0, p3: 0, p4: 0 }
    });
  });

  it("composes bid accuracy (sp+mp) and placement distributions per difficulty + mp", async () => {
    const { token, id } = await register("Bob");
    await storage.recordGameResult({
      id: "sp:a", userId: id, mode: "sp", difficulty: "medium",
      placement: 1, roundCount: 7, bidMet: 5, bidExceeded: 1, bidMissed: 1, completedAt: 1
    });
    await storage.recordGameResult({
      id: "sp:b", userId: id, mode: "sp", difficulty: "medium",
      placement: 3, roundCount: 5, bidMet: 3, bidExceeded: 1, bidMissed: 1, completedAt: 2
    });
    await storage.recordGameResult({
      id: "sp:c", userId: id, mode: "sp", difficulty: "hard",
      placement: 1, roundCount: 4, bidMet: 2, bidExceeded: 1, bidMissed: 1, completedAt: 3
    });
    await storage.recordGameResult({
      id: `mp:m:${id}`, userId: id, mode: "mp",
      placement: 2, roundCount: 7, bidMet: 4, bidExceeded: 2, bidMissed: 1, completedAt: 4
    });

    const res = await getStats(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      bidAccuracy: { met: 14, exceeded: 5, missed: 4 }, // 5+3+2+4 / 1+1+1+2 / 1+1+1+1
      spByDifficulty: {
        medium: { p1: 1, p2: 0, p3: 1, p4: 0 }, // 1. + 3. vieta
        hard: { p1: 1, p2: 0, p3: 0, p4: 0 },
        epic: { p1: 0, p2: 0, p3: 0, p4: 0 }
      },
      mpPlacement: { p1: 0, p2: 1, p3: 0, p4: 0 }
    });
  });
});
