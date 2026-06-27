import type { IncomingMessage, ServerResponse } from "node:http";

import { z } from "zod";

import type { AuthService } from "../auth/AuthService.js";
import type { StoreService } from "../store/StoreService.js";
import { applyCors, bearerToken, writeJson } from "./httpUtils.js";
import { readJsonBody } from "./readJsonBody.js";
import { RateLimiter } from "./rateLimiter.js";

/**
 * Veikala HTTP maršruti (Fāze 4): `POST /store/buy` (nopērk preci par monētām) un
 * `GET /store/owned` (piederošo preču saraksts). Auth obligāts (anonīmie nepērk).
 * Serveris ir autoritatīvs: cena no kataloga, debets+īpašums atomiski (`StoreService`).
 * (Prod: vajag Caddy `reverse_proxy /store`, citādi 404.)
 */
const buySchema = z.object({ itemId: z.string().min(1).max(64) });

export type StoreHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<boolean>;

export interface StoreRoutesOptions {
  readonly auth: AuthService;
  readonly store: StoreService;
  readonly webOrigins: readonly string[];
  readonly clock: () => number;
  readonly dev: boolean;
}

export function createStoreHandler(options: StoreRoutesOptions): StoreHandler {
  // Pirkums reti; saraksts biežāk (atver personalizāciju). Limits uz lietotāju (anti-spam).
  const buyLimiter = new RateLimiter(30, 60 * 60 * 1000, options.clock);
  const ownedLimiter = new RateLimiter(120, 60 * 60 * 1000, options.clock);

  return async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/store/")) {
      return false;
    }
    applyCors(request, response, options.webOrigins, options.dev);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return true;
    }

    try {
      if (request.method === "GET" && path === "/store/owned") {
        await handleOwned(request, response, options, ownedLimiter);
      } else if (request.method === "POST" && path === "/store/buy") {
        await handleBuy(request, response, options, buyLimiter);
      } else {
        writeJson(response, 404, { error: "not_found" });
      }
    } catch (error) {
      console.error("[store] route error:", error);
      if (!response.headersSent) {
        writeJson(response, 500, { error: "internal_error" });
      }
    }
    return true;
  };
}

async function handleOwned(
  request: IncomingMessage,
  response: ServerResponse,
  options: StoreRoutesOptions,
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
  const owned = await options.store.listOwned(user.id);
  writeJson(response, 200, { owned });
}

async function handleBuy(
  request: IncomingMessage,
  response: ServerResponse,
  options: StoreRoutesOptions,
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
  const parsed = buySchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }

  const result = await options.store.purchase(user.id, parsed.data.itemId);
  if (!result.ok) {
    if (result.reason === "unknown_item") {
      writeJson(response, 400, { error: "unknown_item" });
      return;
    }
    // Nepietiek monētu → 402 + pašreizējā bilance (UI parāda trūkstošo).
    writeJson(response, 402, { error: "insufficient_coins", balance: result.balance });
    return;
  }
  writeJson(response, 200, {
    owned: true,
    alreadyOwned: result.alreadyOwned,
    balance: result.balance
  });
}
