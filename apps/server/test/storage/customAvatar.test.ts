import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "../../src/auth/AuthService.js";
import type { UserRecord } from "../../src/auth/AuthStore.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";

function user(id: string): UserRecord {
  return {
    id,
    username: id,
    usernameNorm: id.toLowerCase(),
    passwordHash: "scrypt$16384$8$1$AA==$AA==",
    avatar: "avatar-01",
    createdAt: 1000,
    updatedAt: 1000
  };
}

describe("custom avatar (SqliteStorage)", () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    await storage.createUser(user("u1"));
  });

  afterEach(async () => {
    await storage.close();
  });

  it("stores avatar bytes and atomically marks users.avatar = 'custom'", async () => {
    await storage.setUserAvatar({
      userId: "u1",
      contentType: "image/webp",
      bytes: new Uint8Array([1, 2, 3, 4]),
      updatedAt: 5000
    });
    const got = await storage.getUserAvatar("u1");
    expect(got).toMatchObject({ userId: "u1", contentType: "image/webp", updatedAt: 5000 });
    expect(Array.from(got!.bytes)).toEqual([1, 2, 3, 4]);
    const u = await storage.getUserById("u1");
    expect(u?.avatar).toBe("custom");
    expect(u?.updatedAt).toBe(5000);
  });

  it("upserts (replaces) an existing avatar", async () => {
    await storage.setUserAvatar({ userId: "u1", contentType: "image/webp", bytes: new Uint8Array([1]), updatedAt: 5000 });
    await storage.setUserAvatar({ userId: "u1", contentType: "image/jpeg", bytes: new Uint8Array([9, 9]), updatedAt: 6000 });
    const got = await storage.getUserAvatar("u1");
    expect(got).toMatchObject({ contentType: "image/jpeg", updatedAt: 6000 });
    expect(Array.from(got!.bytes)).toEqual([9, 9]);
  });

  it("deletes the avatar", async () => {
    await storage.setUserAvatar({ userId: "u1", contentType: "image/webp", bytes: new Uint8Array([1]), updatedAt: 5000 });
    await storage.deleteUserAvatar("u1");
    expect(await storage.getUserAvatar("u1")).toBeUndefined();
  });

  it("returns undefined when there is no custom avatar", async () => {
    expect(await storage.getUserAvatar("u1")).toBeUndefined();
  });

  it("updateUserProfile to a preset deletes the avatar blob atomically", async () => {
    await storage.setUserAvatar({ userId: "u1", contentType: "image/webp", bytes: new Uint8Array([1]), updatedAt: 5000 });
    const r = await storage.updateUserProfile("u1", {
      username: "u1",
      usernameNorm: "u1",
      avatar: "avatar-05",
      updatedAt: 6000
    });
    expect(r).toBe("updated");
    expect(await storage.getUserAvatar("u1")).toBeUndefined();
    expect((await storage.getUserById("u1"))?.avatar).toBe("avatar-05");
  });

  it("updateUserProfile keeping 'custom' retains the blob", async () => {
    await storage.setUserAvatar({ userId: "u1", contentType: "image/webp", bytes: new Uint8Array([1]), updatedAt: 5000 });
    await storage.updateUserProfile("u1", {
      username: "u1b",
      usernameNorm: "u1b",
      avatar: "custom",
      updatedAt: 6000
    });
    expect(await storage.getUserAvatar("u1")).toBeDefined();
  });
});

describe("custom avatar via AuthService", () => {
  let storage: SqliteStorage;
  let auth: AuthService;

  beforeEach(() => {
    storage = new SqliteStorage({ filename: ":memory:" });
    auth = new AuthService({ store: storage, clock: () => 7000 });
  });

  afterEach(async () => {
    await storage.close();
  });

  it("setAvatarUpload sets avatar='custom' and avatarVersion; resolveToken reflects it", async () => {
    const reg = await auth.register({ username: "Alice", password: "secret123", email: "a@b.co" });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    const version = await auth.setAvatarUpload(reg.user.id, "image/webp", new Uint8Array([1, 2, 3]));
    expect(version).toBe(7000);

    const self = await auth.resolveToken(reg.token);
    expect(self?.avatar).toBe("custom");
    expect(self?.avatarVersion).toBe(7000);

    const stored = await auth.getAvatarUpload(reg.user.id);
    expect(stored?.contentType).toBe("image/webp");
  });

  it("updateProfile to a preset avatar deletes the custom upload", async () => {
    const reg = await auth.register({ username: "Bob", password: "secret123", email: "b@b.co" });
    if (!reg.ok) return;
    await auth.setAvatarUpload(reg.user.id, "image/webp", new Uint8Array([1]));
    expect(await auth.getAvatarUpload(reg.user.id)).toBeDefined();

    const updated = await auth.updateProfile(reg.user.id, { username: "Bob", avatar: "avatar-05" });
    expect(updated.ok).toBe(true);
    expect(await auth.getAvatarUpload(reg.user.id)).toBeUndefined();
  });

  it("updateProfile keeping 'custom' avatar does NOT delete the upload", async () => {
    const reg = await auth.register({ username: "Cara", password: "secret123", email: "c@b.co" });
    if (!reg.ok) return;
    await auth.setAvatarUpload(reg.user.id, "image/webp", new Uint8Array([1]));

    const updated = await auth.updateProfile(reg.user.id, { username: "Cara2", avatar: "custom" });
    expect(updated.ok).toBe(true);
    expect(await auth.getAvatarUpload(reg.user.id)).toBeDefined();
  });

  it("updateProfile with avatar='custom' but no blob leaves the preset (no broken state)", async () => {
    const reg = await auth.register({ username: "Eve", password: "secret123", email: "e@b.co" });
    if (!reg.ok) return;
    // Nekad nav augšupielādēts blobs → 'custom' nedrīkst uzlikt; avatar paliek preset.
    const result = await auth.updateProfile(reg.user.id, { username: "Eve2", avatar: "custom" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.avatar).toBe("avatar-01");
      expect(result.user.username).toBe("Eve2");
    }
  });

  it("resolvePublic encodes a custom avatar with userId + version", async () => {
    const reg = await auth.register({ username: "Dan", password: "secret123", email: "d@b.co" });
    if (!reg.ok) return;
    await auth.setAvatarUpload(reg.user.id, "image/webp", new Uint8Array([1]));
    const pub = await auth.resolvePublic(reg.token);
    expect(pub?.avatar).toBe(`custom:${reg.user.id}:7000`);
  });
});
