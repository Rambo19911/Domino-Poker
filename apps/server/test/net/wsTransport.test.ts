import type { AddressInfo } from "node:net";

import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { LobbyChat } from "../../src/chat/LobbyChat.js";
import { createHealthHttpServer } from "../../src/httpServer.js";
import { DisplayIdRegistry } from "../../src/identity/DisplayIdRegistry.js";
import { CoreMessageRouter } from "../../src/net/messageRouter.js";
import { WebSocketGateway } from "../../src/net/WebSocketGateway.js";
import { attachWebSocketGateway } from "../../src/net/wsTransport.js";
import { RoomManager } from "../../src/rooms/RoomManager.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((fn) => fn()));
});

async function startServer(): Promise<number> {
  const displayIds = new DisplayIdRegistry();
  const rooms = new RoomManager({ clock: () => Date.now(), displayIds });
  const chat = new LobbyChat({ clock: () => Date.now() });
  const gateway = new WebSocketGateway({
    clock: () => Date.now(),
    displayIds,
    router: new CoreMessageRouter({ rooms, chat })
  });
  const server = createHealthHttpServer();
  attachWebSocketGateway(server, gateway);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
  );
  return (server.address() as AddressInfo).port;
}

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => resolve(JSON.parse(data.toString())));
    socket.once("error", reject);
  });
}

describe("attachWebSocketGateway (decision B — WS on the HTTP port)", () => {
  it("completes a HELLO → WELCOME roundtrip over a real socket on /ws", async () => {
    const port = await startServer();
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    cleanups.push(async () => client.close());

    await new Promise<void>((resolve, reject) => {
      client.once("open", resolve);
      client.once("error", reject);
    });

    client.send(
      JSON.stringify({
        type: "HELLO",
        protocolVersion: "1",
        clientBuild: "itest",
        clientId: "client-itest"
      })
    );

    const welcome = (await nextMessage(client)) as { type: string; playerId: string };
    expect(welcome.type).toBe("WELCOME");
    expect(welcome.playerId).toBe("client-itest");
  });
});
