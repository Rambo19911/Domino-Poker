import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AuthTokenRecord, UserRecord } from "../../src/auth/AuthStore.js";
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

function token(tokenHash: string, expiresAt: number): AuthTokenRecord {
  return { tokenHash, userId: "u1", createdAt: 1000, lastUsedAt: 1000, expiresAt };
}

describe("deleteExpiredAuthTokens (SqliteStorage)", () => {
  let storage: SqliteStorage;

  beforeEach(async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    await storage.createUser(user("u1"));
  });

  afterEach(async () => {
    await storage.close();
  });

  it("deletes expired tokens and keeps valid ones", async () => {
    await storage.createAuthToken(token("expired", 1000));
    await storage.createAuthToken(token("valid", 10000));

    await storage.deleteExpiredAuthTokens(5000);

    expect(await storage.getAuthToken("expired")).toBeUndefined();
    expect(await storage.getAuthToken("valid")).toMatchObject({ tokenHash: "valid", expiresAt: 10000 });
  });

  it("deletes a token whose expiry equals now (boundary: expires_at <= now)", async () => {
    await storage.createAuthToken(token("atBoundary", 5000));

    await storage.deleteExpiredAuthTokens(5000);

    expect(await storage.getAuthToken("atBoundary")).toBeUndefined();
  });

  it("is a no-op when there are no expired tokens", async () => {
    await storage.createAuthToken(token("a", 10000));
    await storage.createAuthToken(token("b", 20000));

    await storage.deleteExpiredAuthTokens(5000);

    expect(await storage.getAuthToken("a")).toBeDefined();
    expect(await storage.getAuthToken("b")).toBeDefined();
  });
});
