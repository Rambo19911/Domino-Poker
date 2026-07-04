import { BOT_ASSISTANT_PRICE, SUPPORT_HUMAN_ITEM_ID, type ServerEvent } from "@domino-poker/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UserRecord } from "../../src/auth/AuthStore.js";
import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import type { GatewayConnection } from "../../src/net/GatewayConnection.js";
import { CoreMessageRouter } from "../../src/net/messageRouter.js";
import { WebSocketGateway, type AuthResolver } from "../../src/net/WebSocketGateway.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";
import { SqliteStorage } from "../../src/storage/SqliteStorage.js";
import { WalletService } from "../../src/wallet/WalletService.js";

class FakeConnection implements GatewayConnection {
  readonly id: string;
  readonly sent: ServerEvent[] = [];

  constructor(id: string) {
    this.id = id;
  }

  send(event: ServerEvent): void {
    this.sent.push(event);
  }

  close(): void {
    /* no-op */
  }

  typed<T extends ServerEvent["type"]>(type: T): Extract<ServerEvent, { type: T }>[] {
    return this.sent.filter((event): event is Extract<ServerEvent, { type: T }> => event.type === type);
  }

  lastTyped<T extends ServerEvent["type"]>(type: T): Extract<ServerEvent, { type: T }> | undefined {
    const matches = this.typed(type);
    return matches[matches.length - 1];
  }
}

const NOW = 1000;
let storage: SqliteStorage;

function user(id: string): UserRecord {
  return {
    id,
    username: id,
    usernameNorm: id.toLowerCase(),
    passwordHash: "scrypt$fake",
    avatar: "avatar-01",
    createdAt: NOW,
    updatedAt: NOW
  };
}

async function buildHarness() {
  storage = new SqliteStorage({ filename: ":memory:" });
  const wallet = new WalletService({ coins: storage, clock: () => NOW });
  const displayIds = new DisplayIdRegistry();
  let sessionSeq = 0;
  const rooms = new RoomManager({
    clock: () => NOW,
    displayIds,
    createRoomId: () => "room-1",
    createRoomCode: () => "CODE1",
    createSeed: () => "seed-fixed"
  });
  const chat = new LobbyChat({ clock: () => NOW });
  const resolveAuth: AuthResolver = async (token) =>
    token.startsWith("tok-")
      ? { userId: token.slice(4), username: token.slice(4), avatar: "avatar-01", title: "student" }
      : undefined;
  const gateway = new WebSocketGateway({
    clock: () => NOW,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat, wallet }),
    createSessionId: () => `session-${(sessionSeq += 1)}`,
    createReconnectToken: () => `token-${sessionSeq}`,
    resolveAuth
  });
  return { gateway, rooms, wallet };
}

/** Reģistrē lietotāju (+ starta bonuss). */
async function seedUser(wallet: WalletService, id: string): Promise<void> {
  await storage.createUser(user(id));
  await wallet.getBalance(id);
}

/** Piešķir `bot.supportHuman` īpašumtiesības (top-up + reāls pirkums → bot_purchase ledger). */
async function grantBotOwnership(wallet: WalletService, userId: string): Promise<void> {
  await wallet.adminAdjust(userId, `grant-${userId}`, BOT_ASSISTANT_PRICE);
  const result = await wallet.purchaseItem(userId, SUPPORT_HUMAN_ITEM_ID, BOT_ASSISTANT_PRICE, "bot_purchase");
  expect(result.ok).toBe(true);
}

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

/** Pēdējais TURN_STARTED turnId, kas piederēja dotajam core spēlētājam (no piegādātajiem eventiem). */
function lastTurnIdForPlayer(conn: FakeConnection, corePlayerId: string): string {
  const turns = conn
    .typed("GAME_EVENT")
    .filter((entry) => entry.event.type === "TURN_STARTED")
    .map((entry) => (entry.event as { turn: { turnId: string; playerId: string } }).turn)
    .filter((turn) => turn.playerId === corePlayerId);
  const last = turns[turns.length - 1];
  if (!last) throw new Error(`No TURN_STARTED for player ${corePlayerId}.`);
  return last.turnId;
}

/**
 * Autentificēts host (seat 0 = core "1") + 3 boti, spēle sākta un aizvirzīta līdz host
 * IZSPĒLES kārtai (host nosola, pēc tam boti auto-izspēlē līdz host gājienam). Atgriež host.
 */
async function startOwnerGameAtPlayingTurn(gateway: WebSocketGateway, userId = "host"): Promise<FakeConnection> {
  const host = await connect(gateway, "c1", "host", userId);
  send(gateway, host, { type: "CREATE_ROOM" });
  send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
  send(gateway, host, { type: "START_GAME" });
  const bidTurn = lastTurnIdForPlayer(host, "1");
  send(gateway, host, { type: "SUBMIT_BID", requestId: "bid", roomId: "room-1", turnId: bidTurn, bid: 0 });
  return host;
}

afterEach(async () => {
  await storage.close();
});

describe("REQUEST_HINT routing (B daļa)", () => {
  it("grants hints to an owner on their playing turn, decrementing to zero then no_quota", async () => {
    const { gateway, wallet } = await buildHarness();
    await seedUser(wallet, "host");
    await grantBotOwnership(wallet, "host");
    const host = await startOwnerGameAtPlayingTurn(gateway);
    const turnId = lastTurnIdForPlayer(host, "1"); // izspēles kārta (pēc solījuma + advance)

    const req = (requestId: string): void =>
      send(gateway, host, { type: "REQUEST_HINT", requestId, roomId: "room-1", turnId });

    req("h1");
    req("h2");
    req("h3");
    req("h4");

    await vi.waitFor(() => expect(host.typed("HINT_GRANTED")).toHaveLength(3));
    await vi.waitFor(() => expect(host.typed("HINT_DENIED")).toHaveLength(1));
    // 3 grantēti atlikumi = {2,1,0} (secība atkarīga no async plānošanas — pārbaudām kopu).
    const grantedRemaining = host.typed("HINT_GRANTED").map((event) => event.hintsRemaining).sort();
    expect(grantedRemaining).toEqual([0, 1, 2]);
    expect(host.typed("HINT_DENIED")[0]).toMatchObject({ reason: "no_quota", hintsRemaining: 0, roomId: "room-1" });
  });

  it("is idempotent for a repeated requestId (no double decrement)", async () => {
    const { gateway, wallet } = await buildHarness();
    await seedUser(wallet, "host");
    await grantBotOwnership(wallet, "host");
    const host = await startOwnerGameAtPlayingTurn(gateway);
    const turnId = lastTurnIdForPlayer(host, "1");

    send(gateway, host, { type: "REQUEST_HINT", requestId: "dup", roomId: "room-1", turnId });
    send(gateway, host, { type: "REQUEST_HINT", requestId: "dup", roomId: "room-1", turnId });

    await vi.waitFor(() => expect(host.typed("HINT_GRANTED")).toHaveLength(2));
    // Abas atbildes rāda TO PAŠU atlikumu (2) — kvota atskaitīta tikai vienreiz.
    expect(host.typed("HINT_GRANTED").every((event) => event.hintsRemaining === 2)).toBe(true);
  });

  it("denies a hint when the requester does not own the bot assistant", async () => {
    const { gateway, wallet } = await buildHarness();
    await seedUser(wallet, "host"); // NAV grantBotOwnership
    const host = await startOwnerGameAtPlayingTurn(gateway);
    const turnId = lastTurnIdForPlayer(host, "1");
    host.sent.length = 0;

    send(gateway, host, { type: "REQUEST_HINT", requestId: "no", roomId: "room-1", turnId });

    await vi.waitFor(() =>
      expect(host.lastTyped("HINT_DENIED")).toMatchObject({ reason: "not_owned", requestId: "no" })
    );
    expect(host.typed("HINT_GRANTED")).toHaveLength(0);
  });

  it("denies a hint during the bidding phase (not the player's playing turn)", async () => {
    const { gateway, wallet } = await buildHarness();
    await seedUser(wallet, "host");
    await grantBotOwnership(wallet, "host");
    const host = await connect(gateway, "c1", "host", "host");
    send(gateway, host, { type: "CREATE_ROOM" });
    send(gateway, host, { type: "FILL_SEATS_WITH_BOTS" });
    send(gateway, host, { type: "START_GAME" });
    const bidTurn = lastTurnIdForPlayer(host, "1"); // solīšanas kārta (vēl nav izspēle)
    host.sent.length = 0;

    send(gateway, host, { type: "REQUEST_HINT", requestId: "b", roomId: "room-1", turnId: bidTurn });

    await vi.waitFor(() =>
      expect(host.lastTyped("HINT_DENIED")).toMatchObject({ reason: "not_your_turn", requestId: "b" })
    );
  });

  it("denies a hint before the game has started with no_active_game", async () => {
    const { gateway, wallet } = await buildHarness();
    await seedUser(wallet, "host");
    await grantBotOwnership(wallet, "host");
    const host = await connect(gateway, "c1", "host", "host");
    send(gateway, host, { type: "CREATE_ROOM" }); // WAITING istaba, vēl nav dzinēja
    host.sent.length = 0;

    send(gateway, host, { type: "REQUEST_HINT", requestId: "pre", roomId: "room-1", turnId: "t" });

    await vi.waitFor(() =>
      expect(host.lastTyped("HINT_DENIED")).toMatchObject({ reason: "no_active_game", requestId: "pre" })
    );
    expect(host.typed("ERROR")).toHaveLength(0);
  });

  it("rejects a hint for a room the player is not in with FORBIDDEN", async () => {
    const { gateway, wallet } = await buildHarness();
    await seedUser(wallet, "host");
    await seedUser(wallet, "outsider");
    await grantBotOwnership(wallet, "outsider");
    await startOwnerGameAtPlayingTurn(gateway);
    const outsider = await connect(gateway, "c2", "outsider", "outsider");

    send(gateway, outsider, { type: "REQUEST_HINT", requestId: "y", roomId: "room-1", turnId: "t" });

    await vi.waitFor(() =>
      expect(outsider.lastTyped("ERROR")).toMatchObject({ code: "FORBIDDEN", requestId: "y" })
    );
    expect(outsider.typed("HINT_GRANTED")).toHaveLength(0);
    expect(outsider.typed("HINT_DENIED")).toHaveLength(0);
  });
});
