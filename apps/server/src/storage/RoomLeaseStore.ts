export interface RoomLeaseRecord {
  readonly roomId: string;
  readonly ownerInstanceId: string;
  readonly expiresAt: number;
  readonly updatedAt: number;
}

export interface RoomLeaseRequest {
  readonly roomId: string;
  readonly ownerInstanceId: string;
  readonly now: number;
  readonly ttlMs: number;
}

export interface RoomLeaseStore {
  /**
   * Acquire a room lease when it is absent, expired, or already owned by the same
   * instance. Returns undefined when another live owner still holds the room.
   */
  acquireRoomLease(request: RoomLeaseRequest): Promise<RoomLeaseRecord | undefined>;

  /** Renew only an unexpired lease owned by the requesting instance. */
  renewRoomLease(request: RoomLeaseRequest): Promise<RoomLeaseRecord | undefined>;

  /** Release only the lease owned by the requesting instance. */
  releaseRoomLease(roomId: string, ownerInstanceId: string): Promise<boolean>;

  getRoomLease(roomId: string): Promise<RoomLeaseRecord | undefined>;
}

export class InMemoryRoomLeaseStore implements RoomLeaseStore {
  private readonly leases = new Map<string, RoomLeaseRecord>();

  async acquireRoomLease(request: RoomLeaseRequest): Promise<RoomLeaseRecord | undefined> {
    const current = this.leases.get(request.roomId);
    if (
      current &&
      current.expiresAt > request.now &&
      current.ownerInstanceId !== request.ownerInstanceId
    ) {
      return undefined;
    }

    const lease = toLeaseRecord(request);
    this.leases.set(request.roomId, lease);
    return lease;
  }

  async renewRoomLease(request: RoomLeaseRequest): Promise<RoomLeaseRecord | undefined> {
    const current = this.leases.get(request.roomId);
    if (
      !current ||
      current.ownerInstanceId !== request.ownerInstanceId ||
      current.expiresAt <= request.now
    ) {
      return undefined;
    }

    const lease = toLeaseRecord(request);
    this.leases.set(request.roomId, lease);
    return lease;
  }

  async releaseRoomLease(roomId: string, ownerInstanceId: string): Promise<boolean> {
    const current = this.leases.get(roomId);
    if (!current || current.ownerInstanceId !== ownerInstanceId) {
      return false;
    }
    this.leases.delete(roomId);
    return true;
  }

  async getRoomLease(roomId: string): Promise<RoomLeaseRecord | undefined> {
    return this.leases.get(roomId);
  }
}

export function toLeaseRecord(request: RoomLeaseRequest): RoomLeaseRecord {
  return {
    roomId: request.roomId,
    ownerInstanceId: request.ownerInstanceId,
    expiresAt: request.now + normalizeLeaseTtl(request.ttlMs),
    updatedAt: request.now
  };
}

function normalizeLeaseTtl(ttlMs: number): number {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("Room lease ttlMs must be a positive finite number.");
  }
  return Math.floor(ttlMs);
}
