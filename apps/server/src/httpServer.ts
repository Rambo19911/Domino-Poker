import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import process from "node:process";

export interface HealthHttpServerOptions {
  /**
   * Aktīvo (handshake pabeigušo) savienojumu skaits `/metrics` atskaitei. Injicē
   * `index.ts` no gateway, lai httpServer paliek atsaistīts no tīkla slāņa.
   */
  readonly connectionCount?: () => number;
}

/**
 * Mazs HTTP serviss operāciju vajadzībām: `/health` (dzīvīgums) un `/metrics`
 * (Fāze 11 — servera RSS/CPU/uptime/savienojumi slodzes testam un VPS uzraudzībai).
 * Apzināti bez ārējām atkarībām; spēles loģika šeit neiekļūst.
 */
export function createHealthHttpServer(options: HealthHttpServerOptions = {}): Server {
  return createServer((request, response) => handleRequest(request, response, options));
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: HealthHttpServerOptions
): void {
  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && request.url === "/metrics") {
    writeJson(response, 200, collectMetrics(options));
    return;
  }

  writeJson(response, 404, { error: "Not found" });
}

/** Servera procesa momentuzņēmums. CPU ir kumulatīvs (µs) — klients rēķina deltas. */
function collectMetrics(options: HealthHttpServerOptions): Record<string, number> {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    uptimeSec: Math.round(process.uptime() * 1000) / 1000,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    cpuUserMicros: cpu.user,
    cpuSystemMicros: cpu.system,
    connections: options.connectionCount?.() ?? 0
  };
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}
