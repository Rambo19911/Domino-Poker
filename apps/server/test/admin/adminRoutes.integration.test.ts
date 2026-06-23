import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AdminAuditService } from "../../src/admin/AdminAuditService.js";
import { AdminAuthService } from "../../src/admin/AdminAuthService.js";
import { createAdminHandler } from "../../src/admin/adminRoutes.js";
import type { EmailLocale, EmailSender } from "../../src/auth/EmailSender.js";
import { hashPassword } from "../../src/auth/passwords.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";

const ORIGIN = "http://localhost:3001";
const PASSWORD = "correct-horse-battery";

/** Test sender: tver pēdējo nosūtīto admin OTP kodu; var simulēt piegādes kļūmi. */
class CapturingEmailSender implements EmailSender {
  lastCode: string | undefined;
  throwOnSend = false;
  async sendPasswordReset(): Promise<void> {}
  async sendContactMessage(_t: string, _r: string, _m: string, _l: EmailLocale): Promise<void> {}
  async sendAdminLoginCode(_to: string, code: string): Promise<void> {
    if (this.throwOnSend) {
      throw new Error("simulated Resend failure");
    }
    this.lastCode = code;
  }
}

describe("admin HTTP routes (integration)", () => {
  let storage: SqliteStorage;
  let email: CapturingEmailSender;
  let server: ReturnType<typeof createHealthHttpServer>;
  let base: string;
  let nowMs: number;

  beforeEach(async () => {
    nowMs = 1_000_000;
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
    server = createHealthHttpServer({
      adminHandler: createAdminHandler({
        adminAuth,
        audit,
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
});

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
