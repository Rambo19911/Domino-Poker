import type { IncomingMessage, ServerResponse } from "node:http";

import { DAILY_TASKS } from "@domino-poker/shared";
import { z } from "zod";

import type { AuthService } from "../auth/AuthService.js";
import type { DailyTaskService } from "../daily/DailyTaskService.js";
import { applyCors, bearerToken, writeJson } from "./httpUtils.js";
import { readJsonBody } from "./readJsonBody.js";
import { RateLimiter } from "./rateLimiter.js";

/**
 * Dienas uzdevumu HTTP maršruti (sk. `docs/TODO/daily-tasks-plan.md`). Auth obligāts —
 * anonīmie spēlē, bet dienas uzdevumi tiem nav (401). Serveris ir autoritatīvs: progress
 * atvasināts, sliekšņi + summas no `DAILY_TASKS` kataloga (klients tos nesūta). Ķēdē PIRMS
 * auth handlera (kā `/sp`, `/stats`, `/store`); prod vajag Caddy `reverse_proxy /daily/*`.
 */

// Robežas validācija: taskId jābūt kataloga id.
const taskIds = DAILY_TASKS.map((t) => t.id) as [string, ...string[]];
const claimSchema = z.object({ taskId: z.enum(taskIds) });

export type DailyTaskHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<boolean>;

export interface DailyTaskRoutesOptions {
  readonly auth: AuthService;
  readonly daily: DailyTaskService;
  readonly webOrigins: readonly string[];
  readonly clock: () => number;
  readonly dev: boolean;
}

export function createDailyTaskHandler(options: DailyTaskRoutesOptions): DailyTaskHandler {
  // Uz lietotāju: get bieži (lobija fetch + pēc katras SP spēles), claim retāk.
  const getLimiter = new RateLimiter(120, 60 * 60 * 1000, options.clock);
  const claimLimiter = new RateLimiter(30, 60 * 60 * 1000, options.clock);

  return async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/daily/")) {
      return false;
    }
    applyCors(request, response, options.webOrigins, options.dev);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return true;
    }

    try {
      if (request.method === "GET" && path === "/daily/tasks") {
        await handleGet(request, response, options, getLimiter);
      } else if (request.method === "POST" && path === "/daily/tasks/claim") {
        await handleClaim(request, response, options, claimLimiter);
      } else {
        writeJson(response, 404, { error: "not_found" });
      }
    } catch (error) {
      console.error("[daily] route error:", error);
      if (!response.headersSent) {
        writeJson(response, 500, { error: "internal_error" });
      }
    }
    return true;
  };
}

async function handleGet(
  request: IncomingMessage,
  response: ServerResponse,
  options: DailyTaskRoutesOptions,
  limiter: RateLimiter
): Promise<void> {
  const token = bearerToken(request);
  const user = token ? await options.auth.resolveToken(token) : undefined;
  if (!user) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }
  if (!limiter.check(user.id)) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const state = await options.daily.getState(user.id, options.clock());
  writeJson(response, 200, state);
}

async function handleClaim(
  request: IncomingMessage,
  response: ServerResponse,
  options: DailyTaskRoutesOptions,
  limiter: RateLimiter
): Promise<void> {
  const token = bearerToken(request);
  const user = token ? await options.auth.resolveToken(token) : undefined;
  if (!user) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }
  if (!limiter.check(user.id)) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
    return;
  }
  const parsed = claimSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }

  const result = await options.daily.claim(user.id, parsed.data.taskId, options.clock());
  if (result.ok) {
    writeJson(response, 200, {
      awarded: result.awarded,
      balance: result.balance,
      alreadyClaimed: result.alreadyClaimed,
      state: result.state
    });
    return;
  }
  // unknown_task → 400 (nesasniedzams caur enum, bet defensīvi); locked/not_met → 409.
  writeJson(response, result.reason === "unknown_task" ? 400 : 409, { error: result.reason });
}
