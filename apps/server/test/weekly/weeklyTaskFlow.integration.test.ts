import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import { createAuthHandler } from "../../src/http/authRoutes.js";
import { createSpRewardHandler } from "../../src/http/spRewardRoutes.js";
import { createWeeklyTaskHandler } from "../../src/http/weeklyTaskRoutes.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { SpRewardTokens } from "../../src/sp/SpRewardTokens.js";
import { PlayerStatsService } from "../../src/stats/PlayerStatsService.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";
import { FEATURE_LAUNCH_EPOCH_MS, WeeklyTaskService } from "../../src/weekly/WeeklyTaskService.js";

/**
 * End-to-end nedēļas uzdevumu SIMULĀCIJA (sk. `docs/TODO/weekly-tasks-plan.md`). Dzen ĪSTOS
 * HTTP apstrādātājus (`/auth`, `/sp`, `/weekly`) + servisus + SQLite storage ar KONTROLĒJAMU
 * pulksteni — tāpēc min-ilguma "aizkaves" tiek simulētas momentāni (pulksteņa pārbīde), nevis
 * reāli gaidot. Lieto ĪSTO noklusējuma `FEATURE_LAUNCH_EPOCH_MS` (pulkstenis iestatīts palaišanas
 * nedēļā), tāpēc šis tests arī sargā pret "launch epoch nākotnē → tukšs logs" bugu.
 *
 * MP spēle iet caur WebSocket istabām (ne HTTP), tāpēc MP rindas te ievieto tieši caur
 * `recordGameResult` — tieši tā, kā to dara servera `MpStatsRecorder` pie `GAME_OVER`.
 */

const ORIGIN = "http://localhost:3000";
const DAY = 86_400_000;
// Trešdiena palaišanas nedēļā (pēc pirmdienas epoch, labi logā). Signup dod 5000 monētas.
const BASE_NOW = FEATURE_LAUNCH_EPOCH_MS + 2 * DAY + 12 * 3_600_000;

describe("Weekly tasks — end-to-end simulation (real handlers, controllable clock)", () => {
  let storage: SqliteStorage;
  let server: ReturnType<typeof createHealthHttpServer>;
  let base: string;
  let nowMs: number;
  let seedN = 0;

  beforeEach(async () => {
    nowMs = BASE_NOW;
    const clock = () => nowMs;
    storage = new SqliteStorage({ filename: ":memory:" });
    const auth = new AuthService({ store: storage, clock });
    const wallet = new WalletService({ coins: storage, clock });
    const stats = new PlayerStatsService({ store: storage });
    const tokens = new SpRewardTokens({ clock, ttlMs: 60 * 60 * 1000, maxPerUser: 8, createId: idFactory() });
    // ĪSTAIS noklusējuma epoch (NEinjicējam launchEpochMs) → sargā pret epoch-nākotnē bugu.
    const weekly = new WeeklyTaskService({ stats: storage, wallet, clock });
    server = createHealthHttpServer({
      authHandler: createAuthHandler({ auth, wallet, webOrigins: [ORIGIN], clock, dev: true, trustProxy: false }),
      spRewardHandler: createSpRewardHandler({ auth, wallet, tokens, stats, webOrigins: [ORIGIN], clock, dev: true }),
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

  function idFactory(): () => string {
    let n = 0;
    return () => `wf-${++n}`;
  }

  function req(method: string, path: string, token?: string, body?: unknown): Promise<Response> {
    return fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }

  async function register(username: string): Promise<{ token: string; id: string }> {
    const res = await req("POST", "/auth/register", undefined, {
      username,
      password: "secret123",
      email: `${username.toLowerCase()}@x.co`
    });
    const body = (await res.json()) as { token: string; user: { id: string } };
    return { token: body.token, id: body.user.id };
  }

  async function spStart(
    token: string,
    difficulty: string,
    rounds: number,
    variant?: "weekly_bosses"
  ): Promise<string> {
    const res = await req("POST", "/sp/start", token, {
      difficulty,
      rounds,
      ...(variant === undefined ? {} : { variant })
    });
    return ((await res.json()) as { gameToken: string }).gameToken;
  }

  /** Simulē SP spēli: paceļ pulksteni par `durationSec` (min-ilguma vārtiem), tad /sp/complete. */
  async function playSp(
    token: string,
    opts: { difficulty: string; rounds: number; variant?: "weekly_bosses"; placement: number; durationSec: number }
  ): Promise<void> {
    const gt = await spStart(token, opts.difficulty, opts.rounds, opts.variant);
    nowMs += opts.durationSec * 1000; // "adekvāta laika aizkave" (simulēta)
    const res = await req("POST", "/sp/complete", token, {
      gameToken: gt,
      placement: opts.placement,
      bidMet: opts.rounds, // solījumu summa = raundu skaits (serveris to prasa)
      bidExceeded: 0,
      bidMissed: 0
    });
    expect(res.status).toBe(200);
  }

  /** Simulē pabeigtu MP spēli, tieši kā `MpStatsRecorder` (mode='mp', completedAt=now). */
  async function playMp(userId: string, roundCount = 1, placement = 2): Promise<void> {
    await storage.recordGameResult({
      id: `mp:sim-${++seedN}:${userId}`,
      userId,
      mode: "mp",
      placement,
      roundCount,
      bidMet: roundCount,
      bidExceeded: 0,
      bidMissed: 0,
      completedAt: nowMs
    });
  }

  interface WeeklyState {
    readonly tasks: readonly { readonly id: string; readonly progress: number; readonly threshold: number; readonly claimable: boolean }[];
  }
  async function weeklyGet(token: string): Promise<WeeklyState> {
    return (await (await req("GET", "/weekly/tasks", token)).json()) as WeeklyState;
  }
  function task(state: WeeklyState, id: string) {
    return state.tasks.find((t) => t.id === id)!;
  }
  async function weeklyClaim(token: string, taskId: string): Promise<{ status: number; body: { awarded?: number; error?: string } }> {
    const res = await req("POST", "/weekly/tasks/claim", token, { taskId });
    return { status: res.status, body: (await res.json()) as { awarded?: number; error?: string } };
  }

  it("boss30 with a 2nd-place (top-2) finish counts and awards 150k (user's exact scenario)", async () => {
    const { token } = await register("Boss30User");
    // 30-raundu speciālā istaba, 2. vieta (placement<=2 skaitās), ilgums 60s ≥ 30s vārti.
    await playSp(token, { difficulty: "epic", rounds: 30, variant: "weekly_bosses", placement: 2, durationSec: 60 });

    const state = await weeklyGet(token);
    expect(task(state, "boss30")).toMatchObject({ progress: 1, threshold: 1, claimable: true });

    const claim = await weeklyClaim(token, "boss30");
    expect(claim.status).toBe(200);
    expect(claim.body.awarded).toBe(150000);
  });

  it("a single 1-round multiplayer game counts toward mp_finish_20", async () => {
    const { token, id } = await register("MpUser");
    // Viena 1-raunda MP spēle (lietotāja scenārijs).
    await playMp(id, 1, 2);
    let state = await weeklyGet(token);
    expect(task(state, "mp_finish_20")).toMatchObject({ progress: 1, threshold: 20, claimable: false });

    // Vēl 19 → slieksnis 20 → savācams → 40k.
    for (let i = 0; i < 19; i += 1) await playMp(id, 1, 3);
    state = await weeklyGet(token);
    expect(task(state, "mp_finish_20")).toMatchObject({ progress: 20, claimable: true });
    const claim = await weeklyClaim(token, "mp_finish_20");
    expect(claim.body.awarded).toBe(40000);
  });

  it("boss50 (400k) and sp_epic50_x2 (100k) complete end-to-end", async () => {
    const { token } = await register("BigUser");

    // boss50: 50-raundu speciālā istaba, 1. vieta, 60s ≥ 50s vārti.
    await playSp(token, { difficulty: "epic", rounds: 50, variant: "weekly_bosses", placement: 1, durationSec: 60 });
    expect(task(await weeklyGet(token), "boss50")).toMatchObject({ progress: 1, claimable: true });
    expect((await weeklyClaim(token, "boss50")).body.awarded).toBe(400000);

    // sp_epic50_x2: DIVAS standard epic-50 uzvaras (variant IS NULL).
    await playSp(token, { difficulty: "epic", rounds: 50, placement: 1, durationSec: 60 });
    expect(task(await weeklyGet(token), "sp_epic50_x2")).toMatchObject({ progress: 1, claimable: false });
    await playSp(token, { difficulty: "epic", rounds: 50, placement: 2, durationSec: 60 });
    expect(task(await weeklyGet(token), "sp_epic50_x2")).toMatchObject({ progress: 2, claimable: true });
    expect((await weeklyClaim(token, "sp_epic50_x2")).body.awarded).toBe(100000);
  });

  it("standard epic-50 wins do NOT satisfy the special-room boss tasks (variant separation)", async () => {
    const { token } = await register("SepUser");
    await playSp(token, { difficulty: "epic", rounds: 50, placement: 1, durationSec: 60 }); // standard
    const state = await weeklyGet(token);
    expect(task(state, "boss50").progress).toBe(0); // speciālā istaba NEskaita standard uzvaru
    expect((await weeklyClaim(token, "boss50")).status).toBe(409); // not_met
  });

  it("a too-fast boss game (below the round-scaled min duration) does NOT count", async () => {
    const { token } = await register("FastUser");
    // 30-raundu boss, bet tikai 10s ilgums < 30s vārti → neskaitās (anti-abuse).
    await playSp(token, { difficulty: "epic", rounds: 30, variant: "weekly_bosses", placement: 1, durationSec: 10 });
    expect(task(await weeklyGet(token), "boss30").progress).toBe(0);
    expect((await weeklyClaim(token, "boss30")).status).toBe(409);
  });

  it("a game played on the reported bug date (2026-07-05, Sun) counts — guards the launch-epoch regression", async () => {
    // FIKSĒTS datums = īstais lietotāja kļūdas datums (svētdiena, nedēļā [06-29, 07-06)). Ar ĪSTO
    // noklusējuma epoch (2026-06-29) logs to ietver → uzvara skaitās. Ja kāds epoch atkal pārbīdītu
    // uz nākamo pirmdienu (piem. 2026-07-06), logs būtu TUKŠS un šis tests krītētu (progress 0).
    // NB: fiksēts (NE no konstantes atvasināts), tāpēc regresija tiešām tiek noķerta (Codex).
    nowMs = Date.UTC(2026, 6, 5, 12, 0, 0);
    const { token } = await register("EpochUser");
    await playSp(token, { difficulty: "epic", rounds: 50, variant: "weekly_bosses", placement: 1, durationSec: 60 });
    expect(task(await weeklyGet(token), "boss50").progress).toBe(1);
  });
});
