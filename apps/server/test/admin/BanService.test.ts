import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AdminAuditService } from "../../src/admin/AdminAuditService.js";
import { BanService } from "../../src/admin/BanService.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";

describe("BanService", () => {
  let storage: SqliteStorage;
  let bans: BanService;
  const now = 1_000_000;

  beforeEach(async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    bans = new BanService({
      store: storage,
      audit: new AdminAuditService(storage, () => now),
      clock: () => now
    });
    await storage.createUser({
      id: "u-1",
      username: "Alice",
      usernameNorm: "alice",
      email: undefined,
      emailNorm: undefined,
      passwordHash: "scrypt$x",
      avatar: "default",
      createdAt: 1,
      updatedAt: 1
    });
  });

  afterEach(async () => {
    await storage.close();
  });

  it("serializes concurrent banUser so only ONE active ban exists (no duplicates)", async () => {
    const [a, b] = await Promise.all([
      bans.banUser("u-1", { reason: "x", kind: "permanent" }, {}),
      bans.banUser("u-1", { reason: "y", kind: "permanent" }, {})
    ]);
    // Tieši viens "banned", otrs "already_banned" (serializēts; nav dublēta aktīva bana).
    expect([a, b].sort()).toEqual(["already_banned", "banned"]);
    const active = (await bans.list(50, 0)).filter((ban) => ban.revokedAt === undefined);
    expect(active).toHaveLength(1);
  });

  it("serializes concurrent banIp so only ONE active ip ban exists", async () => {
    const [a, b] = await Promise.all([
      bans.banIp("9.9.9.9", { reason: "x", kind: "permanent" }, {}),
      bans.banIp("9.9.9.9", { reason: "y", kind: "permanent" }, {})
    ]);
    expect([a, b].sort()).toEqual(["already_banned", "banned"]);
    expect(await bans.isIpBanned("9.9.9.9")).toBeDefined();
    const active = (await bans.list(50, 0)).filter((ban) => ban.revokedAt === undefined);
    expect(active).toHaveLength(1);
  });
});
