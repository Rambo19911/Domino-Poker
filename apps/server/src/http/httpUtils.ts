import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Koplietojami HTTP maršrutu helperi (raw `node:http`, bez Express). Lieto gan
 * `authRoutes` (`/auth/*`), gan `spRewardRoutes` (`/sp/*`), lai loģika nedublējas.
 */

/** Bearer tokens no `Authorization` headera vai `undefined`, ja nav/tukšs. */
export function bearerToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    return token.length > 0 ? token : undefined;
  }
  return undefined;
}

/**
 * Klienta IP rate-limit atslēgai. `X-Forwarded-For` pirmais hops tiek lietots TIKAI
 * tad, ja `trustProxy` ir ieslēgts (serveris aiz uzticama reverse proxy, piem. Caddy/
 * Nginx); citādi headeris ir falsificējams un rate-limit būtu apejams, tāpēc lietojam
 * `socket.remoteAddress` (tiešā savienojuma adrese).
 */
export function clientIp(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0]!.trim();
    }
  }
  return request.socket.remoteAddress ?? "unknown";
}

/** JSON atbilde ar fiksētu Content-Type + `no-store` (auth/sp atbildes nekešo). */
export function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

/** Dev: jebkura localhost/127.0.0.1 izcelsme (jebkurš ports); prod: tikai allowlist. */
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u;

export function isAllowedOrigin(origin: string, origins: readonly string[], dev: boolean): boolean {
  return origins.includes(origin) || (dev && LOCALHOST_ORIGIN.test(origin));
}

export function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  origins: readonly string[],
  dev: boolean
): void {
  const origin = request.headers.origin;
  if (typeof origin === "string" && isAllowedOrigin(origin, origins, dev)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    response.setHeader("Access-Control-Max-Age", "86400");
  }
}
