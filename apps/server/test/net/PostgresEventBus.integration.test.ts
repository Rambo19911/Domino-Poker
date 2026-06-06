import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ServerEvent } from "@domino-poker/shared";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import type { GatewayConnection } from "../../src/net/GatewayConnection.js";
import { CoreMessageRouter } from "../../src/net/messageRouter.js";
import { PostgresEventBus } from "../../src/net/PostgresEventBus.js";
import type { ServerEventFanoutMessage } from "../../src/net/ServerEventBus.js";
import { WebSocketGateway } from "../../src/net/WebSocketGateway.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";
import { PostgresStorage } from "../../src/storage/PostgresStorage.js";

const postgresUrl = process.env.TEST_POSTGRES_DATABASE_URL?.trim();
const describeIfPostgres = postgresUrl ? describe : describe.skip;

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function withSearchPath(connectionString: string, schemaName: string): string {
  const url = new URL(connectionString);
  url.searchParams.set("options", `-c search_path=${schemaName}`);
  return url.toString();
}

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = read();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for PostgreSQL fanout notification.");
}

class FakeConnection implements GatewayConnection {
  readonly sent: ServerEvent[] = [];
  isClosed = false;
  closedCode: number | undefined;

  constructor(readonly id: string) {}

  send(event: ServerEvent): void {
    this.sent.push(event);
  }

  close(code?: number): void {
    this.isClosed = true;
    this.closedCode = code;
  }
}

function hello(clientId: string, reconnectToken?: string): string {
  return JSON.stringify({
    type: "HELLO",
    protocolVersion: "1",
    clientBuild: "test",
    clientId,
    ...(reconnectToken ? { reconnectToken } : {})
  });
}

function buildGateway(options: {
  readonly storage: PostgresStorage;
  readonly bus: PostgresEventBus;
  readonly sessionId: string;
  readonly reconnectToken: string;
}): WebSocketGateway {
  const displayIds = new DisplayIdRegistry();
  const rooms = new RoomManager({ clock: () => 1000, displayIds });
  const chat = new LobbyChat({ clock: () => 1000 });
  return new WebSocketGateway({
    clock: () => 1000,
    displayIds,
    router: new CoreMessageRouter({ rooms, chat }),
    durableSessionStore: options.storage,
    eventBus: options.bus,
    createSessionId: () => options.sessionId,
    createReconnectToken: () => options.reconnectToken
  });
}

describeIfPostgres("PostgresEventBus integration", () => {
  let client: Client;
  let schemaName: string;
  let sender: PostgresEventBus;
  let receiver: PostgresEventBus;
  let schemaUrl: string;
  let storageA: PostgresStorage | undefined;
  let storageB: PostgresStorage | undefined;

  beforeEach(async () => {
    schemaName = `domino_poker_bus_test_${process.pid}_${Date.now()}`;
    client = new Client({ connectionString: postgresUrl });
    await client.connect();
    await client.query(`CREATE SCHEMA ${quoteIdentifier(schemaName)}`);
    schemaUrl = withSearchPath(postgresUrl!, schemaName);
    sender = await PostgresEventBus.open({
      connectionString: schemaUrl,
      instanceId: "instance-a",
      clock: () => 1000
    });
    receiver = await PostgresEventBus.open({
      connectionString: schemaUrl,
      instanceId: "instance-b",
      clock: () => 1000
    });
  });

  afterEach(async () => {
    await storageA?.close();
    await storageB?.close();
    await sender?.close();
    await receiver?.close();
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`);
      await client.end();
    }
  });

  it("fans out a broadcast from one PostgreSQL-backed instance to another", async () => {
    const received: ServerEventFanoutMessage[] = [];
    await receiver.start((message) => received.push(message));

    const message: ServerEventFanoutMessage = {
      kind: "broadcast",
      event: { type: "CHAT_MESSAGE", id: "m1", authorDisplayId: "#12345", text: "hi", serverNow: 1 }
    };
    await sender.publish(message);

    await expect(waitFor(() => received[0])).resolves.toEqual(message);
  });

  it("fans out a session supersede signal between instances", async () => {
    const received: ServerEventFanoutMessage[] = [];
    await receiver.start((message) => received.push(message));

    const message: ServerEventFanoutMessage = { kind: "supersede", playerId: "client-A" };
    await sender.publish(message);

    await expect(waitFor(() => received[0])).resolves.toEqual(message);
  });

  it("prunes expired fanout rows during publish", async () => {
    await sender.close();
    sender = await PostgresEventBus.open({
      connectionString: schemaUrl,
      instanceId: "instance-a",
      clock: () => 1000,
      retentionMs: 100,
      pruneIntervalMs: 1
    });
    const tableName = `${quoteIdentifier(schemaName)}.server_event_fanout`;
    await client.query(
      `INSERT INTO ${tableName} (event_id, origin_instance_id, message_json, created_at)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [
        "old-event",
        "instance-b",
        JSON.stringify({
          kind: "broadcast",
          event: { type: "LOBBY_STATE", rooms: [], onlineCount: 0 }
        }),
        899
      ]
    );

    await sender.publish({
      kind: "broadcast",
      event: { type: "LOBBY_STATE", rooms: [], onlineCount: 1 }
    });

    const result = await client.query<{ readonly count: string }>(
      `SELECT count(*) AS count FROM ${tableName} WHERE event_id = $1`,
      ["old-event"]
    );
    expect(Number(result.rows[0]?.count)).toBe(0);
  });

  it("supports cross-instance reconnect and supersedes the old socket", async () => {
    storageA = await PostgresStorage.open(schemaUrl);
    storageB = await PostgresStorage.open(schemaUrl);
    const gatewayA = buildGateway({
      storage: storageA,
      bus: sender,
      sessionId: "session-a",
      reconnectToken: "token-1"
    });
    const gatewayB = buildGateway({
      storage: storageB,
      bus: receiver,
      sessionId: "session-b",
      reconnectToken: "token-ignored"
    });
    await sender.start((message) => {
      if (message.kind === "supersede") {
        gatewayA.closeRemoteSupersededPlayer(message.playerId);
      }
    });
    await receiver.start((message) => {
      if (message.kind === "supersede") {
        gatewayB.closeRemoteSupersededPlayer(message.playerId);
      }
    });

    const first = new FakeConnection("conn-a");
    gatewayA.open(first);
    gatewayA.message(first, hello("client-A"));
    const firstWelcome = await waitFor(() =>
      first.sent.find((event): event is Extract<ServerEvent, { type: "WELCOME" }> => event.type === "WELCOME")
    );

    const second = new FakeConnection("conn-b");
    gatewayB.open(second);
    gatewayB.message(second, hello("client-A", firstWelcome.reconnectToken));
    const secondWelcome = await waitFor(() =>
      second.sent.find((event): event is Extract<ServerEvent, { type: "WELCOME" }> => event.type === "WELCOME")
    );

    await waitFor(() => (first.isClosed ? true : undefined));
    expect(first.closedCode).toBe(4003);
    expect(secondWelcome.reconnectToken).toBe(firstWelcome.reconnectToken);
    expect(secondWelcome.displayId).toBe(firstWelcome.displayId);
  });
});
