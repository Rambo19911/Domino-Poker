import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";

const TTL = 1000;

describe("AuthService (with SqliteStorage)", () => {
  let storage: SqliteStorage;
  let now: number;
  let auth: AuthService;

  beforeEach(() => {
    storage = new SqliteStorage({ filename: ":memory:" });
    now = 1000;
    auth = new AuthService({ store: storage, clock: () => now, tokenTtlMs: TTL });
  });

  afterEach(async () => {
    await storage.close();
  });

  it("registers a user and returns a token + self user with default avatar", async () => {
    const result = await auth.register({ username: "Alice", password: "secret123", email: "a@b.co" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.username).toBe("Alice");
    expect(result.user.avatar).toBe("avatar-01");
    expect(result.user.email).toBe("a@b.co");
    expect(result.token).toHaveLength(43); // 32 baiti base64url
    const resolved = await auth.resolveToken(result.token);
    expect(resolved?.id).toBe(result.user.id);
  });

  it("rejects a duplicate username case-insensitively", async () => {
    await auth.register({ username: "Alice", password: "secret123", email: "alice@x.co" });
    const result = await auth.register({ username: "alice", password: "other123", email: "alice2@x.co" });
    expect(result).toEqual({ ok: false, error: "username_taken" });
  });

  it("rejects a duplicate email", async () => {
    await auth.register({ username: "Alice", password: "secret123", email: "dup@x.co" });
    const result = await auth.register({ username: "Bob", password: "secret123", email: "DUP@x.co" });
    expect(result).toEqual({ ok: false, error: "email_taken" });
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await auth.register({ username: "Alice", password: "secret123", email: "alice@x.co" });

    const ok = await auth.login({ username: "alice", password: "secret123" });
    expect(ok.ok).toBe(true);

    const wrongPassword = await auth.login({ username: "Alice", password: "nope" });
    expect(wrongPassword).toEqual({ ok: false, error: "invalid_credentials" });

    const unknownUser = await auth.login({ username: "ghost", password: "secret123" });
    expect(unknownUser).toEqual({ ok: false, error: "invalid_credentials" });
  });

  it("rejects an invalid or expired token and slides expiry on use", async () => {
    const reg = await auth.register({ username: "Alice", password: "secret123", email: "alice@x.co" });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    expect(await auth.resolveToken("garbage")).toBeUndefined();

    // Pusperiods pārsniegts (expiresAt - now < TTL/2) → sliding pagarinājums.
    now = 1600;
    expect((await auth.resolveToken(reg.token))?.id).toBe(reg.user.id);
    // Pēc oriģinālā expiry (2000), bet pirms pagarinātā (2600) → joprojām derīgs.
    now = 2100;
    expect((await auth.resolveToken(reg.token))?.id).toBe(reg.user.id);
  });

  it("invalidates a token on logout", async () => {
    const reg = await auth.register({ username: "Alice", password: "secret123", email: "alice@x.co" });
    if (!reg.ok) return;
    await auth.logout(reg.token);
    expect(await auth.resolveToken(reg.token)).toBeUndefined();
  });

  it("expires a token after its TTL", async () => {
    const reg = await auth.register({ username: "Alice", password: "secret123", email: "alice@x.co" });
    if (!reg.ok) return;
    now = 1000 + TTL; // expiresAt <= now
    expect(await auth.resolveToken(reg.token)).toBeUndefined();
  });

  it("updates username and avatar, validating avatar and uniqueness", async () => {
    const reg = await auth.register({ username: "Alice", password: "secret123", email: "alice@x.co" });
    if (!reg.ok) return;

    const ok = await auth.updateProfile(reg.user.id, { username: "Alicia", avatar: "avatar-05" });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.user.username).toBe("Alicia");
      expect(ok.user.avatar).toBe("avatar-05");
    }

    const badAvatar = await auth.updateProfile(reg.user.id, { username: "Alicia", avatar: "nope" });
    expect(badAvatar).toEqual({ ok: false, error: "invalid_avatar" });

    await auth.register({ username: "Bob", password: "secret123", email: "bob@x.co" });
    const bob = await auth.login({ username: "Bob", password: "secret123" });
    if (!bob.ok) return;
    const clash = await auth.updateProfile(bob.user.id, { username: "Alicia", avatar: "avatar-02" });
    expect(clash).toEqual({ ok: false, error: "username_taken" });
  });
});
