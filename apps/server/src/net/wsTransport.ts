import type { IncomingMessage, Server } from "node:http";

import { WebSocketServer } from "ws";
import type { RawData, WebSocket } from "ws";

import type { GatewayConnection } from "./GatewayConnection.js";
import type { WebSocketGateway } from "./WebSocketGateway.js";

export interface AttachOptions {
  /** WebSocket ceļš uz HTTP servera (noklusējums `/ws`). */
  readonly path?: string;
}

/**
 * Decision B: WebSocket dzīvo uz tā paša HTTP servera (un porta) caur `upgrade`
 * notikumu — palaidējam (`start-domino-poker.bat`) pietiek ar vienu portu 4000.
 *
 * Šis ir plāns I/O slānis: tas pārvērš `ws` socketu par `GatewayConnection` un
 * pārsūta atver/ziņojums/aizver notikumus uz transporta-agnostisko gateway.
 * Visa protokola loģika paliek `WebSocketGateway`.
 */
export function attachWebSocketGateway(
  httpServer: Server,
  gateway: WebSocketGateway,
  options: AttachOptions = {}
): WebSocketServer {
  const path = options.path ?? "/ws";
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== path) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket, _request: IncomingMessage) => {
    const conn = createConnection(ws);
    gateway.open(conn);
    ws.on("message", (data: RawData) => gateway.message(conn, decode(data)));
    ws.on("close", () => gateway.close(conn));
    ws.on("error", () => gateway.close(conn));
  });

  // Periodiska heartbeat izslaukšana (6.8). `unref` ļauj procesam beigties, ja
  // tikai šis timeris paliek aktīvs; tīrām pie wss aizvēršanas.
  const heartbeat = setInterval(() => gateway.sweepHeartbeats(), gateway.getPingIntervalMs());
  heartbeat.unref?.();
  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}

let connectionCounter = 0;

function createConnection(ws: WebSocket): GatewayConnection {
  connectionCounter += 1;
  const id = `conn-${connectionCounter}-${globalThis.crypto.randomUUID()}`;
  return {
    id,
    send(event): void {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
      }
    },
    sendSerialized(payload): void {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    },
    close(code, reason): void {
      ws.close(code, reason);
    },
    bufferedAmount(): number {
      return ws.bufferedAmount;
    }
  };
}

function decode(data: RawData): string {
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}
