import { LobbyError } from "./lobbyErrors.js";
import type { RoomLeaseStore } from "../storage/RoomLeaseStore.js";

export type MaybePromise<T> = T | Promise<T>;

export interface RoomOwnershipGuard {
  ensureOwner(roomId: string, now: number): MaybePromise<void>;
  release(roomId: string): MaybePromise<void>;
}

export const noopRoomOwnershipGuard: RoomOwnershipGuard = {
  ensureOwner(): void {
    // Single-instance mode: local memory is the owner by construction.
  },
  release(): void {
    // No external lease to release.
  }
};

export interface LeaseBackedRoomOwnershipGuardOptions {
  readonly store: RoomLeaseStore;
  readonly ownerInstanceId: string;
  readonly ttlMs: number;
  readonly renewIntervalMs?: number;
  readonly clock?: () => number;
  readonly logger?: Pick<Console, "error" | "warn">;
}

export class LeaseBackedRoomOwnershipGuard implements RoomOwnershipGuard {
  private readonly store: RoomLeaseStore;
  private readonly ownerInstanceId: string;
  private readonly ttlMs: number;
  private readonly renewIntervalMs: number;
  private readonly clock: () => number;
  private readonly logger: Pick<Console, "error" | "warn">;
  private readonly ownedRoomLeases = new Map<string, number>();
  private renewTimer: ReturnType<typeof setInterval> | undefined;
  private renewInFlight = false;

  constructor(options: LeaseBackedRoomOwnershipGuardOptions) {
    if (options.ownerInstanceId.trim() === "") {
      throw new Error("Room ownership guard requires a non-empty ownerInstanceId.");
    }
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
      throw new Error("Room ownership guard ttlMs must be a positive finite number.");
    }
    this.store = options.store;
    this.ownerInstanceId = options.ownerInstanceId;
    this.ttlMs = Math.floor(options.ttlMs);
    this.renewIntervalMs = Math.max(1, Math.floor(options.renewIntervalMs ?? this.ttlMs / 3));
    this.clock = options.clock ?? (() => Date.now());
    this.logger = options.logger ?? console;
  }

  async ensureOwner(roomId: string, now: number): Promise<void> {
    const ownedUntil = this.ownedRoomLeases.get(roomId);
    if (ownedUntil !== undefined && ownedUntil > now + this.renewIntervalMs) {
      return;
    }

    const lease = await this.store.acquireRoomLease({
      roomId,
      ownerInstanceId: this.ownerInstanceId,
      now,
      ttlMs: this.ttlMs
    });
    if (lease === undefined) {
      throw new LobbyError("FORBIDDEN", `Room ${roomId} is owned by another server instance.`);
    }
    this.ownedRoomLeases.set(roomId, lease.expiresAt);
  }

  async release(roomId: string): Promise<void> {
    this.ownedRoomLeases.delete(roomId);
    await this.store.releaseRoomLease(roomId, this.ownerInstanceId);
  }

  startRenewing(): void {
    if (this.renewTimer !== undefined) {
      return;
    }
    this.renewTimer = setInterval(() => {
      void this.renewOwnedLeases();
    }, this.renewIntervalMs);
    this.renewTimer.unref?.();
  }

  stopRenewing(): void {
    if (this.renewTimer === undefined) {
      return;
    }
    clearInterval(this.renewTimer);
    this.renewTimer = undefined;
  }

  async renewOwnedLeases(now = this.clock()): Promise<void> {
    if (this.renewInFlight) {
      return;
    }
    this.renewInFlight = true;
    try {
      for (const roomId of [...this.ownedRoomLeases.keys()]) {
        try {
          const lease = await this.store.renewRoomLease({
            roomId,
            ownerInstanceId: this.ownerInstanceId,
            now,
            ttlMs: this.ttlMs
          });
          if (lease === undefined) {
            this.ownedRoomLeases.delete(roomId);
            this.logger.warn(
              `[room-ownership] lost lease for ${roomId}; future commands must reacquire ownership.`
            );
          } else {
            this.ownedRoomLeases.set(roomId, lease.expiresAt);
          }
        } catch (error) {
          this.logger.error(`[room-ownership] failed to renew lease for ${roomId}:`, error);
        }
      }
    } finally {
      this.renewInFlight = false;
    }
  }

  getOwnedRoomCount(): number {
    return this.ownedRoomLeases.size;
  }
}

export function isRoomLeaseStore(value: unknown): value is RoomLeaseStore {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<Record<keyof RoomLeaseStore, unknown>>;
  return (
    typeof candidate.acquireRoomLease === "function" &&
    typeof candidate.renewRoomLease === "function" &&
    typeof candidate.releaseRoomLease === "function" &&
    typeof candidate.getRoomLease === "function"
  );
}
