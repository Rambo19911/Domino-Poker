import type { AddressInfo } from "node:net";

import type { RandomSource } from "@domino-poker/core/slots";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import { createAuthHandler } from "../../src/http/authRoutes.js";
import { createSlotHandler } from "../../src/http/slotRoutes.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { SlotService } from "../../src/slots/SlotService.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";

const ORIGIN = "http://localhost:3000";
const NOW = Date.UTC(2026, 6, 25, 12, 0, 0);
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

/** Token 0 vienmēr → katra kolonna ir Full Wild → deterministisks maksimālais laimests. */
function allWildSource(): RandomSource {
  return { nextUint32: () => 0 };
}

interface SpinBody {
  readonly applied: boolean;
  readonly balance: number;
  readonly spin: {
    readonly spinId: string;
    readonly lineBet: number;
    readonly totalBet: number;
    readonly payout: number;
    readonly grid: readonly { readonly symbol: string }[][];
    readonly lines: readonly { readonly winCoins: number }[];
    readonly mathVersion: string;
  };
}

describe("Slot HTTP routes (integration)", () => {
  let storage: SqliteStorage;
  let server: ReturnType<typeof createHealthHttpServer>;
  let base: string;

  beforeEach(async () => {
    const clock = () => NOW;
    storage = new SqliteStorage({ filename: ":memory:" });
    const auth = new AuthService({ store: storage, clock });
    const wallet = new WalletService({ coins: storage, slots: storage, clock });
    const slots = new SlotService({ wallet, random: allWildSource() });
    server = createHealthHttpServer({
      authHandler: createAuthHandler({
        auth,
        wallet,
        webOrigins: [ORIGIN],
        clock,
        dev: true,
        trustProxy: false
      }),
      slotsHandler: createSlotHandler({ auth, slots, webOrigins: [ORIGIN], clock, dev: true })
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

  it("rejects an anonymous spin", async () => {
    const res = await req("POST", "/slots/spin", undefined, { spinId: UUID_A, lineBet: 20 });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("spins and returns the server-generated grid plus the new balance", async () => {
    const { token } = await registerUser("Spinner");
    const res = await req("POST", "/slots/spin", token, { spinId: UUID_A, lineBet: 20 });
    expect(res.status).toBe(200);

    const body = (await res.json()) as SpinBody;
    expect(body.applied).toBe(true);
    expect(body.spin.spinId).toBe(UUID_A);
    expect(body.spin.totalBet).toBe(220);
    expect(body.spin.grid).toHaveLength(3);
    expect(body.spin.lines).toHaveLength(11);
    expect(body.spin.mathVersion).toBe("domino-slots-math-v3");
    // 5000 starta bonuss - 220 likme + 11 x 2252 (ALL_WILD 5 pie likmes 20).
    expect(body.balance).toBe(5000 - 220 + 11 * 2252);
  });

  it("replays an identical response for a repeated spinId without moving coins", async () => {
    const { token } = await registerUser("Retry");
    const first = (await (await req("POST", "/slots/spin", token, {
      spinId: UUID_A,
      lineBet: 20
    })).json()) as SpinBody;

    const second = (await (await req("POST", "/slots/spin", token, {
      spinId: UUID_A,
      lineBet: 200 // pat cita likme neko nemaina — ieraksts jau eksistē
    })).json()) as SpinBody;

    expect(second.applied).toBe(false);
    expect(second.balance).toBe(first.balance);
    expect(second.spin).toEqual(first.spin);
    expect(second.spin.lineBet).toBe(20); // ierakstītā likme, ne jaunā
  });

  it("charges once when Auto Spin double-fires the same spinId concurrently", async () => {
    const { token } = await registerUser("DoubleFire");
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        req("POST", "/slots/spin", token, { spinId: UUID_A, lineBet: 20 })
      )
    );
    expect(responses.every((r) => r.status === 200)).toBe(true);
    const bodies = (await Promise.all(responses.map((r) => r.json()))) as SpinBody[];

    expect(bodies.filter((b) => b.applied)).toHaveLength(1);
    // Visi saņem identisku griezienu un identisku bilanci.
    const grids = new Set(bodies.map((b) => JSON.stringify(b.spin)));
    expect(grids.size).toBe(1);
    expect(new Set(bodies.map((b) => b.balance)).size).toBe(1);
    expect(bodies[0]?.balance).toBe(5000 - 220 + 11 * 2252);
  });

  it("scopes spins per account: the same spinId from another user is a new spin", async () => {
    const a = await registerUser("PlayerA");
    const b = await registerUser("PlayerB");
    const first = (await (await req("POST", "/slots/spin", a.token, {
      spinId: UUID_A,
      lineBet: 20
    })).json()) as SpinBody;
    const second = (await (await req("POST", "/slots/spin", b.token, {
      spinId: UUID_A,
      lineBet: 20
    })).json()) as SpinBody;

    expect(second.applied).toBe(true); // NE atkārtojums — cits konts
    expect(second.balance).toBe(first.balance); // katram sava svaigā bilance
  });

  it("returns 402 with the unchanged balance when the coins run out", async () => {
    const { token, id } = await registerUser("Broke");
    const wallet = new WalletService({ coins: storage, slots: storage, clock: () => NOW });
    await wallet.purchaseItem(id, "drain", 4900); // atstāj 100 < 220

    const res = await req("POST", "/slots/spin", token, { spinId: UUID_A, lineBet: 20 });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "insufficient_coins", balance: 100 });
  });

  describe("input validation (the trust boundary)", () => {
    it("rejects a line bet outside the configured steps", async () => {
      const { token } = await registerUser("BadBet");
      // 10 ir tieši tā likme, kas radītu daļskaitļa monētas ar Major boost.
      for (const lineBet of [10, 30, 50, 0, -20, 21, 1000, 20.5]) {
        const res = await req("POST", "/slots/spin", token, { spinId: UUID_A, lineBet });
        expect(res.status, `line bet ${lineBet}`).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid_input" });
      }
    });

    it("rejects a malformed spin id", async () => {
      const { token } = await registerUser("BadId");
      for (const spinId of ["", "not-a-uuid", "../../etc", 42]) {
        const res = await req("POST", "/slots/spin", token, { spinId, lineBet: 20 });
        expect(res.status, `spin id ${String(spinId)}`).toBe(400);
      }
    });

    it("rejects client-supplied grid, payout and userId, leaving the victim untouched", async () => {
      const victim = await registerUser("Victim");
      const { token } = await registerUser("Cheater");
      const res = await req("POST", "/slots/spin", token, {
        spinId: UUID_A,
        lineBet: 20,
        // Uzbrucēja mēģinājums pārņemt iznākumu un sveša konta naudu.
        payout: 999_999_999,
        totalBet: 1,
        userId: victim.id,
        grid: [["JACKPOT"]],
        balance: 1_000_000
      });
      // Strict shēma: nezināmi lauki ir skaļa kļūda, ne klusa ignorēšana.
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_input" });

      // Ne uzbrucējs, ne upuris nav zaudējis vai ieguvis nevienu monētu.
      const wallet = new WalletService({ coins: storage, slots: storage, clock: () => NOW });
      expect(await wallet.getBalance(victim.id)).toBe(5000);
      const clean = (await (await req("POST", "/slots/spin", token, {
        spinId: UUID_A,
        lineBet: 20
      })).json()) as SpinBody;
      expect(clean.balance).toBe(5000 - 220 + 11 * 2252);
      expect(await wallet.getBalance(victim.id)).toBe(5000);
    });

    it("rejects a non-object body, malformed JSON and an unknown path", async () => {
      const { token } = await registerUser("Weird");
      expect((await req("POST", "/slots/spin", token, "nope")).status).toBe(400);
      expect((await req("GET", "/slots/spin", token)).status).toBe(404);
      expect((await req("POST", "/slots/nope", token, {})).status).toBe(404);
      // Neparsējams neapstrādāts korpuss (nevar iet caur JSON.stringify).
      const raw = await fetch(`${base}/slots/spin`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: "{not json"
      });
      expect(raw.status).toBe(400);
      expect(await raw.json()).toEqual({ error: "invalid_input" });
    });
  });

  it("answers CORS preflight with the allowlisted origin", async () => {
    const res = await fetch(`${base}/slots/spin`, {
      method: "OPTIONS",
      headers: { origin: ORIGIN }
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("returns a generic 500 without internal detail when the service throws", async () => {
    const clock = () => NOW;
    const auth = new AuthService({ store: storage, clock });
    const broken = {
      spin: () => Promise.reject(new Error("db exploded: connection string secret"))
    } as unknown as SlotService;
    const brokenServer = createHealthHttpServer({
      authHandler: createAuthHandler({
        auth,
        wallet: new WalletService({ coins: storage, slots: storage, clock }),
        webOrigins: [ORIGIN],
        clock,
        dev: true,
        trustProxy: false
      }),
      slotsHandler: createSlotHandler({
        auth,
        slots: broken,
        webOrigins: [ORIGIN],
        clock,
        dev: true
      })
    });
    await new Promise<void>((resolve) => brokenServer.listen(0, resolve));
    const brokenBase = `http://127.0.0.1:${(brokenServer.address() as AddressInfo).port}`;
    try {
      const reg = await fetch(`${brokenBase}/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "Boom", password: "secret123", email: "boom@x.co" })
      });
      const { token } = (await reg.json()) as { token: string };
      const res = await fetch(`${brokenBase}/slots/spin`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ spinId: UUID_A, lineBet: 20 })
      });
      expect(res.status).toBe(500);
      // Iekšējā kļūda nedrīkst noplūst atbildē.
      expect(await res.json()).toEqual({ error: "internal_error" });
    } finally {
      await new Promise<void>((resolve, reject) =>
        brokenServer.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  it("404s the slots path when the server has no slots handler", async () => {
    const clock = () => NOW;
    const bare = createHealthHttpServer({});
    await new Promise<void>((resolve) => bare.listen(0, resolve));
    void clock;
    try {
      const res = await fetch(
        `http://127.0.0.1:${(bare.address() as AddressInfo).port}/slots/spin`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }
      );
      expect(res.status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) =>
        bare.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });

  it("rate limits a user at 600 requests per hour", async () => {
    const { token } = await registerUser("Grinder");
    // Ierobežotājs tiek pārbaudīts PIRMS korpusa parsēšanas, tāpēc nederīgi pieprasījumi
    // arī patērē kvotu. Tas ļauj sasniegt griestus, neiztukšojot bilanci.
    const bad = { spinId: "not-a-uuid", lineBet: 20 };
    for (let i = 0; i < 600; i++) {
      const res = await req("POST", "/slots/spin", token, bad);
      expect(res.status, `request ${i}`).toBe(400);
    }
    const limited = await req("POST", "/slots/spin", token, bad);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });

    // Ierobežojums ir uz lietotāju, ne globāls: cits konts joprojām var griezt.
    const other = await registerUser("Fresh");
    const ok = await req("POST", "/slots/spin", other.token, { spinId: UUID_B, lineBet: 20 });
    expect(ok.status).toBe(200);
  });
});
