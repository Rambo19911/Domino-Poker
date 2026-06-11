import type { IncomingMessage, ServerResponse } from "node:http";

import { z } from "zod";

import type { AuthService } from "../auth/AuthService.js";
import { MAX_AVATAR_BYTES, readBinaryBody, readJsonBody } from "./readJsonBody.js";
import { RateLimiter } from "./rateLimiter.js";

/**
 * HTTP auth maršruti uz esošā raw HTTP servera (bez Express). `createAuthHandler`
 * atgriež funkciju, ko `httpServer.ts` izsauc PĒC `/health` un `/metrics`, PIRMS
 * 404. Funkcija atgriež `true`, ja ceļš bija `/auth/*` (apstrādāts), citādi `false`
 * (tad httpServer atbild ar 404). Anonīmā spēle šos maršrutus neizmanto.
 *
 * Drošība: Zod validē visas kravas; rate limiti login/register; CORS allowlist
 * (NE `*`); ģeneriskas login kļūdas (enumerācijas mazināšana); lietotājvārdi tiek
 * renderēti tikai kā teksts (klients) — šeit netiek atdots HTML.
 */

const usernameField = z
  .string()
  .trim()
  .min(3)
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/u);
const passwordField = z.string().min(8).max(200);
const emailField = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/u);

const registerSchema = z.object({
  username: usernameField,
  password: passwordField,
  // E-pasts ir OBLIGĀTS: tas ir vienīgais paroles atjaunošanas kanāls (Fāze 5).
  email: emailField
});
const loginSchema = z.object({
  username: z.string().min(1).max(40),
  password: z.string().min(1).max(200)
});
const profileSchema = z.object({
  username: usernameField,
  avatar: z.string().min(1).max(64)
});
const localeField = z.enum(["lv", "en"]);
const forgotPasswordSchema = z.object({
  email: emailField,
  locale: localeField.optional()
});
const resetPasswordSchema = z.object({
  token: z.string().min(1).max(256),
  password: passwordField
});

export interface AuthRoutesOptions {
  readonly auth: AuthService;
  /** Atļauto izcelšu (Origin) saraksts CORS — NEKAD `*`. No `config.webOrigins`. */
  readonly webOrigins: readonly string[];
  readonly clock: () => number;
  /**
   * Dev režīmā (NODE_ENV != production) atspoguļo jebkuru localhost/127.0.0.1
   * izcelsmi neatkarīgi no porta, lai lokālā izstrāde (piem. `.bat` palaiž web uz
   * `127.0.0.1:3000`) strādātu bez WEB_ORIGIN konfigurēšanas. Prod paliek strikts.
   */
  readonly dev: boolean;
  /**
   * Vai uzticēties `X-Forwarded-For` rate-limit IP atvasināšanai (no `config.trustProxy`).
   * Ieslēgt TIKAI aiz uzticama reverse proxy; citādi header ir falsificējams.
   */
  readonly trustProxy: boolean;
}

export type AuthHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<boolean>;

export function createAuthHandler(options: AuthRoutesOptions): AuthHandler {
  // Login: 20/5min uz IP + 5/15min uz lietotājvārdu; register: 5/h uz IP.
  const loginIpLimiter = new RateLimiter(20, 5 * 60_000, options.clock);
  const loginUserLimiter = new RateLimiter(5, 15 * 60_000, options.clock);
  const registerLimiter = new RateLimiter(5, 60 * 60_000, options.clock);
  // Paroles atjaunošana: 10/15min uz IP + 3/h uz e-pastu; reset: 10/15min uz IP.
  const forgotIpLimiter = new RateLimiter(10, 15 * 60_000, options.clock);
  const forgotEmailLimiter = new RateLimiter(3, 60 * 60_000, options.clock);
  const resetIpLimiter = new RateLimiter(10, 15 * 60_000, options.clock);
  // Avatara augšupielāde: 10/15min uz IP.
  const avatarLimiter = new RateLimiter(10, 15 * 60_000, options.clock);

  return async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/auth/")) {
      return false;
    }
    applyCors(request, response, options.webOrigins, options.dev);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return true;
    }

    try {
      if (request.method === "POST" && path === "/auth/register") {
        await handleRegister(request, response, options.auth, registerLimiter, options.trustProxy);
      } else if (request.method === "POST" && path === "/auth/login") {
        await handleLogin(
          request,
          response,
          options.auth,
          loginIpLimiter,
          loginUserLimiter,
          options.trustProxy
        );
      } else if (request.method === "GET" && path === "/auth/me") {
        await handleMe(request, response, options.auth);
      } else if (request.method === "PATCH" && path === "/auth/me") {
        await handleUpdateProfile(request, response, options.auth);
      } else if (request.method === "POST" && path === "/auth/logout") {
        await handleLogout(request, response, options.auth);
      } else if (request.method === "POST" && path === "/auth/forgot-password") {
        await handleForgotPassword(
          request,
          response,
          options.auth,
          forgotIpLimiter,
          forgotEmailLimiter,
          options.trustProxy
        );
      } else if (request.method === "POST" && path === "/auth/reset-password") {
        await handleResetPassword(request, response, options.auth, resetIpLimiter, options.trustProxy);
      } else if (request.method === "POST" && path === "/auth/avatar") {
        await handleAvatarUpload(request, response, options.auth, avatarLimiter, options.trustProxy);
      } else if (request.method === "GET" && path.startsWith("/auth/avatar/")) {
        await handleAvatarFetch(response, options.auth, path.slice("/auth/avatar/".length));
      } else {
        writeJson(response, 404, { error: "not_found" });
      }
    } catch (error) {
      console.error("[auth] route error:", error);
      if (!response.headersSent) {
        writeJson(response, 500, { error: "internal_error" });
      }
    }
    return true;
  };
}

async function handleRegister(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService,
  limiter: RateLimiter,
  trustProxy: boolean
): Promise<void> {
  if (!limiter.check(clientIp(request, trustProxy))) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
    return;
  }
  const parsed = registerSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const result = await auth.register(parsed.data);
  if (!result.ok) {
    writeJson(response, 409, { error: result.error });
    return;
  }
  writeJson(response, 200, { token: result.token, user: result.user });
}

async function handleLogin(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService,
  ipLimiter: RateLimiter,
  userLimiter: RateLimiter,
  trustProxy: boolean
): Promise<void> {
  if (!ipLimiter.check(clientIp(request, trustProxy))) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
    return;
  }
  const parsed = loginSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  if (!userLimiter.check(parsed.data.username.trim().toLowerCase())) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const result = await auth.login(parsed.data);
  if (!result.ok) {
    writeJson(response, 401, { error: "invalid_credentials" });
    return;
  }
  writeJson(response, 200, { token: result.token, user: result.user });
}

async function handleMe(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService
): Promise<void> {
  const token = bearerToken(request);
  const user = token ? await auth.resolveToken(token) : undefined;
  if (!user) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }
  const stats = await auth.getStats(user.id);
  writeJson(response, 200, { user, stats: stats ?? null });
}

async function handleUpdateProfile(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService
): Promise<void> {
  const token = bearerToken(request);
  const user = token ? await auth.resolveToken(token) : undefined;
  if (!user) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
    return;
  }
  const parsed = profileSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const result = await auth.updateProfile(user.id, parsed.data);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "username_taken" ? 409 : 400;
    writeJson(response, status, { error: result.error });
    return;
  }
  writeJson(response, 200, { user: result.user });
}

async function handleLogout(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService
): Promise<void> {
  const token = bearerToken(request);
  if (token) {
    await auth.logout(token);
  }
  writeJson(response, 200, { ok: true });
}

async function handleForgotPassword(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService,
  ipLimiter: RateLimiter,
  emailLimiter: RateLimiter,
  trustProxy: boolean
): Promise<void> {
  // Ja funkcija nav konfigurēta (nav e-pasta sendera) → 503; klients UI to slēpj.
  if (!auth.isPasswordResetEnabled()) {
    writeJson(response, 503, { error: "unavailable" });
    return;
  }
  if (!ipLimiter.check(clientIp(request, trustProxy))) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
    return;
  }
  const parsed = forgotPasswordSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  if (!emailLimiter.check(parsed.data.email.trim().toLowerCase())) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  await auth.requestPasswordReset(parsed.data.email, parsed.data.locale ?? "lv");
  // VIENMĒR ģenerisks OK neatkarīgi no konta esamības (enumeration novēršana).
  writeJson(response, 200, { ok: true });
}

async function handleResetPassword(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService,
  ipLimiter: RateLimiter,
  trustProxy: boolean
): Promise<void> {
  if (!auth.isPasswordResetEnabled()) {
    writeJson(response, 503, { error: "unavailable" });
    return;
  }
  if (!ipLimiter.check(clientIp(request, trustProxy))) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
    return;
  }
  const parsed = resetPasswordSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const ok = await auth.resetPassword(parsed.data.token, parsed.data.password);
  if (!ok) {
    writeJson(response, 400, { error: "invalid_token" });
    return;
  }
  writeJson(response, 200, { ok: true });
}

/**
 * Magic-byte sniff: pieņemam TIKAI WebP (RIFF....WEBP) vai JPEG (FFD8FF) — klients
 * vienmēr ģenerē WebP (fallback JPEG). NEpaļaujamies uz klienta Content-Type.
 */
function sniffImageType(bytes: Buffer): "image/webp" | "image/jpeg" | undefined {
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return undefined;
}

async function handleAvatarUpload(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService,
  limiter: RateLimiter,
  trustProxy: boolean
): Promise<void> {
  // Tikai autentificēts lietotājs maina SAVU avataru (identitāte no tokena).
  const token = bearerToken(request);
  const user = token === undefined ? undefined : await auth.resolveToken(token);
  if (!user) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }
  if (!limiter.check(clientIp(request, trustProxy))) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readBinaryBody(request, MAX_AVATAR_BYTES);
  if (!body.ok) {
    writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
    return;
  }
  const contentType = sniffImageType(body.bytes);
  if (contentType === undefined) {
    writeJson(response, 400, { error: "invalid_image" });
    return;
  }
  const avatarVersion = await auth.setAvatarUpload(user.id, contentType, body.bytes);
  writeJson(response, 200, { user: { ...user, avatar: "custom", avatarVersion } });
}

async function handleAvatarFetch(
  response: ServerResponse,
  auth: AuthService,
  rawUserId: string
): Promise<void> {
  let userId: string;
  try {
    userId = decodeURIComponent(rawUserId);
  } catch {
    // Bojāta procentu-kodēšana (`%`) — 404, nevis 500 (decodeURIComponent met).
    writeJson(response, 404, { error: "not_found" });
    return;
  }
  if (userId.length === 0 || userId.length > 64) {
    writeJson(response, 404, { error: "not_found" });
    return;
  }
  const avatar = await auth.getAvatarUpload(userId);
  if (!avatar) {
    writeJson(response, 404, { error: "not_found" });
    return;
  }
  // Fiksēts Content-Type + nosniff (anti-polyglot/XSS); immutable cache + ?v= klientā.
  response.writeHead(200, {
    "content-type": avatar.contentType === "image/jpeg" ? "image/jpeg" : "image/webp",
    "x-content-type-options": "nosniff",
    "cache-control": "public, max-age=31536000, immutable",
    "content-length": String(avatar.bytes.length)
  });
  response.end(Buffer.from(avatar.bytes));
}

/** Dev: jebkura localhost/127.0.0.1 izcelsme (jebkurš ports); prod: tikai allowlist. */
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/u;

function isAllowedOrigin(origin: string, origins: readonly string[], dev: boolean): boolean {
  return origins.includes(origin) || (dev && LOCALHOST_ORIGIN.test(origin));
}

function applyCors(
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

function bearerToken(request: IncomingMessage): string | undefined {
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
function clientIp(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0]!.trim();
    }
  }
  return request.socket.remoteAddress ?? "unknown";
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}
