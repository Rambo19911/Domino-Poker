import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import process from "node:process";

import type { AuthHandler } from "./http/authRoutes.js";

interface PoolCounts {
  readonly total: number;
  readonly idle: number;
  readonly waiting: number;
}

/** DB momentuzņēmums `/metrics` (strukturāli saderīgs ar `DbHealthReport` + event-bus pool). */
export interface DbHealthSnapshot {
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly pool: PoolCounts;
  readonly fanout: { readonly rows: number; readonly oldestAgeMs: number };
  readonly tables: Record<string, { readonly rows: number; readonly bytes: number }>;
  /** Event-bus pool piesātinājums (ja PG fanout aktīvs); `undefined`, ja nav event bus. */
  readonly eventBusPool?: PoolCounts;
}

export interface HealthHttpServerOptions {
  /**
   * Aktīvo (handshake pabeigušo) savienojumu skaits `/metrics` atskaitei. Injicē
   * `index.ts` no gateway, lai httpServer paliek atsaistīts no tīkla slāņa.
   */
  readonly connectionCount?: () => number;
  /**
   * Opcionāla DB veselības zonde `/metrics` (tikai PostgreSQL režīmā). Injicē
   * `index.ts` no `PostgresStorage.healthCheck`; SQLite režīmā netiek dota.
   */
  readonly dbHealth?: () => Promise<DbHealthSnapshot>;
  /**
   * Opcionāls auth HTTP maršrutu apstrādātājs (`/auth/*`). Injicē `index.ts` no
   * `createAuthHandler`. Atgriež `true`, ja apstrādāja ceļu, citādi `false` → 404.
   */
  readonly authHandler?: AuthHandler;
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
    void collectMetrics(options)
      .then((metrics) => writeJson(response, 200, metrics))
      .catch((error: unknown) => {
        console.error("[metrics] failed to collect metrics:", error);
        writeJson(response, 500, { error: "metrics_failed" });
      });
    return;
  }

  if (options.authHandler !== undefined) {
    void options
      .authHandler(request, response)
      .then((handled) => {
        if (!handled) {
          writeJson(response, 404, { error: "Not found" });
        }
      })
      .catch((error: unknown) => {
        console.error("[auth] handler failed:", error);
        if (!response.headersSent) {
          writeJson(response, 500, { error: "internal_error" });
        }
      });
    return;
  }

  writeJson(response, 404, { error: "Not found" });
}

/**
 * Servera procesa momentuzņēmums. CPU ir kumulatīvs (µs) — klients rēķina deltas.
 * PG režīmā pievieno `db` apakšobjektu ar veselību + pool piesātinājumu.
 */
async function collectMetrics(
  options: HealthHttpServerOptions
): Promise<Record<string, unknown>> {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const base = {
    uptimeSec: Math.round(process.uptime() * 1000) / 1000,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    cpuUserMicros: cpu.user,
    cpuSystemMicros: cpu.system,
    connections: options.connectionCount?.() ?? 0
  };
  if (options.dbHealth === undefined) {
    return base;
  }
  return { ...base, db: await options.dbHealth() };
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}
