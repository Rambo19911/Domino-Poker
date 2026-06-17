import type { IncomingMessage, ServerResponse } from "node:http";

import { z } from "zod";

import { MAX_BODY_BYTES, readJsonBody } from "../http/readJsonBody.js";
import { RateLimiter } from "../http/rateLimiter.js";
import type { ChatTranslationService } from "./ChatTranslationService.js";

const CHAT_TRANSLATE_PATH = "/chat/translate";
const CHAT_TRANSLATE_MAX_BODY_BYTES = MAX_BODY_BYTES;
const CHAT_TRANSLATE_MAX_TEXT_LENGTH = 200;
const languageTag = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/u;

const translateSchema = z.object({
  text: z.string().trim().min(1).max(CHAT_TRANSLATE_MAX_TEXT_LENGTH),
  targetLanguage: z.string().trim().min(2).max(35).regex(languageTag)
});

export type ChatTranslateHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<boolean>;

export interface ChatTranslateRoutesOptions {
  readonly translation: ChatTranslationService;
  readonly webOrigins: readonly string[];
  readonly dev: boolean;
  readonly trustProxy: boolean;
  readonly clock: () => number;
  readonly rateLimitPerMinute: number;
}

export function createChatTranslateHandler(options: ChatTranslateRoutesOptions): ChatTranslateHandler {
  const limiter = new RateLimiter(options.rateLimitPerMinute, 60_000, options.clock);

  return async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path !== CHAT_TRANSLATE_PATH) {
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
    if (!limiter.check(clientIp(request, options.trustProxy))) {
      writeJson(response, 429, { error: "rate_limited" });
      return true;
    }

    const body = await readJsonBody(request, CHAT_TRANSLATE_MAX_BODY_BYTES);
    if (!body.ok) {
      writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
      return true;
    }

    const parsed = translateSchema.safeParse(body.value);
    if (!parsed.success) {
      writeJson(response, 400, { error: "invalid_input" });
      return true;
    }

    try {
      const result = await options.translation.translate({
        text: parsed.data.text,
        targetLanguage: normalizeLanguageTag(parsed.data.targetLanguage)
      });
      if (!result.ok) {
        writeJson(response, 429, { error: result.error });
        return true;
      }
      writeJson(response, 200, {
        translatedText: result.translation.translatedText,
        targetLanguage: normalizeLanguageTag(parsed.data.targetLanguage),
        detectedSourceLanguage: result.translation.detectedSourceLanguage ?? null
      });
    } catch (error) {
      console.error("[chat-translate] provider failed:", error);
      writeJson(response, 502, { error: "translation_failed" });
    }

    return true;
  };
}

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u;

function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  origins: readonly string[],
  dev: boolean
): void {
  const origin = request.headers.origin;
  if (typeof origin === "string" && (origins.includes(origin) || (dev && LOCALHOST_ORIGIN.test(origin)))) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    response.setHeader("Access-Control-Max-Age", "86400");
  }
}

function clientIp(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0]!.trim();
    }
  }
  return request.socket.remoteAddress ?? "unknown";
}

function normalizeLanguageTag(value: string): string {
  return value
    .split("-")
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (part.length === 4) return part[0]!.toUpperCase() + part.slice(1).toLowerCase();
      if (part.length === 2 || /^\d{3}$/u.test(part)) return part.toUpperCase();
      return part.toLowerCase();
    })
    .join("-");
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}
