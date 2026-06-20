import type { IncomingMessage, ServerResponse } from "node:http";

import { SP_REWARDS } from "@domino-poker/shared";
import { z } from "zod";

import type { AuthService } from "../auth/AuthService.js";
import type { SpRewardTokens } from "../sp/SpRewardTokens.js";
import type { WalletService } from "../wallet/WalletService.js";
import { applyCors, bearerToken, writeJson } from "./httpUtils.js";
import { readJsonBody } from "./readJsonBody.js";
import { RateLimiter } from "./rateLimiter.js";

/**
 * SP balvas HTTP maršruti (Fāze 2, D3 anti-cheat). SP spēle notiek pārlūkā, tāpēc
 * serveris nevar verificēt rezultātu; aizsardzība ir slāņota:
 *   1) auth obligāts (anonīmie spēlē, bet nesaņem neko);
 *   2) `/sp/start` izsniedz vienreizēju tokenu, kas momentuzņem grūtību (balva no
 *      tokena, NE no klienta → nevar sākt medium un pieprasīt epic);
 *   3) `/sp/reward` pieņem TIKAI derīgu, neizmantotu tokenu + min spēles ilgumu;
 *   4) rate-limit uz lietotāju; 5) dienas monētu griesti (DB ledger summa).
 * Atlikušais risks: klients joprojām paziņo `placement` (pieņemts, D3).
 */

/** Minimālais spēles ilgums (s) balvai — bloķē momentānu start→reward bez spēlēšanas. */
const SP_REWARD_MIN_GAME_SECONDS = 5;
/** Maks. SP balvās nopelnāmais dienā (24h) uz kontu — kaitējuma griesti. */
const SP_DAILY_COIN_CAP = 3000;

const startSchema = z.object({ difficulty: z.enum(["medium", "hard", "epic"]) });
const rewardSchema = z.object({
  gameToken: z.string().min(1).max(64),
  placement: z.union([z.literal(1), z.literal(2)])
});

export type SpRewardHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<boolean>;

export interface SpRewardRoutesOptions {
  readonly auth: AuthService;
  readonly wallet: WalletService;
  readonly tokens: SpRewardTokens;
  readonly webOrigins: readonly string[];
  readonly clock: () => number;
  readonly dev: boolean;
}

export function createSpRewardHandler(options: SpRewardRoutesOptions): SpRewardHandler {
  // Uz lietotāju: start 20/h (spēles sākas reti), reward 10/h.
  const startLimiter = new RateLimiter(20, 60 * 60 * 1000, options.clock);
  const rewardLimiter = new RateLimiter(10, 60 * 60 * 1000, options.clock);

  return async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/sp/")) {
      return false;
    }
    applyCors(request, response, options.webOrigins, options.dev);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return true;
    }

    try {
      if (request.method === "POST" && path === "/sp/start") {
        await handleStart(request, response, options, startLimiter);
      } else if (request.method === "POST" && path === "/sp/reward") {
        await handleReward(request, response, options, rewardLimiter);
      } else {
        writeJson(response, 404, { error: "not_found" });
      }
    } catch (error) {
      console.error("[sp] route error:", error);
      if (!response.headersSent) {
        writeJson(response, 500, { error: "internal_error" });
      }
    }
    return true;
  };
}

async function handleStart(
  request: IncomingMessage,
  response: ServerResponse,
  options: SpRewardRoutesOptions,
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
  const parsed = startSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const gameToken = options.tokens.issue(user.id, parsed.data.difficulty);
  writeJson(response, 200, { gameToken });
}

async function handleReward(
  request: IncomingMessage,
  response: ServerResponse,
  options: SpRewardRoutesOptions,
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
  const parsed = rewardSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }

  const claimed = options.tokens.consume(parsed.data.gameToken, user.id);
  if (!claimed) {
    // Nederīgs / izmantots / izbeidzies / cita lietotāja tokens.
    writeJson(response, 409, { error: "invalid_token" });
    return;
  }

  const now = options.clock();
  // Pārāk ātri (start→reward bez reālas spēles) → graciozi bez balvas (token jau patērēts).
  if (now - claimed.issuedAt < SP_REWARD_MIN_GAME_SECONDS * 1000) {
    writeJson(response, 200, { awarded: 0, balance: await options.wallet.getBalance(user.id) });
    return;
  }

  // Balva no TOKENA grūtības + HARD dienas griesti (clamp uz atlikušo, atomiski uz
  // lietotāju) — kopsumma 24h nekad nepārsniedz griestus, arī pie vienlaicīgām spēlēm.
  const reward = SP_REWARDS[claimed.difficulty];
  const { awarded, balance } = await options.wallet.creditSpRewardCapped(
    user.id,
    parsed.data.gameToken,
    reward,
    SP_DAILY_COIN_CAP,
    now
  );
  writeJson(response, 200, { awarded, balance });
}

export { SP_REWARD_MIN_GAME_SECONDS, SP_DAILY_COIN_CAP };
