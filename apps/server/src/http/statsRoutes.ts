import type { IncomingMessage, ServerResponse } from "node:http";

import type { AuthService } from "../auth/AuthService.js";
import type { PlayerStatsService } from "../stats/PlayerStatsService.js";
import { applyCors, bearerToken, writeJson } from "./httpUtils.js";
import { RateLimiter } from "./rateLimiter.js";

/**
 * Padziļinātās statistikas lasīšanas maršruts (Fāze 5). `GET /stats` (auth) atgriež
 * komponētu spēlētāja statistiku "Statistika" tabam — lēni ielādēts TIKAI atverot tabu
 * (NE pie katra `/auth/me`). Pieder `PlayerStatsService` (NE auth biznesa loģika).
 * Anonīmie nesaņem (401); statistika ir tikai reģistrētiem.
 */
export type StatsHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<boolean>;

export interface StatsRoutesOptions {
  readonly auth: AuthService;
  readonly stats: PlayerStatsService;
  readonly webOrigins: readonly string[];
  readonly clock: () => number;
  readonly dev: boolean;
}

export function createStatsHandler(options: StatsRoutesOptions): StatsHandler {
  // Lasīšana ir lēta; dāsns limits uz lietotāju (tikai pret ļaunprātīgu spamu).
  const limiter = new RateLimiter(120, 60 * 60 * 1000, options.clock);

  return async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path !== "/stats") {
      return false;
    }
    applyCors(request, response, options.webOrigins, options.dev);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return true;
    }
    if (request.method !== "GET") {
      writeJson(response, 404, { error: "not_found" });
      return true;
    }

    try {
      const token = bearerToken(request);
      const user = token ? await options.auth.resolveToken(token) : undefined;
      if (!user) {
        writeJson(response, 401, { error: "unauthorized" });
        return true;
      }
      if (!limiter.check(user.id)) {
        writeJson(response, 429, { error: "rate_limited" });
        return true;
      }
      const stats = await options.stats.getStats(user.id);
      writeJson(response, 200, stats);
    } catch (error) {
      console.error("[stats] route error:", error);
      if (!response.headersSent) {
        writeJson(response, 500, { error: "internal_error" });
      }
    }
    return true;
  };
}
