import type { IncomingMessage, ServerResponse } from "node:http";

import { GAME_LANGUAGES } from "@domino-poker/shared";
import { z } from "zod";

import { emailField, passwordField, usernameField } from "../auth/authFields.js";
import type { AuthService, BanInfo } from "../auth/AuthService.js";
import type { LeaderboardService } from "../leaderboard/LeaderboardService.js";
import type { WalletService } from "../wallet/WalletService.js";
import { applyCors, bearerToken, clientIp, writeJson } from "./httpUtils.js";
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

// Konta lauku shēmas (username/email/password) dzīvo `auth/authFields.ts` — viens avots,
// koplietots ar admin paneļa konta rediģēšanu (Fāze 2.1), lai noteikumi neizšķirtos.

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
const languageSchema = z.object({ language: z.enum(GAME_LANGUAGES) });

export interface AuthRoutesOptions {
  readonly auth: AuthService;
  /**
   * Globālā Leaderboard serviss (Leaderboard fāze). Ja `undefined`, leaderboard
   * maršruts atbild 503 (funkcija nav konfigurēta). Konstruēts kopā ar `auth`.
   */
  readonly leaderboard?: LeaderboardService | undefined;
  /**
   * Zelta monētu maks (Fāze 0). Ja `undefined` (glabātuve neatbalsta), bilance
   * netiek atgriezta `/auth/me` un starta bonuss netiek piešķirts.
   */
  readonly wallet?: WalletService | undefined;
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
  /**
   * Opcionāls login mēģinājuma reģistrētājs (admin-panel-plan.md, Fāze 0.4). Izsaukts
   * pēc katra `/auth/login` (veiksme + neveiksme) ar IP/lietotājvārdu/iznākumu. Fire-and-
   * forget (kļūda nedrīkst lauzt login). Injicē `index.ts`, ja glabātuve atbalsta admin.
   */
  readonly onLoginAttempt?: ((attempt: LoginAttemptInfo) => void) | undefined;
  /**
   * Opcionāla IP-bana pārbaude (Fāze 3.1, D1). Izsaukta login SĀKUMĀ (ir IP) → banots IP
   * saņem 403 pirms paroles apstrādes. Konta (user) banu pārbauda `AuthService.login`
   * (pirms token izdošanas). Injicē `index.ts`, ja bani konfigurēti.
   */
  readonly isIpBanned?: ((ip: string) => Promise<BanInfo | undefined>) | undefined;
}

/** Viena login mēģinājuma fakts audita reģistrēšanai (`login_attempts`). */
export interface LoginAttemptInfo {
  readonly usernameTried: string;
  readonly userId?: string | undefined;
  readonly ip: string;
  /** User-agent (D4 platformas segmentācijai); `undefined`, ja nav. */
  readonly userAgent?: string | undefined;
  readonly success: boolean;
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
  // Leaderboard (publisks lasāmais): 100/15min uz IP (pret scraping; dāsns pārlūkam).
  const leaderboardLimiter = new RateLimiter(100, 15 * 60_000, options.clock);
  // Valodas maiņa (autentificēta, reta): 30/15min uz IP.
  const languageLimiter = new RateLimiter(30, 15 * 60_000, options.clock);

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
        await handleRegister(
          request,
          response,
          options.auth,
          options.wallet,
          registerLimiter,
          options.trustProxy
        );
      } else if (request.method === "POST" && path === "/auth/login") {
        await handleLogin(
          request,
          response,
          options.auth,
          loginIpLimiter,
          loginUserLimiter,
          options.trustProxy,
          options.onLoginAttempt,
          options.isIpBanned
        );
      } else if (request.method === "GET" && path === "/auth/me") {
        await handleMe(request, response, options.auth, options.leaderboard, options.wallet);
      } else if (request.method === "PATCH" && path === "/auth/me/language") {
        await handleSetLanguage(
          request,
          response,
          options.auth,
          options.leaderboard,
          languageLimiter,
          options.trustProxy
        );
      } else if (request.method === "PATCH" && path === "/auth/me") {
        await handleUpdateProfile(request, response, options.auth);
      } else if (request.method === "GET" && path === "/auth/leaderboard") {
        await handleLeaderboard(
          request,
          response,
          options.auth,
          options.leaderboard,
          leaderboardLimiter,
          options.trustProxy
        );
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
  wallet: WalletService | undefined,
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
  // Starta bonuss (Fāze 0): idempotenti piešķir 5000 monētas pēc reģistrācijas.
  // (repair-on-read `getBalance` to atkārtoti nodrošina pirmajā bilances lasījumā.)
  if (wallet) {
    await wallet.grantSignupBonus(result.user.id);
  }
  writeJson(response, 200, { token: result.token, user: result.user });
}

async function handleLogin(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService,
  ipLimiter: RateLimiter,
  userLimiter: RateLimiter,
  trustProxy: boolean,
  onLoginAttempt: ((attempt: LoginAttemptInfo) => void) | undefined,
  isIpBanned: ((ip: string) => Promise<BanInfo | undefined>) | undefined
): Promise<void> {
  const ip = clientIp(request, trustProxy);
  if (!ipLimiter.check(ip)) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  // IP-bans (Fāze 3.1, D1): banots IP → 403 pirms paroles apstrādes.
  if (isIpBanned) {
    const ipBan = await isIpBanned(ip);
    if (ipBan) {
      writeJson(response, 403, banPayload(ipBan));
      return;
    }
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
  // Login mēģinājuma audits (veiksme + neveiksme); fire-and-forget (sk. LoginAttemptInfo).
  const userAgent =
    typeof request.headers["user-agent"] === "string"
      ? request.headers["user-agent"].slice(0, 256)
      : undefined;
  onLoginAttempt?.({
    usernameTried: parsed.data.username.trim(),
    // Veiksmē → pieslēgtā lietotāja id; neveiksmē → mēģinātā konta id, JA lietotājvārds
    // eksistēja (citādi undefined). Tā "pareizs username, nepareiza parole" mēģinājumi
    // parādās konkrētā spēlētāja login vēsturē (aizdomīguma signāls, Fāze 1.3).
    userId: result.ok ? result.user.id : result.userId,
    ip,
    userAgent,
    success: result.ok
  });
  if (!result.ok) {
    if (result.error === "banned") {
      // Banots konts (parole bija pareiza) → 403 ar iemeslu/ilgumu; tokens NETIKA izsniegts.
      writeJson(response, 403, banPayload(result.ban));
      return;
    }
    writeJson(response, 401, { error: "invalid_credentials" });
    return;
  }
  // ATKĀRTOTA IP-bana pārbaude pēc veiksmes (Codex): ja IP tika banots STARP sākotnējo pārbaudi
  // un token izdošanu, atsaucam tikko izdoto tokenu un atbildam 403 (aizver IP-ban↔login sacensību).
  if (isIpBanned) {
    const ipBan = await isIpBanned(ip);
    if (ipBan) {
      await auth.logout(result.token);
      writeJson(response, 403, banPayload(ipBan));
      return;
    }
  }
  writeJson(response, 200, { token: result.token, user: result.user });
}

/** Bana 403 atbildes ķermenis (iemesls + ilgums + beigu laiks; nav noslēpumu). */
function banPayload(ban: BanInfo): {
  error: "banned";
  reason: string;
  durationLabel: string;
  until: number | null;
} {
  return {
    error: "banned",
    reason: ban.reason,
    durationLabel: ban.durationLabel,
    until: ban.expiresAt ?? null
  };
}

async function handleMe(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService,
  leaderboard: LeaderboardService | undefined,
  wallet: WalletService | undefined
): Promise<void> {
  const token = bearerToken(request);
  const user = token ? await auth.resolveToken(token) : undefined;
  if (!user) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }
  // rankBadge (Leaderboard fāze): globālā ranga emblēma main-lobby profilam; `null`,
  // ja ārpus badge-rangiem (71+) vai leaderboard nav konfigurēts.
  // balance (Fāze 0): zelta monētu bilance; `null`, ja maks nav konfigurēts. `getBalance`
  // ir repair-on-read → nodrošina starta bonusu (arī esošo lietotāju backfill).
  const [stats, language, rankBadge, balance] = await Promise.all([
    auth.getStats(user.id),
    auth.getLanguage(user.id),
    leaderboard ? leaderboard.getRankBadgeFor(user.id) : Promise.resolve(null),
    wallet ? wallet.getBalance(user.id) : Promise.resolve(null)
  ]);
  writeJson(response, 200, { user, stats: stats ?? null, language, rankBadge, balance });
}

/**
 * GET /auth/leaderboard?limit=N — publiskais tops (top N + izsaucēja paša stāvoklis).
 * Bearer ir OPCIONĀLS: ja dots un derīgs, `me` atspoguļo izsaucēja vietu; citādi
 * `me = anonymous`. `no-store` (atbilde ir per-user `me` dēļ; servera kešs absorbē
 * DB slodzi). `limit` clamp servisā uz `LEADERBOARD_SIZE`.
 */
async function handleLeaderboard(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService,
  leaderboard: LeaderboardService | undefined,
  limiter: RateLimiter,
  trustProxy: boolean
): Promise<void> {
  if (leaderboard === undefined) {
    writeJson(response, 503, { error: "unavailable" });
    return;
  }
  if (!limiter.check(clientIp(request, trustProxy))) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const token = bearerToken(request);
  const user = token ? await auth.resolveToken(token) : undefined;
  const url = new URL(request.url ?? "/", "http://localhost");
  const rawLimit = Number(url.searchParams.get("limit"));
  // Nederīgs/iztrūkstošs limit → 0; serviss to clamp uz [1, size] (size = noklusējums).
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : Number.MAX_SAFE_INTEGER;
  const body = await leaderboard.getResponse(user?.id ?? null, limit);
  writeJson(response, 200, body);
}

/** PATCH /auth/me/language — autentificēts; saglabā konta spēles valodu (`en`/`lv`). */
async function handleSetLanguage(
  request: IncomingMessage,
  response: ServerResponse,
  auth: AuthService,
  leaderboard: LeaderboardService | undefined,
  limiter: RateLimiter,
  trustProxy: boolean
): Promise<void> {
  const token = bearerToken(request);
  const user = token ? await auth.resolveToken(token) : undefined;
  if (!user) {
    writeJson(response, 401, { error: "unauthorized" });
    return;
  }
  if (!limiter.check(clientIp(request, trustProxy))) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    writeJson(response, body.status, { error: body.status === 413 ? "too_large" : "invalid_input" });
    return;
  }
  const parsed = languageSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  await auth.setLanguage(user.id, parsed.data.language);
  // Invalidē leaderboard kešu, lai valodas kolonna atspoguļojas uzreiz (nākamajā
  // GET /auth/leaderboard), nevis atpaliek līdz TTL (`refreshMs`). Opcionāls.
  leaderboard?.invalidate();
  writeJson(response, 200, { ok: true });
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
