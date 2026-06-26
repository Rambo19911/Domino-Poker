import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { STARTING_COINS } from "@domino-poker/shared";

import { AdminAuditService } from "../../src/admin/AdminAuditService.js";
import { AdminAuthService } from "../../src/admin/AdminAuthService.js";
import { AdminPlayerService } from "../../src/admin/AdminPlayerService.js";
import { AdminPlayerWriteService } from "../../src/admin/AdminPlayerWriteService.js";
import { AdminAnalyticsService } from "../../src/admin/AdminAnalyticsService.js";
import { AdminPlayerGovernanceService } from "../../src/admin/AdminPlayerGovernanceService.js";
import { BanService } from "../../src/admin/BanService.js";
import { ChatModerationService } from "../../src/admin/ChatModerationService.js";
import { createAdminHandler } from "../../src/admin/adminRoutes.js";
import { AuthService } from "../../src/auth/AuthService.js";
import type { EmailLocale, EmailSender } from "../../src/auth/EmailSender.js";
import { hashPassword } from "../../src/auth/passwords.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";

const ORIGIN = "http://localhost:3001";
const PASSWORD = "correct-horse-battery";

/** Test sender: tver pēdējo admin OTP kodu + reset e-pastus; var simulēt piegādes kļūmes. */
class CapturingEmailSender implements EmailSender {
  lastCode: string | undefined;
  throwOnSend = false;
  resetCount = 0;
  throwOnReset = false;
  async sendPasswordReset(): Promise<void> {
    if (this.throwOnReset) {
      throw new Error("simulated reset email failure");
    }
    this.resetCount += 1;
  }
  async sendContactMessage(_t: string, _r: string, _m: string, _l: EmailLocale): Promise<void> {}
  async sendAdminLoginCode(_to: string, code: string): Promise<void> {
    if (this.throwOnSend) {
      throw new Error("simulated Resend failure");
    }
    this.lastCode = code;
  }
  async sendBanNotice(_to: string, _r: string, _d: string, _l: EmailLocale): Promise<void> {}
}

describe("admin HTTP routes (integration)", () => {
  let storage: SqliteStorage;
  let email: CapturingEmailSender;
  let server: ReturnType<typeof createHealthHttpServer>;
  let base: string;
  let nowMs: number;
  let bannedDisconnects: string[];
  let announcements: string[];
  let chatMod: ChatModerationService;

  beforeEach(async () => {
    nowMs = 1_000_000;
    bannedDisconnects = [];
    announcements = [];
    storage = new SqliteStorage({ filename: ":memory:" });
    email = new CapturingEmailSender();
    const adminAuth = new AdminAuthService({
      store: storage,
      passwordHash: await hashPassword(PASSWORD),
      email: "admin@example.com",
      emailSender: email,
      clock: () => nowMs
    });
    const audit = new AdminAuditService(storage, () => nowMs);
    const wallet = new WalletService({ coins: storage, clock: () => nowMs });
    const authService = new AuthService({
      store: storage,
      clock: () => nowMs,
      emailSender: email,
      appBaseUrl: "https://example.com"
    });
    server = createHealthHttpServer({
      adminHandler: createAdminHandler({
        adminAuth,
        audit,
        players: new AdminPlayerService(storage, wallet),
        playerWrites: new AdminPlayerWriteService(storage, wallet, authService, audit, () => nowMs),
        bans: new BanService({
          store: storage,
          audit,
          clock: () => nowMs,
          emailSender: email,
          onUserBanned: (userId) => bannedDisconnects.push(userId)
        }),
        chatModeration: (chatMod = new ChatModerationService(storage, audit, () => nowMs)),
        onAnnounce: (text: string) => {
          announcements.push(text);
          return text.trim() !== "";
        },
        analytics: new AdminAnalyticsService(storage, () => nowMs, {
          resolve: (ip) => (ip === undefined ? "Unknown" : "LV")
        }),
        governance: new AdminPlayerGovernanceService(storage, wallet, audit, () => nowMs),
        leaderboardConfig: { minGames: 5, size: 10 },
        webOrigins: [ORIGIN],
        clock: () => nowMs,
        dev: true,
        trustProxy: false
      })
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

  function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body)
    });
  }

  /** Autentificēts mutējošs pieprasījums (sesija + CSRF header). */
  function mutate(
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
    auth: { cookieHeader: string; csrf: string }
  ): Promise<Response> {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: auth.cookieHeader,
        "x-csrf-token": auth.csrf
      },
      body: JSON.stringify(body)
    });
  }

  /** Izpilda pilnu login→verify plūsmu un atgriež sesijas + CSRF sīkdatnes vērtības. */
  async function signIn(): Promise<{ cookieHeader: string; csrf: string }> {
    const login = await post("/admin/login", { password: PASSWORD });
    expect(login.status).toBe(200);
    const code = email.lastCode;
    expect(code).toMatch(/^\d{6}$/u);
    const verify = await post("/admin/verify", { code });
    expect(verify.status).toBe(200);
    const setCookies = verify.headers.getSetCookie();
    const session = cookieValue(setCookies, "admin_session");
    const csrf = cookieValue(setCookies, "admin_csrf");
    expect(session).toBeDefined();
    expect(csrf).toBeDefined();
    return { cookieHeader: `admin_session=${session}; admin_csrf=${csrf}`, csrf: csrf! };
  }

  it("returns a constant-form 200 for login regardless of password correctness", async () => {
    const good = await post("/admin/login", { password: PASSWORD });
    expect(good.status).toBe(200);
    expect(email.lastCode).toMatch(/^\d{6}$/u);

    email.lastCode = undefined;
    const bad = await post("/admin/login", { password: "wrong-password" });
    expect(bad.status).toBe(200); // konstantas formas atbilde (neatklāj pareizību)
    expect(email.lastCode).toBeUndefined(); // bet kods NETIEK sūtīts
  });

  it("never surfaces an email delivery failure (always 200, no oracle)", async () => {
    email.throwOnSend = true;
    const res = await post("/admin/login", { password: PASSWORD });
    // Piegādes kļūme NEDRĪKST kļūt par atbildes kodu (atklātu paroles pareizību) — vienmēr 200.
    expect(res.status).toBe(200);
  });

  it("rejects an invalid login body (400)", async () => {
    expect((await post("/admin/login", { password: "" })).status).toBe(400);
    expect((await post("/admin/login", {})).status).toBe(400);
  });

  it("issues HttpOnly session + readable CSRF cookies on a correct 2FA code", async () => {
    await post("/admin/login", { password: PASSWORD });
    const verify = await post("/admin/verify", { code: email.lastCode });
    expect(verify.status).toBe(200);
    const cookies = verify.headers.getSetCookie();
    const sessionCookie = cookies.find((c) => c.startsWith("admin_session="));
    const csrfCookie = cookies.find((c) => c.startsWith("admin_csrf="));
    expect(sessionCookie).toMatch(/HttpOnly/u);
    expect(sessionCookie).toMatch(/SameSite=Strict/u);
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie).not.toMatch(/HttpOnly/u); // CSRF must be readable (double-submit)
  });

  it("rejects a wrong 2FA code (401)", async () => {
    await post("/admin/login", { password: PASSWORD });
    const verify = await post("/admin/verify", { code: "000000" });
    // Kods nesakrīt (ļoti maz ticams, ka 000000 == ģenerētais) → invalid.
    expect([401]).toContain(verify.status);
  });

  it("guards /admin/session: 401 without a cookie, 200 with a valid session", async () => {
    expect((await fetch(`${base}/admin/session`)).status).toBe(401);
    const { cookieHeader } = await signIn();
    const ok = await fetch(`${base}/admin/session`, { headers: { cookie: cookieHeader } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ authenticated: true });
  });

  it("requires CSRF for logout: 403 without header, 200 with matching header", async () => {
    const { cookieHeader, csrf } = await signIn();
    // Bez CSRF headera → 403.
    const noCsrf = await post("/admin/logout", {}, { cookie: cookieHeader });
    expect(noCsrf.status).toBe(403);
    // Ar atbilstošu CSRF → 200, un sesija pēc tam vairs neder.
    const ok = await post("/admin/logout", {}, { cookie: cookieHeader, "x-csrf-token": csrf });
    expect(ok.status).toBe(200);
    const after = await fetch(`${base}/admin/session`, { headers: { cookie: cookieHeader } });
    expect(after.status).toBe(401);
  });

  it("records an audit entry for a successful sign-in", async () => {
    const { cookieHeader } = await signIn();
    const res = await fetch(`${base}/admin/audit`, { headers: { cookie: cookieHeader } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: Array<{ action: string }> };
    expect(body.entries.some((e) => e.action === "admin.login")).toBe(true);
  });

  it("blocks /admin/audit without a session (401)", async () => {
    expect((await fetch(`${base}/admin/audit`)).status).toBe(401);
  });

  it("lists/searches players (guarded) and 401 without a session", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice", email: "alice@example.com", lastLoginAt: 500 });
    await seedPlayer(storage, { id: "p-2", username: "Bob" });
    // Guard.
    expect((await fetch(`${base}/admin/players`)).status).toBe(401);
    const { cookieHeader } = await signIn();
    const all = await fetch(`${base}/admin/players`, { headers: { cookie: cookieHeader } });
    expect(all.status).toBe(200);
    const allBody = (await all.json()) as { players: Array<{ id: string }> };
    expect(allBody.players.map((p) => p.id)).toContain("p-1");
    // Search by name.
    const search = await fetch(`${base}/admin/players?q=alice`, { headers: { cookie: cookieHeader } });
    const searchBody = (await search.json()) as { players: Array<{ id: string }> };
    expect(searchBody.players.map((p) => p.id)).toEqual(["p-1"]);
  });

  it("returns a player overview and 404 for an unknown id", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice", email: "alice@example.com", lastLoginAt: 500 });
    const { cookieHeader } = await signIn();
    const res = await fetch(`${base}/admin/players/p-1`, { headers: { cookie: cookieHeader } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      account: { id: string; email?: string };
      balance: number;
      logins: { total: number };
    };
    expect(body.account.id).toBe("p-1");
    expect(body.account.email).toBe("alice@example.com");
    // P2: bilance nāk caur WalletService.getBalance (repair-on-read) → seed kontam bez maka
    // rindas tiek backfillots starta bonuss, tāpēc admin redz STARTING_COINS, nevis 0.
    expect(body.balance).toBe(STARTING_COINS);
    expect(body.logins.total).toBeGreaterThanOrEqual(1);

    const missing = await fetch(`${base}/admin/players/nope`, { headers: { cookie: cookieHeader } });
    expect(missing.status).toBe(404);
  });

  it("returns paginated player login history", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice" });
    await storage.appendLoginAttempt({
      id: "x1", userId: "p-1", usernameTried: "Alice", ip: "9.9.9.9", source: "password", success: false, createdAt: 700
    });
    const { cookieHeader } = await signIn();
    const res = await fetch(`${base}/admin/players/p-1/logins?limit=10`, { headers: { cookie: cookieHeader } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; failed: number; entries: Array<{ success: boolean }> };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.entries.length).toBeGreaterThanOrEqual(1);
  });

  it("records a security audit entry for a failed 2FA attempt", async () => {
    await post("/admin/login", { password: PASSWORD });
    const bad = await post("/admin/verify", { code: "000000" });
    // 000000 gandrīz noteikti != ģenerētais kods → 401 + audit signāls.
    if (bad.status === 401) {
      const { cookieHeader } = await signIn();
      const res = await fetch(`${base}/admin/audit`, { headers: { cookie: cookieHeader } });
      const body = (await res.json()) as { entries: Array<{ action: string }> };
      expect(body.entries.some((e) => e.action === "admin.verify_failed")).toBe(true);
    }
  });

  // --- Phase 2: player write operations ---

  const ADJUST_ID = "11111111-1111-4111-8111-111111111111";

  it("2.1 edits an account (display name + email) and writes an audit diff", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice", email: "alice@example.com" });
    const auth = await signIn();
    const res = await mutate(
      "/admin/players/p-1",
      "PATCH",
      { displayName: "Alicia", email: "alicia@example.com" },
      auth
    );
    expect(res.status).toBe(200);
    const user = await storage.getUserById("p-1");
    expect(user?.username).toBe("Alicia");
    expect(user?.email).toBe("alicia@example.com");
    const audit = await fetch(`${base}/admin/audit`, { headers: { cookie: auth.cookieHeader } });
    const body = (await audit.json()) as { entries: Array<{ action: string }> };
    expect(body.entries.some((e) => e.action === "player.account.update")).toBe(true);
  });

  it("2.1 requires CSRF for a mutating PATCH (403 without header)", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice" });
    const { cookieHeader } = await signIn();
    const res = await fetch(`${base}/admin/players/p-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ displayName: "Nope" })
    });
    expect(res.status).toBe(403);
  });

  it("2.1 rejects an invalid avatar (400) and an unknown player (404)", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice" });
    const auth = await signIn();
    expect((await mutate("/admin/players/p-1", "PATCH", { avatar: "not-real" }, auth)).status).toBe(400);
    expect((await mutate("/admin/players/ghost", "PATCH", { displayName: "Ghost" }, auth)).status).toBe(404);
  });

  it("2.2 corrects the stats aggregate with a mandatory reason → audit", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice" });
    const auth = await signIn();
    const res = await mutate(
      "/admin/players/p-1/stats",
      "PATCH",
      { wins: 7, losses: 3, reason: "manual correction" },
      auth
    );
    expect(res.status).toBe(200);
    expect(await storage.getUserStats("p-1")).toMatchObject({ wins: 7, losses: 3, gamesPlayed: 10 });
    // Iemesls obligāts.
    expect((await mutate("/admin/players/p-1/stats", "PATCH", { wins: 1, losses: 1, reason: "" }, auth)).status).toBe(400);
  });

  it("2.3 grants coins (audit) and is idempotent by adjustmentId", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice" });
    const auth = await signIn();
    const first = await mutate(
      "/admin/players/p-1/coins",
      "POST",
      { delta: 500, reason: "promo", adjustmentId: ADJUST_ID },
      auth
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { balance: number; applied: boolean };
    expect(firstBody.applied).toBe(true);
    expect(firstBody.balance).toBe(STARTING_COINS + 500);
    // Tas pats adjustmentId → idempotents no-op (applied:false, bilance nemainās).
    const repeat = await mutate(
      "/admin/players/p-1/coins",
      "POST",
      { delta: 500, reason: "promo", adjustmentId: ADJUST_ID },
      auth
    );
    const repeatBody = (await repeat.json()) as { balance: number; applied: boolean };
    expect(repeatBody.applied).toBe(false);
    expect(repeatBody.balance).toBe(STARTING_COINS + 500);
    const audit = await fetch(`${base}/admin/audit`, { headers: { cookie: auth.cookieHeader } });
    const body = (await audit.json()) as { entries: Array<{ action: string }> };
    // TIKAI viena coins audit rinda (idempotents atkārtojums NEauditē).
    expect(body.entries.filter((e) => e.action === "player.coins.adjust")).toHaveLength(1);
  });

  it("2.3 rejects an adjustment that would make the balance negative (409)", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice" });
    const auth = await signIn();
    const res = await mutate(
      "/admin/players/p-1/coins",
      "POST",
      { delta: -(STARTING_COINS + 1), reason: "overdraw", adjustmentId: ADJUST_ID },
      auth
    );
    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toEqual({ error: "insufficient_balance" });
  });

  it("2.1 soft reset sends an email and leaves the password intact", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice", email: "alice@example.com" });
    const auth = await signIn();
    email.resetCount = 0;
    const res = await mutate("/admin/players/p-1/send-reset-email", "POST", {}, auth);
    expect(res.status).toBe(200);
    expect(email.resetCount).toBe(1);
    // Parole NEMAINĪTA (mīkstais variants).
    expect((await storage.getUserById("p-1"))?.passwordHash).toBe("scrypt$test");
  });

  it("2.1 soft reset email failure returns 502 and leaves no lingering token (recoverable)", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice", email: "alice@example.com" });
    const auth = await signIn();
    email.throwOnReset = true;
    const failed = await mutate("/admin/players/p-1/send-reset-email", "POST", {}, auth);
    expect(failed.status).toBe(502);
    // Atkopjams: piegāde atjaunojas → mīkstais reset atkal strādā (nepiegādātais tokens iztīrīts).
    email.throwOnReset = false;
    email.resetCount = 0;
    const ok = await mutate("/admin/players/p-1/send-reset-email", "POST", {}, auth);
    expect(ok.status).toBe(200);
    expect(email.resetCount).toBe(1);
  });

  it("2.1 hard reset revokes sessions + changes the password after a successful email", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice", email: "alice@example.com" });
    await storage.createAuthToken({
      tokenHash: "tok-1".repeat(13).slice(0, 64),
      userId: "p-1",
      createdAt: 1,
      lastUsedAt: 1,
      expiresAt: 9_000_000_000
    });
    const auth = await signIn();
    const res = await mutate("/admin/players/p-1/reset-password", "POST", {}, auth);
    expect(res.status).toBe(200);
    // Parole anulēta (vairs ne `scrypt$test`) + sesija atsaukta.
    expect((await storage.getUserById("p-1"))?.passwordHash).not.toBe("scrypt$test");
    expect(await storage.getAuthToken("tok-1".repeat(13).slice(0, 64))).toBeUndefined();
  });

  it("2.1 hard reset does NOT lock out the user when the email fails (502, no mutation)", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice", email: "alice@example.com" });
    const tokenHash = "tok-2".repeat(13).slice(0, 64);
    await storage.createAuthToken({
      tokenHash,
      userId: "p-1",
      createdAt: 1,
      lastUsedAt: 1,
      expiresAt: 9_000_000_000
    });
    const auth = await signIn();
    email.throwOnReset = true;
    const res = await mutate("/admin/players/p-1/reset-password", "POST", {}, auth);
    expect(res.status).toBe(502);
    // Drošības sargs: parole + sesija NEAIZSKARTAS (lietotājs nav lockout).
    expect((await storage.getUserById("p-1"))?.passwordHash).toBe("scrypt$test");
    expect(await storage.getAuthToken(tokenHash)).toBeDefined();
  });

  // --- Phase 3.1: bans ---

  it("3.1 bans a player: revokes sessions, fires the disconnect hook, audits, and 409 on re-ban", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice", email: "alice@example.com" });
    const tokenHash = "ban-tok".repeat(10).slice(0, 64);
    await storage.createAuthToken({
      tokenHash,
      userId: "p-1",
      createdAt: 1,
      lastUsedAt: 1,
      expiresAt: 9_000_000_000
    });
    const auth = await signIn();
    const res = await mutate(
      "/admin/players/p-1/ban",
      "POST",
      { reason: "cheating", kind: "permanent" },
      auth
    );
    expect(res.status).toBe(200);
    // Izpilde: auth tokeni dzēsti (HTTP piespiedu izlogošana) + disconnect āķis izsaukts.
    expect(await storage.getAuthToken(tokenHash)).toBeUndefined();
    expect(bannedDisconnects).toContain("p-1");
    // Aktīvs bans glabātavā.
    expect(await storage.findActiveUserBan("p-1", nowMs)).toMatchObject({ userId: "p-1" });
    // Audit.
    const audit = await fetch(`${base}/admin/audit`, { headers: { cookie: auth.cookieHeader } });
    const body = (await audit.json()) as { entries: Array<{ action: string }> };
    expect(body.entries.some((e) => e.action === "player.ban")).toBe(true);
    // Atkārtots bans → 409 already_banned.
    const again = await mutate(
      "/admin/players/p-1/ban",
      "POST",
      { reason: "again", kind: "permanent" },
      auth
    );
    expect(again.status).toBe(409);
  });

  it("3.1 rejects a temporary ban without durationDays (400) and an unknown player (404)", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice" });
    const auth = await signIn();
    expect(
      (await mutate("/admin/players/p-1/ban", "POST", { reason: "x", kind: "temporary" }, auth)).status
    ).toBe(400);
    expect(
      (await mutate("/admin/players/ghost/ban", "POST", { reason: "x", kind: "permanent" }, auth)).status
    ).toBe(404);
  });

  it("3.1 requires CSRF for a ban (403 without header)", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice" });
    const { cookieHeader } = await signIn();
    const res = await fetch(`${base}/admin/players/p-1/ban`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ reason: "x", kind: "permanent" })
    });
    expect(res.status).toBe(403);
  });

  it("3.1 ip-bans, lists bans, and revokes by id (with audit)", async () => {
    const auth = await signIn();
    const banned = await mutate(
      "/admin/bans/ip",
      "POST",
      { ip: "9.9.9.9", reason: "abuse", kind: "temporary", durationDays: 7 },
      auth
    );
    expect(banned.status).toBe(200);
    expect(await storage.findActiveIpBan("9.9.9.9", nowMs)).toMatchObject({ ip: "9.9.9.9" });
    // List.
    const list = await fetch(`${base}/admin/bans`, { headers: { cookie: auth.cookieHeader } });
    const listBody = (await list.json()) as { bans: Array<{ id: string; ip?: string }> };
    const banId = listBody.bans.find((b) => b.ip === "9.9.9.9")?.id;
    expect(banId).toBeDefined();
    // Revoke.
    const revoke = await mutate(`/admin/bans/${banId}/revoke`, "POST", {}, auth);
    expect(revoke.status).toBe(200);
    expect(await storage.findActiveIpBan("9.9.9.9", nowMs)).toBeUndefined();
    // Atkārtots revoke → 409 not_active.
    expect((await mutate(`/admin/bans/${banId}/revoke`, "POST", {}, auth)).status).toBe(409);
    // Audit satur ip.ban + ban.revoke.
    const audit = await fetch(`${base}/admin/audit`, { headers: { cookie: auth.cookieHeader } });
    const body = (await audit.json()) as { entries: Array<{ action: string }> };
    expect(body.entries.some((e) => e.action === "ip.ban")).toBe(true);
    expect(body.entries.some((e) => e.action === "ban.revoke")).toBe(true);
  });

  it("3.1 rejects a malformed IP at the server boundary (400, not saved)", async () => {
    const auth = await signIn();
    const bad = await mutate(
      "/admin/bans/ip",
      "POST",
      { ip: "not-an-ip", reason: "x", kind: "permanent" },
      auth
    );
    expect(bad.status).toBe(400);
    // Derīgs IPv6 tiek pieņemts.
    const good = await mutate(
      "/admin/bans/ip",
      "POST",
      { ip: "2001:db8::1", reason: "x", kind: "permanent" },
      auth
    );
    expect(good.status).toBe(200);
  });

  it("3.1 guards ban routes without a session (401)", async () => {
    expect((await fetch(`${base}/admin/bans`)).status).toBe(401);
  });

  // --- Phase 3.2: chat moderation ---

  it("3.2 adds, lists, and removes blocked words (and the filter applies)", async () => {
    const auth = await signIn();
    const add = await mutate("/admin/chat/blocked-words", "POST", { word: "BadWord" }, auth);
    expect(add.status).toBe(200);
    // Saraksts (normalizēts lowercase).
    const list = await fetch(`${base}/admin/chat/blocked-words`, { headers: { cookie: auth.cookieHeader } });
    expect(((await list.json()) as { words: string[] }).words).toContain("badword");
    // Filtrs (tā pati servisa instance) tagad aizvieto vārdu.
    expect(chatMod.filter("you are a badword!")).toBe("you are a ****!");
    // Audit.
    const audit = await fetch(`${base}/admin/audit`, { headers: { cookie: auth.cookieHeader } });
    const body = (await audit.json()) as { entries: Array<{ action: string }> };
    expect(body.entries.some((e) => e.action === "chat.blocked_word.add")).toBe(true);
    // Remove (DELETE, CSRF).
    const del = await fetch(`${base}/admin/chat/blocked-words/badword`, {
      method: "DELETE",
      headers: { cookie: auth.cookieHeader, "x-csrf-token": auth.csrf }
    });
    expect(del.status).toBe(200);
    expect(chatMod.filter("you are a badword!")).toBe("you are a badword!");
  });

  it("3.2 posts an admin announcement (broadcast hook + audit) and rejects empty text", async () => {
    const auth = await signIn();
    const res = await mutate("/admin/chat/announce", "POST", { text: "Server restart in 5 min" }, auth);
    expect(res.status).toBe(200);
    expect(announcements).toContain("Server restart in 5 min");
    const audit = await fetch(`${base}/admin/audit`, { headers: { cookie: auth.cookieHeader } });
    const body = (await audit.json()) as { entries: Array<{ action: string }> };
    expect(body.entries.some((e) => e.action === "chat.announce")).toBe(true);
    // Tukšs teksts → 400.
    expect((await mutate("/admin/chat/announce", "POST", { text: "  " }, auth)).status).toBe(400);
  });

  it("3.2 requires CSRF for blocked-word add and announce", async () => {
    const { cookieHeader } = await signIn();
    expect(
      (
        await fetch(`${base}/admin/chat/blocked-words`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: cookieHeader },
          body: JSON.stringify({ word: "x" })
        })
      ).status
    ).toBe(403);
  });

  // --- Phase 4A: analytics ---

  it("4A returns overview / activity (json + csv) / segments / leaderboard; guards without a session", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice", email: "a@x.co", lastLoginAt: 500 });
    expect((await fetch(`${base}/admin/analytics/overview`)).status).toBe(401);
    const auth = await signIn();

    const overview = await fetch(`${base}/admin/analytics/overview`, { headers: { cookie: auth.cookieHeader } });
    expect(overview.status).toBe(200);
    expect(((await overview.json()) as { totalUsers: number }).totalUsers).toBeGreaterThanOrEqual(1);

    const activity = await fetch(`${base}/admin/analytics/activity?days=7`, { headers: { cookie: auth.cookieHeader } });
    expect(activity.status).toBe(200);
    // Tieši 7 UTC kalendārās dienas (ieskaitot šodienu), tukšās aizpildītas.
    expect(((await activity.json()) as { days: unknown[] }).days).toHaveLength(7);

    const csv = await fetch(`${base}/admin/analytics/activity.csv?days=7`, { headers: { cookie: auth.cookieHeader } });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/u);
    expect(await csv.text()).toContain("date,registrations,logins");

    const segments = await fetch(`${base}/admin/analytics/segments`, { headers: { cookie: auth.cookieHeader } });
    expect(segments.status).toBe(200);
    const segmentsBody = (await segments.json()) as Record<string, unknown>;
    expect(segmentsBody).toHaveProperty("newPlayers");
    // D4: valsts/platforma + nošķelšanas karogs.
    expect(segmentsBody).toHaveProperty("countries");
    expect(segmentsBody).toHaveProperty("platforms");
    expect(segmentsBody).toHaveProperty("geoTruncated");

    const lb = await fetch(`${base}/admin/analytics/leaderboard`, { headers: { cookie: auth.cookieHeader } });
    expect(lb.status).toBe(200);
    expect(((await lb.json()) as { config: { minGames: number } }).config.minGames).toBe(5);
  });

  // --- Phase 4B: export + delete ---

  it("4B.2 exports full player data (no-store + audit) and 404s for an unknown id", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice", email: "a@x.co" });
    const auth = await signIn();
    const res = await fetch(`${base}/admin/players/p-1/export`, { headers: { cookie: auth.cookieHeader } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    // Allowlist: nav paroles hash.
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect((body as { account: { id: string } }).account.id).toBe("p-1");
    // Audit player.export.
    const audit = await fetch(`${base}/admin/audit`, { headers: { cookie: auth.cookieHeader } });
    const entries = (await audit.json()) as { entries: Array<{ action: string }> };
    expect(entries.entries.some((e) => e.action === "player.export")).toBe(true);

    expect((await fetch(`${base}/admin/players/ghost/export`, { headers: { cookie: auth.cookieHeader } })).status).toBe(404);
  });

  it("4B.2 hard-deletes a player (CSRF) with a snapshot audit; 404 after deleted", async () => {
    await seedPlayer(storage, { id: "p-1", username: "Alice", email: "a@x.co" });
    const auth = await signIn();
    // CSRF obligāts.
    const noCsrf = await fetch(`${base}/admin/players/p-1`, {
      method: "DELETE",
      headers: { cookie: auth.cookieHeader }
    });
    expect(noCsrf.status).toBe(403);
    // Ar CSRF → 200, konts pazūd.
    const ok = await fetch(`${base}/admin/players/p-1`, {
      method: "DELETE",
      headers: { cookie: auth.cookieHeader, "x-csrf-token": auth.csrf }
    });
    expect(ok.status).toBe(200);
    expect(await storage.getUserById("p-1")).toBeUndefined();
    // Audit player.delete ar snapshot (BEZ noslēpumiem).
    const audit = await fetch(`${base}/admin/audit`, { headers: { cookie: auth.cookieHeader } });
    const entries = (await audit.json()) as { entries: Array<{ action: string }> };
    expect(entries.entries.some((e) => e.action === "player.delete")).toBe(true);
    // Atkārtota dzēšana → 404.
    const again = await fetch(`${base}/admin/players/p-1`, {
      method: "DELETE",
      headers: { cookie: auth.cookieHeader, "x-csrf-token": auth.csrf }
    });
    expect(again.status).toBe(404);
  });
});

/** Izveido testa spēlētāju (kontu + opcionāli vienu veiksmīgu login last-login kārtošanai). */
async function seedPlayer(
  storage: SqliteStorage,
  opts: { id: string; username: string; email?: string; lastLoginAt?: number }
): Promise<void> {
  await storage.createUser({
    id: opts.id,
    username: opts.username,
    usernameNorm: opts.username.toLowerCase(),
    email: opts.email,
    emailNorm: opts.email?.toLowerCase(),
    passwordHash: "scrypt$test",
    avatar: "default",
    createdAt: 1,
    updatedAt: 1
  });
  if (opts.lastLoginAt !== undefined) {
    await storage.appendLoginAttempt({
      id: `seed-login-${opts.id}`,
      userId: opts.id,
      usernameTried: opts.username,
      source: "password",
      success: true,
      createdAt: opts.lastLoginAt
    });
  }
}

/** Izvelk sīkdatnes vērtību no `Set-Cookie` masīva pēc nosaukuma. */
function cookieValue(setCookies: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  for (const cookie of setCookies) {
    if (cookie.startsWith(prefix)) {
      return cookie.slice(prefix.length).split(";")[0];
    }
  }
  return undefined;
}
