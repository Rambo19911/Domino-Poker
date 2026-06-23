import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EmailLocale, EmailSender } from "../../src/auth/EmailSender.js";
import { createContactHandler } from "../../src/http/contactRoutes.js";
import { createHealthHttpServer } from "../../src/httpServer.js";

const ORIGIN = "http://localhost:3000";

/** Test dubultnieks: glabā nosūtītās kontaktziņas (paroles reset metode šeit nav vajadzīga). */
class FakeEmailSender implements EmailSender {
  readonly contacts: { to: string; replyTo: string; message: string; locale: EmailLocale }[] = [];
  async sendPasswordReset(): Promise<void> {
    // nav vajadzīgs šajos testos
  }
  async sendContactMessage(
    to: string,
    replyTo: string,
    message: string,
    locale: EmailLocale
  ): Promise<void> {
    this.contacts.push({ to, replyTo, message, locale });
  }
  async sendAdminLoginCode(): Promise<void> {
    // nav vajadzīgs šajos testos
  }
}

describe("contact HTTP route (integration)", () => {
  let email: FakeEmailSender;
  let server: ReturnType<typeof createHealthHttpServer>;
  let base: string;
  let nowMs: number;

  beforeEach(async () => {
    nowMs = 100_000;
    email = new FakeEmailSender();
    server = createHealthHttpServer({
      contactHandler: createContactHandler({
        email,
        to: "owner@example.com",
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
  });

  function postContact(body: unknown): Promise<Response> {
    return fetch(`${base}/contact`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  it("sends a valid message to the owner with reply-to set to the author", async () => {
    const res = await postContact({
      email: "player@example.com",
      message: "Found a bug in the lobby.",
      locale: "lv"
    });
    expect(res.status).toBe(200);
    expect(email.contacts).toEqual([
      {
        to: "owner@example.com",
        replyTo: "player@example.com",
        message: "Found a bug in the lobby.",
        locale: "lv"
      }
    ]);
  });

  it("defaults locale to lv when omitted", async () => {
    await postContact({ email: "a@b.co", message: "Message without locale field." });
    expect(email.contacts[0]?.locale).toBe("lv");
  });

  it("rejects an invalid email (400) and sends nothing", async () => {
    const res = await postContact({ email: "not-an-email", message: "A long enough message." });
    expect(res.status).toBe(400);
    expect(email.contacts).toHaveLength(0);
  });

  it("rejects a too-short message (400)", async () => {
    const res = await postContact({ email: "a@b.co", message: "short" });
    expect(res.status).toBe(400);
    expect(email.contacts).toHaveLength(0);
  });

  it("rejects non-POST methods (405)", async () => {
    const res = await fetch(`${base}/contact`, { method: "GET" });
    expect(res.status).toBe(405);
  });

  it("rate-limits after 5 messages from the same IP (429)", async () => {
    const send = () => postContact({ email: "a@b.co", message: "A perfectly valid message." });
    for (let i = 0; i < 5; i++) {
      expect((await send()).status).toBe(200);
    }
    expect((await send()).status).toBe(429);
    expect(email.contacts).toHaveLength(5);
  });
});
