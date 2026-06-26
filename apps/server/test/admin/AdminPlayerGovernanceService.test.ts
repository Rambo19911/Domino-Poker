import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AdminAuditService } from "../../src/admin/AdminAuditService.js";
import { AdminPlayerGovernanceService } from "../../src/admin/AdminPlayerGovernanceService.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";

const SECRET_HASH = "scrypt$TOP-SECRET-HASH";

describe("AdminPlayerGovernanceService", () => {
  let storage: SqliteStorage;
  let wallet: WalletService;
  let audit: AdminAuditService;
  const now = 1_000_000;

  beforeEach(async () => {
    storage = new SqliteStorage({ filename: ":memory:" });
    wallet = new WalletService({ coins: storage, clock: () => now });
    audit = new AdminAuditService(storage, () => now);
    await storage.createUser({
      id: "u-1",
      username: "Alice",
      usernameNorm: "alice",
      email: "alice@x.co",
      emailNorm: "alice@x.co",
      passwordHash: SECRET_HASH,
      avatar: "default",
      createdAt: 1,
      updatedAt: 1
    });
  });

  afterEach(async () => {
    await storage.close();
  });

  it("export is an allowlist DTO with NO password hash or token secrets", async () => {
    const svc = new AdminPlayerGovernanceService(storage, wallet, audit, () => now);
    const data = await svc.exportPlayer("u-1");
    expect(data?.account.username).toBe("Alice");
    expect(data?.account.email).toBe("alice@x.co");
    const json = JSON.stringify(data);
    for (const secret of ["passwordHash", "password_hash", SECRET_HASH, "tokenHash", "token_hash"]) {
      expect(json).not.toContain(secret);
    }
    expect(svc.exportPlayer("ghost")).resolves.toBeUndefined();
  });

  it("deletePlayer: snapshots to audit, scrubs matches, hard-deletes — in order", async () => {
    await storage.applyLedger({ id: "l", userId: "u-1", delta: 5000, reason: "signup", ref: "u-1", now: 1 });
    await storage.saveMatchStarted({
      matchId: "m-1",
      seed: "s",
      numberOfRounds: 7,
      players: [{ seatIndex: 0, corePlayerId: "1", kind: "human", clientId: "c", displayId: "P-1", userId: "u-1" }],
      startedAt: 1
    });
    const svc = new AdminPlayerGovernanceService(storage, wallet, audit, () => now);
    expect(await svc.deletePlayer("u-1", { ip: "1.2.3.4" })).toBe("deleted");
    // Konts pazudis; partija anonimizēta.
    expect(await storage.getUserById("u-1")).toBeUndefined();
    const seat = (await storage.loadUnfinishedMatch("m-1"))!.match.players[0]!;
    expect(seat.userId).toBeUndefined();
    expect(seat.displayId).toBe("P-1");
    // Audit satur player.delete ar PILNU snapshot, BEZ noslēpumiem.
    const entries = await storage.listAdminAudit(10, 0);
    const del = entries.find((e) => e.action === "player.delete");
    expect(del).toBeDefined();
    const diffJson = JSON.stringify(del?.diff);
    expect(diffJson).toContain("Alice"); // snapshot klāt
    for (const secret of ["passwordHash", "password_hash", SECRET_HASH]) {
      expect(diffJson).not.toContain(secret);
    }
    // Atkārtots → not_found.
    expect(await svc.deletePlayer("u-1", {})).toBe("not_found");
  });

  it("aborts the delete (user survives) if the audit snapshot write fails", async () => {
    // Audit, kura record() met → snapshot/backup neizdodas → dzēšana NEturpinās.
    const failingAudit = {
      record: async (): Promise<void> => {
        throw new Error("audit write failed");
      }
    } as unknown as AdminAuditService;
    const svc = new AdminPlayerGovernanceService(storage, wallet, failingAudit, () => now);
    await expect(svc.deletePlayer("u-1", {})).rejects.toThrow();
    // Drošības sargs: konts JOPROJĀM eksistē (snapshot-pirms-destrukcijas).
    expect(await storage.getUserById("u-1")).toBeDefined();
  });
});
