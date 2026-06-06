import type { ServerEvent } from "@domino-poker/shared";
import { describe, expect, it } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import type { GatewayConnection } from "../../src/net/GatewayConnection.js";
import { CoreMessageRouter } from "../../src/net/messageRouter.js";
import { WebSocketGateway } from "../../src/net/WebSocketGateway.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";

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

function buildGateway(): WebSocketGateway {
  const displayIds = new DisplayIdRegistry();
  const rooms = new RoomManager({ clock: () => NOW, displayIds });
  // burstCapacity 1: otrā ziņa tūlīt pēc pirmās (tas pats NOW → bez atjaunošanās)
  // tiek ierobežota — tā "too-fast second message" tests paliek noteikts.
  const chat = new LobbyChat({ clock: () => NOW, burstCapacity: 1 });
  return new WebSocketGateway({ clock: () => NOW, displayIds, router: new CoreMessageRouter({ rooms, chat }) });
}

/** HELLO handshake; atgriež savienojumu un tā publisko displayId no WELCOME. */
function connect(gateway: WebSocketGateway, id: string, clientId: string): { conn: FakeConnection; displayId: string } {
  const conn = new FakeConnection(id);
  gateway.open(conn);
  gateway.message(conn, JSON.stringify({ type: "HELLO", protocolVersion: "1", clientBuild: "t", clientId }));
  const welcome = conn.lastTyped("WELCOME");
  const displayId = welcome?.displayId ?? "";
  conn.sent.length = 0;
  return { conn, displayId };
}

function send(gateway: WebSocketGateway, conn: FakeConnection, message: Record<string, unknown>): void {
  gateway.message(conn, JSON.stringify(message));
}

describe("Chat message routing (6.6)", () => {
  it("broadcasts a CHAT_MESSAGE to everyone with the server-authoritative author", () => {
    const gateway = buildGateway();
    const a = connect(gateway, "c1", "alice");
    const b = connect(gateway, "c2", "bob");

    send(gateway, a.conn, { type: "SEND_CHAT", requestId: "r1", text: "hello <there>" });

    for (const conn of [a.conn, b.conn]) {
      const message = conn.lastTyped("CHAT_MESSAGE");
      expect(message?.authorDisplayId).toBe(a.displayId);
      expect(message?.text).toBe("hello <there>"); // raw; klients escapē renderējot
    }
  });

  it("rejects an empty message with INVALID_MESSAGE and echoes the requestId", () => {
    const gateway = buildGateway();
    const a = connect(gateway, "c1", "alice");
    const b = connect(gateway, "c2", "bob");

    send(gateway, a.conn, { type: "SEND_CHAT", requestId: "r9", text: "   " });

    expect(a.conn.lastTyped("ERROR")).toMatchObject({ code: "INVALID_MESSAGE", requestId: "r9" });
    expect(b.conn.typed("CHAT_MESSAGE")).toHaveLength(0);
  });

  it("rejects a too-fast second message with RATE_LIMITED", () => {
    const gateway = buildGateway();
    const a = connect(gateway, "c1", "alice");

    send(gateway, a.conn, { type: "SEND_CHAT", requestId: "r1", text: "first" });
    send(gateway, a.conn, { type: "SEND_CHAT", requestId: "r2", text: "second" });

    expect(a.conn.lastTyped("ERROR")).toMatchObject({ code: "RATE_LIMITED", requestId: "r2" });
    expect(a.conn.typed("CHAT_MESSAGE")).toHaveLength(1);
  });

  it("delivers CHAT_HISTORY with prior messages to a newcomer", () => {
    const gateway = buildGateway();
    const a = connect(gateway, "c1", "alice");
    send(gateway, a.conn, { type: "SEND_CHAT", requestId: "r1", text: "earlier" });

    // A newcomer's handshake should include the existing chat history.
    const newcomer = new FakeConnection("c2");
    gateway.open(newcomer);
    gateway.message(
      newcomer,
      JSON.stringify({ type: "HELLO", protocolVersion: "1", clientBuild: "t", clientId: "bob" })
    );

    const history = newcomer.lastTyped("CHAT_HISTORY");
    expect(history?.messages.map((message) => message.text)).toEqual(["earlier"]);
  });
});
