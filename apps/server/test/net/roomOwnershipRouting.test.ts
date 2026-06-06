import type { ServerEvent } from "@domino-poker/shared";
import { describe, expect, it } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import type { GatewayConnection } from "../../src/net/GatewayConnection.js";
import type { GatewayHub } from "../../src/net/GatewayHub.js";
import { CoreMessageRouter } from "../../src/net/messageRouter.js";
import { LobbyError } from "../../src/rooms/lobbyErrors.js";
import type { RoomOwnershipGuard } from "../../src/rooms/RoomOwnershipGuard.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";
import type { SessionIdentity } from "../../src/sessions/SessionManager.js";

class FakeConnection implements GatewayConnection {
  readonly id = "conn-1";
  readonly sent: ServerEvent[] = [];

  send(event: ServerEvent): void {
    this.sent.push(event);
  }

  close(): void {
    // no-op
  }

  lastTyped<T extends ServerEvent["type"]>(type: T): Extract<ServerEvent, { type: T }> | undefined {
    const matches = this.sent.filter((event): event is Extract<ServerEvent, { type: T }> => event.type === type);
    return matches[matches.length - 1];
  }
}

class FakeHub implements GatewayHub {
  readonly broadcasted: ServerEvent[] = [];

  broadcast(event: ServerEvent): void {
    this.broadcasted.push(event);
  }

  sendToPlayer(_playerId: string, _event: ServerEvent): void {
    // The room ownership tests only assert direct command results.
  }

  onlineCount(): number {
    return 1;
  }

  isOnline(): boolean {
    return true;
  }
}

class ToggleRoomOwnershipGuard implements RoomOwnershipGuard {
  readonly ensuredRoomIds: string[] = [];
  readonly releasedRoomIds: string[] = [];
  deny = false;

  ensureOwner(roomId: string): void {
    this.ensuredRoomIds.push(roomId);
    if (this.deny) {
      throw new LobbyError("FORBIDDEN", `Room ${roomId} is owned by another server instance.`);
    }
  }

  release(roomId: string): void {
    this.releasedRoomIds.push(roomId);
  }
}

function buildHarness() {
  const rooms = new RoomManager({
    clock: () => 1000,
    createRoomId: () => "room-1",
    createRoomCode: () => "CODE1"
  });
  const chat = new LobbyChat({ clock: () => 1000 });
  const roomOwnership = new ToggleRoomOwnershipGuard();
  const router = new CoreMessageRouter({ rooms, chat, roomOwnership });
  const conn = new FakeConnection();
  const hub = new FakeHub();
  const identity: SessionIdentity = {
    connectionId: conn.id,
    sessionId: "session-1",
    playerId: "host",
    displayId: "P1",
    reconnectToken: "token-1"
  };
  const ctx = { identity, conn, hub, serverNow: 1000 };
  return { conn, ctx, roomOwnership, router };
}

describe("room ownership routing", () => {
  it("rejects room-scoped commands before mutating when another instance owns the lease", async () => {
    const { conn, ctx, roomOwnership, router } = buildHarness();

    await router.route(ctx, { type: "CREATE_ROOM", fillWithBots: true });
    roomOwnership.deny = true;

    await router.route(ctx, { type: "START_GAME" });

    expect(roomOwnership.ensuredRoomIds).toEqual(["room-1", "room-1"]);
    expect(conn.lastTyped("ERROR")).toMatchObject({
      code: "FORBIDDEN",
      message: "Room room-1 is owned by another server instance."
    });
    expect(conn.lastTyped("GAME_STARTING")).toBeUndefined();
  });
});

