import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import { DailyTaskService } from "../../src/daily/DailyTaskService.js";
import { createAuthHandler } from "../../src/http/authRoutes.js";
import { createDailyTaskHandler } from "../../src/http/dailyTaskRoutes.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import type { GameDifficulty } from "../../src/storage/PlayerStatsStore.js";
import { WalletService } from "../../src/wallet/WalletService.js";

const ORIGIN = "http://localhost:3000";
// Fiksēts UTC laiks → deterministisks dienas logs (2026-07-10 12:00 UTC).
const NOW = Date.UTC(2026, 6, 10, 12, 0, 0);

interface TasksState {
  readonly serverDay: string;
  readonly anyClaimable: boolean;
  readonly tasks: readonly {
    readonly id: string;
    readonly progress: number;
    readonly claimed: boolean;
    readonly unlocked: boolean;
    readonly claimable: boolean;
  }[];
}

describe("Daily task HTTP routes (integration)", () => {
  let storage: SqliteStorage;
  let server: ReturnType<typeof createHealthHttpServer>;
  let base: string;
  let seedN = 0;

  beforeEach(async () => {
    const clock = () => NOW;
    storage = new SqliteStorage({ filename: ":memory:" });
    const auth = new AuthService({ store: storage, clock });
    const wallet = new WalletService({ coins: storage, clock });
    // launchEpochMs=0 → logs = šodienas UTC diena (bez launch clamp testā).
    const daily = new DailyTaskService({ stats: storage, wallet, clock, launchEpochMs: 0 });
    server = createHealthHttpServer({
      authHandler: createAuthHandler({ auth, wallet, webOrigins: [ORIGIN], clock, dev: true, trustProxy: false }),
      dailyHandler: createDailyTaskHandler({ auth, daily, webOrigins: [ORIGIN], clock, dev: true })
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

  function req(method: string, path: string, token?: string, body?: unknown): Promise<Response> {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }

  async function registerUser(username: string): Promise<{ token: string; id: string }> {
    const res = await req("POST", "/auth/register", undefined, {
      username,
      password: "secret123",
      email: `${username.toLowerCase()}@x.co`
    });
    const body = (await res.json()) as { token: string; user: { id: string } };
    return { token: body.token, id: body.user.id };
  }

  /** Sēj `count` SP uzvaras (placement 1) dotajā grūtībā šodienas logā ar pietiekamu ilgumu. */
  async function seedWins(userId: string, difficulty: GameDifficulty, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await storage.recordGameResult({
        id: `sp:seed-${++seedN}`,
        userId,
        mode: "sp",
        difficulty,
        placement: 1,
        roundCount: 4,
        bidMet: 4,
        bidExceeded: 0,
        bidMissed: 0,
        completedAt: NOW,
        durationMs: 20_000
      });
    }
  }

  it("rejects anonymous GET and POST (401)", async () => {
    expect((await req("GET", "/daily/tasks")).status).toBe(401);
    expect((await req("POST", "/daily/tasks/claim", undefined, { taskId: "win10_medium" })).status).toBe(401);
  });

  it("returns derived state; task 1 claimable once medium wins reach the threshold", async () => {
    const { token, id } = await registerUser("Alice");
    await seedWins(id, "medium", 10);
    const res = await req("GET", "/daily/tasks", token);
    expect(res.status).toBe(200);
    const state = (await res.json()) as TasksState;
    expect(state.serverDay).toBe("20260710");
    expect(state.tasks[0]).toMatchObject({ id: "win10_medium", progress: 10, claimable: true });
    expect(state.tasks[1]).toMatchObject({ id: "win20_hard", unlocked: false, claimable: false });
    expect(state.anyClaimable).toBe(true);
  });

  it("claims sequentially and awards coins; duplicate claim is a stable no-award success", async () => {
    const { token, id } = await registerUser("Bob");
    await seedWins(id, "medium", 10);

    const first = await req("POST", "/daily/tasks/claim", token, { taskId: "win10_medium" });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ awarded: 2000, balance: 7000, alreadyClaimed: false });

    const dup = await req("POST", "/daily/tasks/claim", token, { taskId: "win10_medium" });
    expect(dup.status).toBe(200);
    expect(await dup.json()).toMatchObject({ awarded: 0, balance: 7000, alreadyClaimed: true });
  });

  it("rejects claiming a locked task (409) and an unmet task (409)", async () => {
    const { token, id } = await registerUser("Carol");
    await seedWins(id, "hard", 20); // hard met, BET medium nav savākts → hard bloķēts
    const locked = await req("POST", "/daily/tasks/claim", token, { taskId: "win20_hard" });
    expect(locked.status).toBe(409);
    expect(await locked.json()).toEqual({ error: "locked" });

    // medium nav sasniegts → not_met
    const notMet = await req("POST", "/daily/tasks/claim", token, { taskId: "win10_medium" });
    expect(notMet.status).toBe(409);
    expect(await notMet.json()).toEqual({ error: "not_met" });
  });

  it("unlocks and claims the next task after the previous is claimed", async () => {
    const { token, id } = await registerUser("Dave");
    await seedWins(id, "medium", 10);
    await seedWins(id, "hard", 20);
    expect((await req("POST", "/daily/tasks/claim", token, { taskId: "win10_medium" })).status).toBe(200);
    const hard = await req("POST", "/daily/tasks/claim", token, { taskId: "win20_hard" });
    expect(hard.status).toBe(200);
    expect(await hard.json()).toMatchObject({ awarded: 4000 });
  });

  it("rejects an unknown task id at the boundary (400)", async () => {
    const { token } = await registerUser("Eve");
    const res = await req("POST", "/daily/tasks/claim", token, { taskId: "nope" });
    expect(res.status).toBe(400);
  });
});
