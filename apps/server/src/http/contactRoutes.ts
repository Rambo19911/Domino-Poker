import type { IncomingMessage, ServerResponse } from "node:http";

import { z } from "zod";

import type { EmailSender } from "../auth/EmailSender.js";
import { applyCors, clientIp, writeJson } from "./httpUtils.js";
import { readJsonBody } from "./readJsonBody.js";
import { RateLimiter } from "./rateLimiter.js";

/**
 * Kontaktformas HTTP maršruts (`POST /contact`). Jebkurš apmeklētājs (NEvajag kontu)
 * var nosūtīt ziņu īpašniekam; ziņa aiziet caur `EmailSender` (Resend prod / console
 * dev) uz `CONTACT_EMAIL` adresi ar `reply_to` = autora e-pasts. Aizsardzība:
 *   1) IP rate-limit (anti-spam, jo nav auth);
 *   2) izmēra ierobežots ķermenis (DoS);
 *   3) stingra zod validācija (e-pasta formāts + ziņas garums).
 * Maršruts ir mounted TIKAI tad, ja serverim ir e-pasta senderis (tāpat kā paroles
 * atjaunošana) — citādi 404, un klients to apstrādā graciozi.
 */

/** Ziņas garuma robežas (rakstzīmēs). */
const CONTACT_MIN_MESSAGE = 10;
const CONTACT_MAX_MESSAGE = 2000;
/** Ķermeņa izmēra griesti — pietiek 2000 rakstzīmju ziņai + e-pastam + lokālei. */
const CONTACT_BODY_BYTES = 8 * 1024;
/** Uz IP: 5 ziņas stundā (anti-spam; e-pasti reti). */
const CONTACT_RATE_LIMIT = 5;
const CONTACT_RATE_WINDOW_MS = 60 * 60 * 1000;

// E-pasta formāts — tāds pats idioms kā `authRoutes` (regex, NE deprecated `.email()`).
const contactSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3)
    .max(254)
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u),
  message: z.string().trim().min(CONTACT_MIN_MESSAGE).max(CONTACT_MAX_MESSAGE),
  locale: z.enum(["lv", "en"]).default("lv")
});

export type ContactHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<boolean>;

export interface ContactRoutesOptions {
  readonly email: EmailSender;
  /** Saņēmēja adrese (`CONTACT_EMAIL`; īpašnieks). */
  readonly to: string;
  readonly webOrigins: readonly string[];
  readonly clock: () => number;
  readonly dev: boolean;
  readonly trustProxy: boolean;
}

export function createContactHandler(options: ContactRoutesOptions): ContactHandler {
  const limiter = new RateLimiter(CONTACT_RATE_LIMIT, CONTACT_RATE_WINDOW_MS, options.clock);

  return async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path !== "/contact") {
      return false;
    }
    applyCors(request, response, options.webOrigins, options.dev);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return true;
    }
    if (request.method !== "POST") {
      writeJson(response, 405, { error: "method_not_allowed" });
      return true;
    }

    try {
      const ip = clientIp(request, options.trustProxy);
      if (!limiter.check(ip)) {
        writeJson(response, 429, { error: "rate_limited" });
        return true;
      }

      const body = await readJsonBody(request, CONTACT_BODY_BYTES);
      if (!body.ok) {
        writeJson(response, body.status, {
          error: body.status === 413 ? "too_large" : "invalid_input"
        });
        return true;
      }
      const parsed = contactSchema.safeParse(body.value);
      if (!parsed.success) {
        writeJson(response, 400, { error: "invalid_input" });
        return true;
      }

      await options.email.sendContactMessage(
        options.to,
        parsed.data.email,
        parsed.data.message,
        parsed.data.locale
      );
      writeJson(response, 200, { ok: true });
    } catch (error) {
      // Piegādes kļūme (piem. Resend nepieejams) → 502 (NE klusa veiksme).
      console.error("[contact] route error:", error);
      if (!response.headersSent) {
        writeJson(response, 502, { error: "send_failed" });
      }
    }
    return true;
  };
}

export { CONTACT_MIN_MESSAGE, CONTACT_MAX_MESSAGE };
