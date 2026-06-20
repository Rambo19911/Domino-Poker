import type { ServerEvent } from "@domino-poker/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserRecord } from "../../src/auth/AuthStore.js";
import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import type { GatewayConnection } from "../../src/net/GatewayConnection.js";
import { CoreMessageRouter, type RouterWallet } from "../../src/net/messageRouter.js";
import { WebSocketGateway, type AuthResolver } from "../../src/net/WebSocketGateway.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";

class FakeConnection implements GatewayConnection {
  readonly id: string;
  readonly sent: ServerEvent[] = [];
  isClosed = false;

  constructor(id: string) {
    this.id = id;
  }

  send(event: ServerEvent): void {
    this.sent.push(event);
  }

  close(): void {
    this.isClosed = true;
  }

  typed<T extends ServerEvent["type"]>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.sent.filter((event): event is Extract<ServerEvent, { type: T }> => event.type === type);
  }

  lastTyped<T extends ServerEvent["type"]>(type: T): Extract<ServerEvent, { type: T }> | undefined {
    const matches = this.typed(type);
    return matches[matches.length - 1];
  }
}

function user(id: string): UserRecord {
  return {
    id,
    username: id,
    usernameNorm: id.toLowerCase(),
    passwordHash: "scrypt$fake",
    avatar: "avatar-01",
    createdAt: 1000,
    updatedAt: 1000
  };
}

const NOW = 1000;
let storage: SqliteStorage;

async function buildHarness(options: { routerWallet?: (real: WalletService) => RouterWallet } = {}) {
  storage = new SqliteStorage({ filename: ":memory:" });
  const wallet = new WalletService({ coins: storage, clock: () => NOW });
  const displayIds = new DisplayIdRegistry();
  let roomSeq = 0;
  let codeSeq = 0;
  let sessionSeq = 0;
  let entrySeq = 0;
  const rooms = new RoomManager({
    clock: () => NOW,
    displayIds,
    createRoomId: () => `room-${(roomSeq += 1)}`,
    createRoomCode: () => `CODE${(codeSeq += 1)}`
  });
  const chat = new LobbyChat({ clock: () => NOW });
  // tok-<userId> → autentificēts kā <userId> (vienkāršs testa atrisinātājs).
  const resolveAuth: AuthResolver = async (token) =>
    token.startsWith("tok-")
      ? { userId: token.slice(4), username: token.slice(4), avatar: "avatar-01", title: "student" }
      : undefined;
  const gateway = new WebSocketGateway({
    clock: () => NOW,
    displayIds,
    router: new CoreMessageRouter({
      rooms,
      chat,
      wallet: options.routerWallet ? options.routerWallet(wallet) : wallet,
      createEntryId: () => `entry-${(entrySeq += 1)}`
    }),
    createSessionId: () => `session-${(sessionSeq += 1)}`,
    createReconnectToken: () => `token-${sessionSeq}`,
    resolveAuth
  });
  return { gateway, rooms, wallet };
}

/** Reģistrē lietotāju + izsniedz starta bonusu (5000). */
async function seedUser(wallet: WalletService, id: string): Promise<void> {
  await storage.createUser(user(id));
  await wallet.getBalance(id); // repair-on-read → 5000
}

/** Pieslēdz autentificētu (vai anonīmu, ja userId nav) klientu un gaida WELCOME. */
async function connect(
  gateway: WebSocketGateway,
  connId: string,
  clientId: string,
  userId?: string
): Promise<FakeConnection> {
  const conn = new FakeConnection(connId);
  gateway.open(conn);
  gateway.message(
    conn,
    JSON.stringify({
      type: "HELLO",
      protocolVersion: "1",
      clientBuild: "t",
      clientId,
      ...(userId !== undefined ? { authToken: `tok-${userId}` } : {})
    })
  );
  await vi.waitFor(() => expect(conn.lastTyped("WELCOME")).toBeDefined());
  if (userId !== undefined) {
    await vi.waitFor(() => expect(gateway.getUserId(clientId)).toBe(userId));
  }
  conn.sent.length = 0;
  return conn;
}

function send(gateway: WebSocketGateway, conn: FakeConnection, message: Record<string, unknown>): void {
  gateway.message(conn, JSON.stringify(message));
}

afterEach(async () => {
  await storage.close();
});

describe("Paid MP rooms (Phase 3 routing)", () => {
  let gateway: WebSocketGateway;
  let wallet: WalletService;
  let rooms: RoomManager;

  beforeEach(async () => {
    const harness = await buildHarness();
    gateway = harness.gateway;
    wallet = harness.wallet;
    rooms = harness.rooms;
  });

  it("debits the host and seeds the pot when creating a paid room", async () => {
    await seedUser(wallet, "alice");
    const host = await connect(gateway, "h", "c-host", "alice");

    send(gateway, host, { type: "CREATE_ROOM", entryFee: 100 });

    await vi.waitFor(() => expect(host.lastTyped("ROOM_CREATED")).toBeDefined());
    const created = host.lastTyped("ROOM_CREATED")!;
    expect(created.room.entryFee).toBe(100);
    expect(created.room.pot).toBe(100);
    expect(host.lastTyped("WALLET_UPDATED")?.balance).toBe(4900);
    expect(await wallet.getBalance("alice")).toBe(4900);
  });

  it("debits a joiner and bumps the pot to two fees", async () => {
    await seedUser(wallet, "alice");
    await seedUser(wallet, "bob");
    const host = await connect(gateway, "h", "c-host", "alice");
    const guest = await connect(gateway, "g", "c-guest", "bob");

    send(gateway, host, { type: "CREATE_ROOM", entryFee: 100 });
    await vi.waitFor(() => expect(host.lastTyped("ROOM_CREATED")).toBeDefined());
    const roomId = host.lastTyped("ROOM_CREATED")!.room.id;

    send(gateway, guest, { type: "JOIN_ROOM", roomId, seatIndex: 1 });
    await vi.waitFor(() => expect(guest.lastTyped("WALLET_UPDATED")).toBeDefined());
    expect(guest.lastTyped("WALLET_UPDATED")?.balance).toBe(4900);
    expect(guest.lastTyped("ROOM_JOINED")?.room.pot).toBe(200);
    expect(await wallet.getBalance("bob")).toBe(4900);
  });

  it("refunds a joiner who leaves before the game starts", async () => {
    await seedUser(wallet, "alice");
    await seedUser(wallet, "bob");
    const host = await connect(gateway, "h", "c-host", "alice");
    const guest = await connect(gateway, "g", "c-guest", "bob");

    send(gateway, host, { type: "CREATE_ROOM", entryFee: 100 });
    await vi.waitFor(() => expect(host.lastTyped("ROOM_CREATED")).toBeDefined());
    const roomId = host.lastTyped("ROOM_CREATED")!.room.id;

    send(gateway, guest, { type: "JOIN_ROOM", roomId, seatIndex: 1 });
    await vi.waitFor(async () => expect(await wallet.getBalance("bob")).toBe(4900));

    send(gateway, guest, { type: "LEAVE_ROOM" });
    await vi.waitFor(async () => expect(await wallet.getBalance("bob")).toBe(5000));
    expect(guest.lastTyped("WALLET_UPDATED")?.balance).toBe(5000);
  });

  it("refunds every paid seat when the host deletes a waiting room", async () => {
    await seedUser(wallet, "alice");
    await seedUser(wallet, "bob");
    const host = await connect(gateway, "h", "c-host", "alice");
    const guest = await connect(gateway, "g", "c-guest", "bob");

    send(gateway, host, { type: "CREATE_ROOM", entryFee: 100 });
    await vi.waitFor(() => expect(host.lastTyped("ROOM_CREATED")).toBeDefined());
    const roomId = host.lastTyped("ROOM_CREATED")!.room.id;
    send(gateway, guest, { type: "JOIN_ROOM", roomId, seatIndex: 1 });
    await vi.waitFor(async () => expect(await wallet.getBalance("bob")).toBe(4900));

    send(gateway, host, { type: "DELETE_ROOM" });
    await vi.waitFor(async () => expect(await wallet.getBalance("alice")).toBe(5000));
    await vi.waitFor(async () => expect(await wallet.getBalance("bob")).toBe(5000));
  });

  it("rejects an anonymous client creating a paid room (no charge, no room)", async () => {
    const anon = await connect(gateway, "a", "c-anon");
    send(gateway, anon, { type: "CREATE_ROOM", entryFee: 100 });
    await vi.waitFor(() => expect(anon.lastTyped("ERROR")).toBeDefined());
    expect(anon.lastTyped("ERROR")?.code).toBe("FORBIDDEN");
    expect(anon.typed("ROOM_CREATED")).toHaveLength(0);
  });

  it("rejects an anonymous client joining a paid room", async () => {
    await seedUser(wallet, "alice");
    const host = await connect(gateway, "h", "c-host", "alice");
    const anon = await connect(gateway, "a", "c-anon");
    send(gateway, host, { type: "CREATE_ROOM", entryFee: 100 });
    await vi.waitFor(() => expect(host.lastTyped("ROOM_CREATED")).toBeDefined());
    const roomId = host.lastTyped("ROOM_CREATED")!.room.id;

    send(gateway, anon, { type: "JOIN_ROOM", roomId, seatIndex: 1 });
    await vi.waitFor(() => expect(anon.lastTyped("ERROR")).toBeDefined());
    expect(anon.lastTyped("ERROR")?.code).toBe("FORBIDDEN");
  });

  it("rejects creating a paid room beyond the host's balance (insufficient funds)", async () => {
    await seedUser(wallet, "alice"); // 5000
    const host = await connect(gateway, "h", "c-host", "alice");

    send(gateway, host, { type: "CREATE_ROOM", entryFee: 6000 });
    await vi.waitFor(() => expect(host.lastTyped("ERROR")).toBeDefined());
    expect(host.lastTyped("ERROR")?.code).toBe("INSUFFICIENT_FUNDS");
    expect(host.typed("ROOM_CREATED")).toHaveLength(0);
    // Bilance neskarta; istaba neizveidota.
    expect(await wallet.getBalance("alice")).toBe(5000);
  });

  it("rejects the same user holding a second paid seat (would break payout idempotency)", async () => {
    await seedUser(wallet, "alice");
    await seedUser(wallet, "bob");
    const host = await connect(gateway, "h", "c-host", "alice");
    send(gateway, host, { type: "CREATE_ROOM", entryFee: 100 });
    await vi.waitFor(() => expect(host.lastTyped("ROOM_CREATED")).toBeDefined());
    const roomId = host.lastTyped("ROOM_CREATED")!.room.id;

    // Otra SESIJA tam pašam userId "alice" (cits clientId) mēģina ieņemt otru sēdvietu.
    const alice2 = await connect(gateway, "h2", "c-host-2", "alice");
    send(gateway, alice2, { type: "JOIN_ROOM", roomId, seatIndex: 1 });
    await vi.waitFor(() => expect(alice2.lastTyped("ERROR")).toBeDefined());
    expect(alice2.lastTyped("ERROR")?.code).toBe("ALREADY_IN_ROOM");
    // Otrais userId netika debitēts.
    expect(await wallet.getBalance("alice")).toBe(4900); // tikai sākotnējā istabas maksa
  });

  it("keeps free rooms unchanged (no charge, entryFee 0)", async () => {
    const anon = await connect(gateway, "a", "c-anon");
    send(gateway, anon, { type: "CREATE_ROOM" });
    await vi.waitFor(() => expect(anon.lastTyped("ROOM_CREATED")).toBeDefined());
    expect(anon.lastTyped("ROOM_CREATED")?.room.entryFee).toBe(0);
    expect(anon.typed("WALLET_UPDATED")).toHaveLength(0);
  });

  it("never seats the same user twice under a concurrent join race (charges once)", async () => {
    await seedUser(wallet, "host");
    await seedUser(wallet, "alice");
    const owner = await connect(gateway, "o", "c-owner", "host");
    send(gateway, owner, { type: "CREATE_ROOM", entryFee: 100 });
    await vi.waitFor(() => expect(owner.lastTyped("ROOM_CREATED")).toBeDefined());
    const roomId = owner.lastTyped("ROOM_CREATED")!.room.id;

    // Divas alise sesijas (cits clientId, tas pats userId) pievienojas VIENLAIKUS.
    const a1 = await connect(gateway, "a1", "c-alice-1", "alice");
    const a2 = await connect(gateway, "a2", "c-alice-2", "alice");
    send(gateway, a1, { type: "JOIN_ROOM", roomId, seatIndex: 1 });
    send(gateway, a2, { type: "JOIN_ROOM", roomId, seatIndex: 2 });

    // Tieši viena sēdvieta aizņemta + tieši viens noraidījums; alise debitēta vienreiz.
    await vi.waitFor(async () => expect(await wallet.getBalance("alice")).toBe(4900));
    const errors = [...a1.typed("ERROR"), ...a2.typed("ERROR")].filter(
      (e) => e.code === "ALREADY_IN_ROOM"
    );
    expect(errors).toHaveLength(1);
    const view = rooms.findRoom(roomId);
    const aliceSeats = view.seats.filter((s) => s.entry?.payerUserId === "alice");
    expect(aliceSeats).toHaveLength(1);
  });

  it("retries a transient refund failure on the next sweep (idempotent)", async () => {
    let failNextRefund = true;
    const harness = await buildHarness({
      routerWallet: (real) => ({
        debitEntryFee: (userId: string, entryId: string, fee: number) =>
          real.debitEntryFee(userId, entryId, fee),
        refundEntryFee: async (userId: string, entryId: string, fee: number) => {
          if (failNextRefund) {
            failNextRefund = false;
            throw new Error("transient db error");
          }
          return real.refundEntryFee(userId, entryId, fee);
        }
      })
    });
    const gw = harness.gateway;
    await seedUser(harness.wallet, "host");
    await seedUser(harness.wallet, "bob");
    const owner = await connect(gw, "o", "c-owner", "host");
    send(gw, owner, { type: "CREATE_ROOM", entryFee: 100 });
    await vi.waitFor(() => expect(owner.lastTyped("ROOM_CREATED")).toBeDefined());
    const roomId = owner.lastTyped("ROOM_CREATED")!.room.id;
    const guest = await connect(gw, "g", "c-guest", "bob");
    send(gw, guest, { type: "JOIN_ROOM", roomId, seatIndex: 1 });
    await vi.waitFor(async () => expect(await harness.wallet.getBalance("bob")).toBe(4900));

    // Leave → refunds #1 neizdodas (transient) → aizturēts; bilance vēl 4900.
    send(gw, guest, { type: "LEAVE_ROOM" });
    await vi.waitFor(() => expect(guest.lastTyped("ROOM_LEFT")).toBeDefined());
    expect(await harness.wallet.getBalance("bob")).toBe(4900);

    // Periodiskais sweep atkārto aizturēto refundu → izdodas → bilance atjaunota.
    gw.sweepExpiredRooms();
    await vi.waitFor(async () => expect(await harness.wallet.getBalance("bob")).toBe(5000));
  });
});
