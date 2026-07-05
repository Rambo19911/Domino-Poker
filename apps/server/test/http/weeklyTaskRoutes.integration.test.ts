import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import { createAuthHandler } from "../../src/http/authRoutes.js";
import { createWeeklyTaskHandler } from "../../src/http/weeklyTaskRoutes.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";
import { WeeklyTaskService } from "../../src/weekly/WeeklyTaskService.js";

const ORIGIN = "http://localhost:3000";
// Fiksēts UTC laiks → deterministisks nedēļas logs. 2026-07-08 (trešd.) → pirmdiena 2026-07-06.
const NOW = Date.UTC(2026, 6, 8, 12, 0, 0);

interface TasksState {
  readonly serverWeek: string;
  readonly anyClaimable: boolean;
  readonly tasks: readonly {
    readonly id: string;
    readonly progress: number;
    readonly threshold: number;
    readonly claimed: boolean;
    readonly claimable: boolean;
    readonly hasPlayButton: boolean;
  }[];
}

describe("Weekly task HTTP routes (integration)", () => {
  let storage: SqliteStorage;
  let server: ReturnType<typeof createHealthHttpServer>;
  let base: string;
  let seedN = 0;

  beforeEach(async () => {
    const clock = () => NOW;
    storage = new SqliteStorage({ filename: ":memory:" });
    const auth = new AuthService({ store: storage, clock });
    const wallet = new WalletService({ coins: storage, clock });
    // launchEpochMs=0 → logs = šīs nedēļas UTC pirmdiena (bez launch clamp testā).
    const weekly = new WeeklyTaskService({ stats: storage, wallet, clock, launchEpochMs: 0 });
    server = createHealthHttpServer({
      authHandler: createAuthHandler({ auth, wallet, webOrigins: [ORIGIN], clock, dev: true, trustProxy: false }),
      weeklyHandler: createWeeklyTaskHandler({ auth, weekly, webOrigins: [ORIGIN], clock, dev: true })
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

  /** Sēj pabeigtu MP spēli (jebkura vieta) šīs nedēļas logā. */
  async function seedMp(userId: string, placement = 2): Promise<void> {
    await storage.recordGameResult({
      id: `mp:seed-${++seedN}:${userId}`,
      userId,
      mode: "mp",
      placement,
      roundCount: 5,
      bidMet: 5,
      bidExceeded: 0,
      bidMissed: 0,
      completedAt: NOW
    });
  }

  /** Sēj SP uzvaru (placement 1) ar tiešu raundu skaitu + variantu + ilgumu. */
  async function seedSpWin(
    userId: string,
    rounds: number,
    variant?: "weekly_bosses",
    durationMs = 60_000
  ): Promise<void> {
    await storage.recordGameResult({
      id: `sp:seed-${++seedN}`,
      userId,
      mode: "sp",
      difficulty: "epic",
      placement: 1,
      roundCount: rounds,
      bidMet: rounds,
      bidExceeded: 0,
      bidMissed: 0,
      completedAt: NOW,
      durationMs,
      ...(variant === undefined ? {} : { variant })
    });
  }

  it("rejects anonymous GET and POST (401)", async () => {
    expect((await req("GET", "/weekly/tasks")).status).toBe(401);
    expect((await req("POST", "/weekly/tasks/claim", undefined, { taskId: "mp_finish_20" })).status).toBe(401);
  });

  it("returns derived count-based state; special-room win makes boss50 claimable", async () => {
    const { token, id } = await registerUser("Alice");
    for (let i = 0; i < 12; i += 1) await seedMp(id); // 12/20
    await seedSpWin(id, 50, "weekly_bosses"); // boss50 izpildīts

    const state = (await (await req("GET", "/weekly/tasks", token)).json()) as TasksState;
    expect(state.serverWeek).toBe("20260706");
    const byId = Object.fromEntries(state.tasks.map((t) => [t.id, t]));
    expect(byId.mp_finish_20).toMatchObject({ progress: 12, threshold: 20, claimable: false });
    expect(byId.boss50).toMatchObject({ progress: 1, threshold: 1, claimable: true, hasPlayButton: true });
    // Standard uzd. 2 (variant IS NULL) speciālo NEskaita.
    expect(byId.sp_epic50_x2).toMatchObject({ progress: 0, claimable: false });
    expect(state.anyClaimable).toBe(true);
  });

  it("claims independently (any order) and awards coins; duplicate is a stable no-award success", async () => {
    const { token, id } = await registerUser("Bob");
    await seedSpWin(id, 30, "weekly_bosses"); // boss30

    // boss30 savācams BEZ jebkuru citu uzdevumu savākšanas (neatkarīgi, nav locked).
    const first = await req("POST", "/weekly/tasks/claim", token, { taskId: "boss30" });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ awarded: 150000, balance: 155000, alreadyClaimed: false });

    const dup = await req("POST", "/weekly/tasks/claim", token, { taskId: "boss30" });
    expect(dup.status).toBe(200);
    expect(await dup.json()).toMatchObject({ awarded: 0, balance: 155000, alreadyClaimed: true });
  });

  it("needs two standard epic-50 wins for sp_epic50_x2", async () => {
    const { token, id } = await registerUser("Cara");
    await seedSpWin(id, 50); // viena standard epic-50
    expect((await req("POST", "/weekly/tasks/claim", token, { taskId: "sp_epic50_x2" })).status).toBe(409);
    await seedSpWin(id, 50); // otra
    const ok = await req("POST", "/weekly/tasks/claim", token, { taskId: "sp_epic50_x2" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ awarded: 100000 });
  });

  it("rejects claiming an unmet task (409)", async () => {
    const { token, id } = await registerUser("Dave");
    for (let i = 0; i < 5; i += 1) await seedMp(id); // 5 < 20
    const notMet = await req("POST", "/weekly/tasks/claim", token, { taskId: "mp_finish_20" });
    expect(notMet.status).toBe(409);
    expect(await notMet.json()).toEqual({ error: "not_met" });
  });

  it("rejects an unknown task id at the boundary (400)", async () => {
    const { token } = await registerUser("Eve");
    expect((await req("POST", "/weekly/tasks/claim", token, { taskId: "nope" })).status).toBe(400);
  });
});
