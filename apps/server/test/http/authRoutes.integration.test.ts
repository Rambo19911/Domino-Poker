import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import { createAuthHandler } from "../../src/http/authRoutes.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";

const ORIGIN = "http://localhost:3000";

describe("auth HTTP routes (integration)", () => {
  let storage: SqliteStorage;
  let server: ReturnType<typeof createHealthHttpServer>;
  let base: string;

  beforeEach(async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    const auth = new AuthService({ store: storage, clock: () => Date.now() });
    server = createHealthHttpServer({
      authHandler: createAuthHandler({ auth, webOrigins: [ORIGIN], clock: () => Date.now(), dev: true })
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

  it("keeps anonymous /health working (no regression)", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("registers, then resolves the session via /auth/me", async () => {
    const reg = await post("/auth/register", { username: "Alice", password: "secret123", email: "alice@x.co" });
    expect(reg.status).toBe(200);
    const { token, user } = (await reg.json()) as { token: string; user: { username: string } };
    expect(user.username).toBe("Alice");

    const me = await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { user: { username: string } };
    expect(meBody.user.username).toBe("Alice");
  });

  it("rejects /auth/me without a token", async () => {
    const me = await fetch(`${base}/auth/me`);
    expect(me.status).toBe(401);
  });

  it("returns 409 for duplicate username and 400 for invalid input", async () => {
    await post("/auth/register", { username: "Alice", password: "secret123", email: "alice@x.co" });
    const dup = await post("/auth/register", { username: "alice", password: "secret123", email: "alice2@x.co" });
    expect(dup.status).toBe(409);
    await expect(dup.json()).resolves.toEqual({ error: "username_taken" });

    const bad = await post("/auth/register", { username: "ab", password: "secret123", email: "ab@x.co" });
    expect(bad.status).toBe(400);
  });

  it("logs in and rejects wrong credentials", async () => {
    await post("/auth/register", { username: "Alice", password: "secret123", email: "alice@x.co" });
    const ok = await post("/auth/login", { username: "Alice", password: "secret123", email: "alice@x.co" });
    expect(ok.status).toBe(200);
    const wrong = await post("/auth/login", { username: "Alice", password: "nope" });
    expect(wrong.status).toBe(401);
  });

  it("logout invalidates the token", async () => {
    const reg = await post("/auth/register", { username: "Alice", password: "secret123", email: "alice@x.co" });
    const { token } = (await reg.json()) as { token: string };
    expect((await post("/auth/logout", {}, token)).status).toBe(200);
    const me = await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    expect(me.status).toBe(401);
  });

  it("updates the profile via PATCH /auth/me", async () => {
    const reg = await post("/auth/register", { username: "Alice", password: "secret123", email: "alice@x.co" });
    const { token } = (await reg.json()) as { token: string };
    const res = await fetch(`${base}/auth/me`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: "Alicia", avatar: "avatar-07" })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { username: string; avatar: string } };
    expect(body.user).toMatchObject({ username: "Alicia", avatar: "avatar-07" });
  });

  it("returns MP stats via /auth/me (null until a game is recorded)", async () => {
    const reg = await post("/auth/register", { username: "Alice", password: "secret123", email: "alice@x.co" });
    const { token, user } = (await reg.json()) as { token: string; user: { id: string } };

    const before = await (await fetch(`${base}/auth/me`, {
      headers: { authorization: `Bearer ${token}` }
    })).json();
    expect((before as { stats: unknown }).stats).toBeNull();

    // Reģistrē iznākumu tieši glabātuvē, tad /auth/me to atspoguļo.
    await storage.recordUserMatchOutcome("match-x", user.id, "win", 5000);
    const after = await (await fetch(`${base}/auth/me`, {
      headers: { authorization: `Bearer ${token}` }
    })).json();
    expect((after as { stats: unknown }).stats).toMatchObject({ wins: 1, losses: 0, gamesPlayed: 1 });
  });

  it("uploads a WebP avatar, marks avatar='custom', and serves it back", async () => {
    const reg = await post("/auth/register", { username: "Alice", password: "secret123", email: "alice@x.co" });
    const { token, user } = (await reg.json()) as { token: string; user: { id: string } };
    // Minimāls derīgs WebP (RIFF....WEBP magic-bytes).
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([20, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(20, 1)]);
    const up = await fetch(`${base}/auth/avatar`, {
      method: "POST",
      headers: { "content-type": "image/webp", authorization: `Bearer ${token}` },
      body: webp
    });
    expect(up.status).toBe(200);
    expect(((await up.json()) as { user: { avatar: string } }).user.avatar).toBe("custom");

    const got = await fetch(`${base}/auth/avatar/${user.id}`);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/webp");
    expect(got.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await got.arrayBuffer()).length).toBe(webp.length);
  });

  it("rejects an avatar upload without a token (401)", async () => {
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([20, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(20, 1)]);
    const res = await fetch(`${base}/auth/avatar`, {
      method: "POST",
      headers: { "content-type": "image/webp" },
      body: webp
    });
    expect(res.status).toBe(401);
  });

  it("rejects a non-image avatar body (400 invalid_image)", async () => {
    const reg = await post("/auth/register", { username: "Bob", password: "secret123", email: "bob@x.co" });
    const { token } = (await reg.json()) as { token: string };
    const res = await fetch(`${base}/auth/avatar`, {
      method: "POST",
      headers: { "content-type": "image/webp", authorization: `Bearer ${token}` },
      body: Buffer.from("definitely-not-an-image")
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid_image" });
  });

  it("returns 404 for an unknown avatar and a malformed userId encoding", async () => {
    expect((await fetch(`${base}/auth/avatar/no-such-user`)).status).toBe(404);
    // Bojāta procentu-kodēšana: decode met -> handleAvatarFetch atgriež 404, ne 500.
    expect((await fetch(`${base}/auth/avatar/%E0%A4`)).status).toBe(404);
  });

  it("answers CORS preflight for an allowed origin", async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: "OPTIONS",
      headers: { origin: ORIGIN, "access-control-request-method": "POST" }
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("allows a 127.0.0.1 origin in dev even when not in the allowlist", async () => {
    // .bat palaiž web uz 127.0.0.1:3000; dev režīmā tas jāatļauj bez WEB_ORIGIN.
    const devOrigin = "http://127.0.0.1:3000";
    const res = await fetch(`${base}/auth/login`, {
      method: "OPTIONS",
      headers: { origin: devOrigin, "access-control-request-method": "POST" }
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(devOrigin);
  });
});
