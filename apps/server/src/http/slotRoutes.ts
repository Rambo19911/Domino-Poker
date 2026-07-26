import type { IncomingMessage, ServerResponse } from "node:http";

import { SLOT_MATH_CONFIG, type LineBet } from "@domino-poker/core/slots";
import { z } from "zod";

import type { AuthService } from "../auth/AuthService.js";
import type { SlotService } from "../slots/SlotService.js";
import { applyCors, bearerToken, writeJson } from "./httpUtils.js";
import { readJsonBody } from "./readJsonBody.js";
import { RateLimiter } from "./rateLimiter.js";

/**
 * Domino Slots HTTP maršruti (sk. `docs/TODO/domino-slots-integration-plan.md`). Auth
 * obligāts — anonīmie slotus nespēlē (401).
 *
 * UZTICĪBAS ROBEŽA: klients sūta TIKAI `spinId` un `lineBet`. Režģi, laimestu un summas
 * ģenerē serveris; jebkurš cits lauks korpusā tiek klusi ignorēts. `lineBet` tiek
 * validēts pret `SLOT_MATH_CONFIG.lineBetSteps` PIRMS evaluatora izsaukuma — neatļauta
 * likme radītu daļskaitļa monētas un mestu izpildlaikā (sk. `betScale.test.ts`).
 *
 * Ķēdē PIRMS auth handlera (kā `/daily`, `/store`); prod vajag Caddy `reverse_proxy /slots/*`.
 */

// Robežas validācija. Likmju kopa nāk no TĀ PAŠA avota, ko lieto evaluators.
const LINE_BETS: ReadonlySet<number> = new Set(SLOT_MATH_CONFIG.lineBetSteps);
const spinSchema = z
  .object({
    /** Klienta ģenerēts UUID; idempotences atslēga kopā ar lietotāju. */
    spinId: z.string().uuid(),
    lineBet: z
      .number()
      .int()
      .refine((value) => LINE_BETS.has(value), { message: "unsupported line bet" })
  })
  // STRICT ar nodomu: naudas galapunktam līgums ir tieši divi lauki. Nezināms lauks
  // (piem. klienta sūtīts `payout` vai `userId`) ir vai nu uzbrukums, vai novecojis
  // klients — abos gadījumos labāk skaļš 400 nekā klusa ignorēšana.
  .strict();

export type SlotHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<boolean>;

export interface SlotRoutesOptions {
  readonly auth: AuthService;
  readonly slots: SlotService;
  readonly webOrigins: readonly string[];
  readonly clock: () => number;
  readonly dev: boolean;
}

export function createSlotHandler(options: SlotRoutesOptions): SlotHandler {
  // Auto Spin izsauc līdz 100 griezieniem pēc kārtas, katru kā atsevišķu pieprasījumu,
  // tāpēc griesti ir krietni augstāki nekā citiem monētu maršrutiem (D4 plānā).
  const spinLimiter = new RateLimiter(600, 60 * 60 * 1000, options.clock);

  return async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/slots/")) {
      return false;
    }
    applyCors(request, response, options.webOrigins, options.dev);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return true;
    }

    try {
      if (request.method === "POST" && path === "/slots/spin") {
        await handleSpin(request, response, options, spinLimiter);
      } else {
        writeJson(response, 404, { error: "not_found" });
      }
    } catch (error) {
      console.error("[slots] route error:", error);
      if (!response.headersSent) {
        writeJson(response, 500, { error: "internal_error" });
      }
    }
    return true;
  };
}

async function handleSpin(
  request: IncomingMessage,
  response: ServerResponse,
  options: SlotRoutesOptions,
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
  const parsed = spinSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }

  // `user.id` nāk no tokena, NEKAD no korpusa — citādi viens konts spēlētu ar cita naudu.
  const result = await options.slots.spin(
    user.id,
    parsed.data.spinId,
    parsed.data.lineBet as LineBet
  );
  if (result.ok) {
    writeJson(response, 200, {
      applied: result.applied,
      balance: result.balance,
      spin: result.spin
    });
    return;
  }
  if (result.reason === "insufficient") {
    // 402 = iedibinātais "nepietiek monētu" kods (sk. `storeRoutes.ts`).
    writeJson(response, 402, { error: "insufficient_coins", balance: result.balance });
    return;
  }
  // Glabātuve neatbalsta slotus — maršruts nemaz nebūtu jāreģistrē, tāpēc defensīvi.
  writeJson(response, 503, { error: "unavailable" });
}
