import { describe, expect, it } from "vitest";

import { InMemoryRoomLeaseStore } from "../../src/storage/index.js";

describe("InMemoryRoomLeaseStore", () => {
  it("acquires an unowned room lease", async () => {
    const leases = new InMemoryRoomLeaseStore();

    await expect(
      leases.acquireRoomLease({ roomId: "room-1", ownerInstanceId: "instance-a", now: 1000, ttlMs: 5000 })
    ).resolves.toEqual({
      roomId: "room-1",
      ownerInstanceId: "instance-a",
      expiresAt: 6000,
      updatedAt: 1000
    });
  });

  it("blocks another owner until the lease expires", async () => {
    const leases = new InMemoryRoomLeaseStore();
    await leases.acquireRoomLease({
      roomId: "room-1",
      ownerInstanceId: "instance-a",
      now: 1000,
      ttlMs: 5000
    });

    expect(
      await leases.acquireRoomLease({
        roomId: "room-1",
        ownerInstanceId: "instance-b",
        now: 4000,
        ttlMs: 5000
      })
    ).toBeUndefined();
    expect(
      await leases.acquireRoomLease({
        roomId: "room-1",
        ownerInstanceId: "instance-b",
        now: 6000,
        ttlMs: 5000
      })
    ).toMatchObject({ ownerInstanceId: "instance-b", expiresAt: 11000 });
  });

  it("lets the same owner renew but rejects stale or foreign renewals", async () => {
    const leases = new InMemoryRoomLeaseStore();
    await leases.acquireRoomLease({
      roomId: "room-1",
      ownerInstanceId: "instance-a",
      now: 1000,
      ttlMs: 5000
    });

    expect(
      await leases.renewRoomLease({
        roomId: "room-1",
        ownerInstanceId: "instance-b",
        now: 2000,
        ttlMs: 5000
      })
    ).toBeUndefined();
    expect(
      await leases.renewRoomLease({
        roomId: "room-1",
        ownerInstanceId: "instance-a",
        now: 4000,
        ttlMs: 5000
      })
    ).toMatchObject({ ownerInstanceId: "instance-a", expiresAt: 9000 });
    expect(
      await leases.renewRoomLease({
        roomId: "room-1",
        ownerInstanceId: "instance-a",
        now: 9000,
        ttlMs: 5000
      })
    ).toBeUndefined();
  });

  it("releases only the owner's lease", async () => {
    const leases = new InMemoryRoomLeaseStore();
    await leases.acquireRoomLease({
      roomId: "room-1",
      ownerInstanceId: "instance-a",
      now: 1000,
      ttlMs: 5000
    });

    await expect(leases.releaseRoomLease("room-1", "instance-b")).resolves.toBe(false);
    expect(await leases.getRoomLease("room-1")).toMatchObject({ ownerInstanceId: "instance-a" });
    await expect(leases.releaseRoomLease("room-1", "instance-a")).resolves.toBe(true);
    expect(await leases.getRoomLease("room-1")).toBeUndefined();
  });

  it("rejects invalid ttl values", async () => {
    const leases = new InMemoryRoomLeaseStore();

    await expect(
      leases.acquireRoomLease({ roomId: "room-1", ownerInstanceId: "instance-a", now: 1000, ttlMs: 0 })
    ).rejects.toThrow("ttlMs");
  });
});
