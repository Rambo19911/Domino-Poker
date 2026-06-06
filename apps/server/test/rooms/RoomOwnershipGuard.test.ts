import { describe, expect, it } from "vitest";

import { LeaseBackedRoomOwnershipGuard } from "../../src/rooms/RoomOwnershipGuard.js";
import {
  InMemoryRoomLeaseStore,
  type RoomLeaseRecord,
  type RoomLeaseRequest
} from "../../src/storage/RoomLeaseStore.js";

function buildLogger() {
  const warnings: string[] = [];
  const errors: unknown[] = [];
  return {
    logger: {
      warn(message: string): void {
        warnings.push(message);
      },
      error(...message: unknown[]): void {
        errors.push(message);
      }
    },
    warnings,
    errors
  };
}

class CountingRoomLeaseStore extends InMemoryRoomLeaseStore {
  acquireCount = 0;

  async acquireRoomLease(request: RoomLeaseRequest): Promise<RoomLeaseRecord | undefined> {
    this.acquireCount += 1;
    return super.acquireRoomLease(request);
  }
}

describe("LeaseBackedRoomOwnershipGuard", () => {
  it("renews owned room leases", async () => {
    const store = new InMemoryRoomLeaseStore();
    const { logger, errors, warnings } = buildLogger();
    const guard = new LeaseBackedRoomOwnershipGuard({
      store,
      ownerInstanceId: "instance-a",
      ttlMs: 300,
      logger
    });

    await guard.ensureOwner("room-1", 1000);
    await guard.renewOwnedLeases(1100);

    await expect(store.getRoomLease("room-1")).resolves.toMatchObject({
      roomId: "room-1",
      ownerInstanceId: "instance-a",
      expiresAt: 1400,
      updatedAt: 1100
    });
    expect(guard.getOwnedRoomCount()).toBe(1);
    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("reuses a live owned lease until it reaches the renewal window", async () => {
    const store = new CountingRoomLeaseStore();
    const { logger } = buildLogger();
    const guard = new LeaseBackedRoomOwnershipGuard({
      store,
      ownerInstanceId: "instance-a",
      ttlMs: 300,
      renewIntervalMs: 100,
      logger
    });

    await guard.ensureOwner("room-1", 1000);
    await guard.ensureOwner("room-1", 1050);
    await guard.ensureOwner("room-1", 1199);
    expect(store.acquireCount).toBe(1);

    await guard.ensureOwner("room-1", 1200);
    expect(store.acquireCount).toBe(2);
  });

  it("stops renewing a room after another owner takes the lease", async () => {
    const store = new InMemoryRoomLeaseStore();
    const { logger, warnings } = buildLogger();
    const guard = new LeaseBackedRoomOwnershipGuard({
      store,
      ownerInstanceId: "instance-a",
      ttlMs: 100,
      logger
    });

    await guard.ensureOwner("room-1", 1000);
    await store.acquireRoomLease({
      roomId: "room-1",
      ownerInstanceId: "instance-b",
      now: 1201,
      ttlMs: 500
    });
    await guard.renewOwnedLeases(1300);

    expect(guard.getOwnedRoomCount()).toBe(0);
    expect(warnings).toEqual([
      "[room-ownership] lost lease for room-1; future commands must reacquire ownership."
    ]);
    await expect(store.getRoomLease("room-1")).resolves.toMatchObject({
      ownerInstanceId: "instance-b"
    });
  });
});
