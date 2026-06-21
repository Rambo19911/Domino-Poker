import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import type { EmailLocale, EmailSender } from "../../src/auth/EmailSender.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";

/** Test dubultnieks: glabā nosūtītos e-pastus, lai pārbaudītu saturu un izvilktu tokenu. */
class FakeEmailSender implements EmailSender {
  readonly sent: { to: string; resetUrl: string; locale: EmailLocale }[] = [];
  readonly contacts: { to: string; replyTo: string; message: string; locale: EmailLocale }[] = [];
  async sendPasswordReset(to: string, resetUrl: string, locale: EmailLocale): Promise<void> {
    this.sent.push({ to, resetUrl, locale });
  }
  async sendContactMessage(
    to: string,
    replyTo: string,
    message: string,
    locale: EmailLocale
  ): Promise<void> {
    this.contacts.push({ to, replyTo, message, locale });
  }
}

/** Izvelk raw tokenu no reset linka (`.../#reset=<token>`). */
function tokenFromUrl(url: string): string {
  const marker = "#reset=";
  return url.slice(url.indexOf(marker) + marker.length);
}

describe("password reset (AuthService + SqliteStorage)", () => {
  let storage: SqliteStorage;
  let email: FakeEmailSender;
  let now: number;
  let auth: AuthService;

  beforeEach(async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    email = new FakeEmailSender();
    now = 1_000_000;
    auth = new AuthService({
      store: storage,
      clock: () => now,
      emailSender: email,
      appBaseUrl: "https://example.test"
    });
    await auth.register({ username: "Alice", password: "originalpw1", email: "alice@example.com" });
  });

  afterEach(async () => {
    await storage.close();
  });

  it("isPasswordResetEnabled reflects whether a sender is configured", () => {
    expect(auth.isPasswordResetEnabled()).toBe(true);
    const noEmail = new AuthService({ store: storage, clock: () => now });
    expect(noEmail.isPasswordResetEnabled()).toBe(false);
  });

  it("does not send for an unknown email (anti-enumeration)", async () => {
    await auth.requestPasswordReset("nobody@example.com", "en");
    expect(email.sent).toHaveLength(0);
  });

  it("sends a reset link for a known email and lets the user set a new password", async () => {
    await auth.requestPasswordReset("alice@example.com", "lv");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.to).toBe("alice@example.com");
    expect(email.sent[0]!.locale).toBe("lv");
    expect(email.sent[0]!.resetUrl.startsWith("https://example.test/#reset=")).toBe(true);

    const token = tokenFromUrl(email.sent[0]!.resetUrl);
    expect(await auth.resetPassword(token, "brandnew99")).toBe(true);
    expect((await auth.login({ username: "Alice", password: "originalpw1" })).ok).toBe(false);
    expect((await auth.login({ username: "Alice", password: "brandnew99" })).ok).toBe(true);
  });

  it("rejects a token that was already used (single-use)", async () => {
    await auth.requestPasswordReset("alice@example.com", "en");
    const token = tokenFromUrl(email.sent[0]!.resetUrl);
    expect(await auth.resetPassword(token, "brandnew99")).toBe(true);
    expect(await auth.resetPassword(token, "another199")).toBe(false);
  });

  it("rejects an expired token", async () => {
    await auth.requestPasswordReset("alice@example.com", "en");
    const token = tokenFromUrl(email.sent[0]!.resetUrl);
    now += 60 * 60 * 1000 + 1; // 1h + 1ms
    expect(await auth.resetPassword(token, "brandnew99")).toBe(false);
  });

  it("rejects a bogus token", async () => {
    expect(await auth.resetPassword("not-a-real-token", "brandnew99")).toBe(false);
  });

  it("revokes existing auth sessions after a successful reset", async () => {
    const login = await auth.login({ username: "Alice", password: "originalpw1" });
    const oldToken = login.ok ? login.token : "";
    await auth.requestPasswordReset("alice@example.com", "en");
    const resetToken = tokenFromUrl(email.sent[0]!.resetUrl);
    await auth.resetPassword(resetToken, "brandnew99");
    expect(await auth.resolveToken(oldToken)).toBeUndefined();
  });

  it("invalidates a previous unused reset token when a new one is requested", async () => {
    await auth.requestPasswordReset("alice@example.com", "en");
    const first = tokenFromUrl(email.sent[0]!.resetUrl);
    await auth.requestPasswordReset("alice@example.com", "en");
    const second = tokenFromUrl(email.sent[1]!.resetUrl);
    expect(await auth.resetPassword(first, "brandnew99")).toBe(false);
    expect(await auth.resetPassword(second, "brandnew99")).toBe(true);
  });
});
