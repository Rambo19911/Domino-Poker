import type { IncomingMessage, ServerResponse } from "node:http";

import { z } from "zod";

import { clientIp, isAllowedOrigin, writeJson } from "../http/httpUtils.js";
import { readJsonBody } from "../http/readJsonBody.js";
import { RateLimiter } from "../http/rateLimiter.js";
import type { AdminAuthService } from "./AdminAuthService.js";
import type { AdminAuditService } from "./AdminAuditService.js";
import type { AdminPlayerService } from "./AdminPlayerService.js";
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_CSRF_HEADER,
  ADMIN_SESSION_COOKIE,
  parseCookies,
  serializeCookie
} from "./cookies.js";

/**
 * Admin paneļa HTTP maršruti (`/admin/*`, sk. `docs/TODO/admin-panel-plan.md`, Fāze 0).
 * Pilnīgi atsevišķa auth no spēlētājiem: parole + e-pasta OTP 2FA, sesija sīkdatnē
 * (`HttpOnly`+`Secure`+`SameSite=Strict`) + CSRF double-submit mutējošiem pieprasījumiem.
 * Mounted TIKAI ja admin iespējots (`config.admin.enabled`). Aizsardzība:
 *   1) per-IP + per-identitāte rate-limit login/verify (brute-force);
 *   2) konstantas formas login atbilde (neatklāj, vai parole pareiza);
 *   3) OTP vienreizējs + attempts cap + TTL (glabātavā);
 *   4) `requireAdmin` guard + CSRF visiem mutējošiem maršrutiem;
 *   5) audit ieraksts katrai mutācijai.
 */

const MAX_ADMIN_BODY_BYTES = 2048;
/** Login: 5 mēģinājumi uz IP / 15 min. */
const LOGIN_RATE_LIMIT = 5;
/** Verify: 10 mēģinājumi uz IP / 15 min (OTP attempts cap ir papildu glabātavā). */
const VERIFY_RATE_LIMIT = 10;
/** Identitātes (globālais) limits — viens admins, tāpēc kopējais slieksnis / 15 min. */
const IDENTITY_RATE_LIMIT = 20;
const RATE_WINDOW_MS = 15 * 60 * 1000;
/** Audit saraksta lapas izmērs (drošs maksimums). */
const AUDIT_MAX_LIMIT = 100;
const AUDIT_DEFAULT_LIMIT = 50;
/** Sīkdatnes dzīves ilgums = sesijas TTL (8h). */
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const loginSchema = z.object({ password: z.string().min(1).max(200) });
const verifySchema = z.object({ code: z.string().regex(/^\d{6}$/u) });

export type AdminHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<boolean>;

export interface AdminRoutesOptions {
  readonly adminAuth: AdminAuthService;
  readonly audit: AdminAuditService;
  readonly players: AdminPlayerService;
  readonly webOrigins: readonly string[];
  readonly clock: () => number;
  readonly dev: boolean;
  readonly trustProxy: boolean;
}

/** Spēlētāju saraksta/login lapas drošie izmēri. */
const PLAYERS_MAX_LIMIT = 100;
const PLAYERS_DEFAULT_LIMIT = 25;
const LOGINS_MAX_LIMIT = 100;
const LOGINS_DEFAULT_LIMIT = 25;

export function createAdminHandler(options: AdminRoutesOptions): AdminHandler {
  const ipLimiter = new RateLimiter(LOGIN_RATE_LIMIT, RATE_WINDOW_MS, options.clock);
  const verifyIpLimiter = new RateLimiter(VERIFY_RATE_LIMIT, RATE_WINDOW_MS, options.clock);
  const identityLimiter = new RateLimiter(IDENTITY_RATE_LIMIT, RATE_WINDOW_MS, options.clock);
  const secureCookies = !options.dev;

  return async (request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (!path.startsWith("/admin/")) {
      return false;
    }
    applyAdminCors(request, response, options.webOrigins, options.dev);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return true;
    }

    try {
      if (path === "/admin/login" && request.method === "POST") {
        await handleLogin(request, response, options, ipLimiter, identityLimiter);
        return true;
      }
      if (path === "/admin/verify" && request.method === "POST") {
        await handleVerify(request, response, options, verifyIpLimiter, identityLimiter, secureCookies);
        return true;
      }
      if (path === "/admin/logout" && request.method === "POST") {
        await handleLogout(request, response, options, secureCookies);
        return true;
      }
      if (path === "/admin/session" && request.method === "GET") {
        await handleSession(request, response, options);
        return true;
      }
      if (path === "/admin/audit" && request.method === "GET") {
        await handleAudit(request, response, options);
        return true;
      }
      if (path === "/admin/players" && request.method === "GET") {
        await handlePlayersSearch(request, response, options);
        return true;
      }
      const playerMatch = /^\/admin\/players\/([^/]+)(\/logins)?$/u.exec(path);
      if (playerMatch && request.method === "GET") {
        const userId = decodeURIComponent(playerMatch[1]!);
        if (playerMatch[2] === "/logins") {
          await handlePlayerLogins(request, response, options, userId);
        } else {
          await handlePlayerOverview(request, response, options, userId);
        }
        return true;
      }
      writeJson(response, 404, { error: "not_found" });
    } catch (error) {
      console.error("[admin] route error:", error);
      if (!response.headersSent) {
        writeJson(response, 500, { error: "internal_error" });
      }
    }
    return true;
  };
}

async function handleLogin(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  ipLimiter: RateLimiter,
  identityLimiter: RateLimiter
): Promise<void> {
  const ip = clientIp(request, options.trustProxy);
  if (!ipLimiter.check(ip) || !identityLimiter.check("admin")) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readJsonBody(request, MAX_ADMIN_BODY_BYTES);
  if (!body.ok) {
    writeJson(response, body.status, { error: "invalid_input" });
    return;
  }
  const parsed = loginSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  // Konstantas formas atbilde: VIENMĒR 200 { ok: true } neatkarīgi no tā, vai parole
  // pareiza vai vai e-pasts aizgāja (paroles oracle novēršana — Codex). `login` palaiž
  // vienādu scrypt darbu abos ceļos un sūta e-pastu fire-and-forget (kļūme logota, ne atklāta).
  await options.adminAuth.login(parsed.data.password);
  writeJson(response, 200, { ok: true });
}

async function handleVerify(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  verifyIpLimiter: RateLimiter,
  identityLimiter: RateLimiter,
  secureCookies: boolean
): Promise<void> {
  const ip = clientIp(request, options.trustProxy);
  if (!verifyIpLimiter.check(ip) || !identityLimiter.check("admin")) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const body = await readJsonBody(request, MAX_ADMIN_BODY_BYTES);
  if (!body.ok) {
    writeJson(response, body.status, { error: "invalid_input" });
    return;
  }
  const parsed = verifySchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const userAgent = typeof request.headers["user-agent"] === "string"
    ? request.headers["user-agent"].slice(0, 256)
    : undefined;
  const issued = await options.adminAuth.verify(parsed.data.code, { ip, userAgent });
  if (!issued) {
    // Neveiksmīgs 2FA mēģinājums ir drošības signāls (brute-force) → auditē.
    await options.audit.record({ action: "admin.verify_failed", summary: "Failed 2FA code attempt", ip });
    writeJson(response, 401, { error: "invalid_code" });
    return;
  }
  response.setHeader("Set-Cookie", [
    serializeCookie(ADMIN_SESSION_COOKIE, issued.token, {
      maxAgeMs: COOKIE_MAX_AGE_MS,
      httpOnly: true,
      secure: secureCookies
    }),
    serializeCookie(ADMIN_CSRF_COOKIE, issued.csrf, {
      maxAgeMs: COOKIE_MAX_AGE_MS,
      httpOnly: false,
      secure: secureCookies
    })
  ]);
  await options.audit.record({
    action: "admin.login",
    summary: "Admin signed in (2FA verified)",
    ip
  });
  // CSRF tokenu atdodam arī ķermenī, lai SPA to var glabāt atmiņā (papildus sīkdatnei).
  writeJson(response, 200, { ok: true, csrf: issued.csrf });
}

async function handleLogout(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  secureCookies: boolean
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  await options.adminAuth.logout(session.token);
  // Dzēš sīkdatnes (Max-Age 0).
  response.setHeader("Set-Cookie", [
    serializeCookie(ADMIN_SESSION_COOKIE, "", { maxAgeMs: 0, httpOnly: true, secure: secureCookies }),
    serializeCookie(ADMIN_CSRF_COOKIE, "", { maxAgeMs: 0, httpOnly: false, secure: secureCookies })
  ]);
  await options.audit.record({ action: "admin.logout", summary: "Admin signed out", ip: session.ip });
  writeJson(response, 200, { ok: true });
}

async function handleSession(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: false });
  if (!session) {
    return;
  }
  writeJson(response, 200, { authenticated: true });
}

async function handleAudit(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: false });
  if (!session) {
    return;
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  const limit = clampInt(url.searchParams.get("limit"), AUDIT_DEFAULT_LIMIT, 1, AUDIT_MAX_LIMIT);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const entries = await options.audit.list(limit, offset);
  writeJson(response, 200, { entries });
}

/** GET /admin/players?q=&limit=&offset= — meklēšana (Fāze 1.1). Lasīšana, bez CSRF. */
async function handlePlayersSearch(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: false });
  if (!session) {
    return;
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  const rawQuery = url.searchParams.get("q") ?? undefined;
  const query = rawQuery !== undefined && rawQuery.trim() !== "" ? rawQuery.slice(0, 200) : undefined;
  const limit = clampInt(url.searchParams.get("limit"), PLAYERS_DEFAULT_LIMIT, 1, PLAYERS_MAX_LIMIT);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const players = await options.players.search(query, limit, offset);
  writeJson(response, 200, { players });
}

/** GET /admin/players/:id — profila pārskats (Fāze 1.2). */
async function handlePlayerOverview(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  userId: string
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: false });
  if (!session) {
    return;
  }
  const overview = await options.players.getOverview(userId);
  if (!overview) {
    writeJson(response, 404, { error: "player_not_found" });
    return;
  }
  writeJson(response, 200, overview);
}

/** GET /admin/players/:id/logins?limit=&offset= — login vēsture (Fāze 1.3). */
async function handlePlayerLogins(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  userId: string
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: false });
  if (!session) {
    return;
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  const limit = clampInt(url.searchParams.get("limit"), LOGINS_DEFAULT_LIMIT, 1, LOGINS_MAX_LIMIT);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
  const page = await options.players.getLoginHistory(userId, limit, offset);
  writeJson(response, 200, page);
}

/** Resolved admin sesija guard izsaukumam (raw tokens + konteksts audit ierakstiem). */
interface ResolvedAdmin {
  readonly token: string;
  readonly ip?: string | undefined;
}

/**
 * Autoritatīvais admin guard. Atrisina sesijas sīkdatni; mutējošiem pieprasījumiem arī
 * pārbauda CSRF (double-submit: `X-CSRF-Token` header == CSRF sīkdatne). Pie neveiksmes
 * raksta 401/403 un atgriež `undefined`.
 */
async function requireAdmin(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  opts: { readonly requireCsrf: boolean }
): Promise<ResolvedAdmin | undefined> {
  const cookies = parseCookies(request);
  const token = cookies.get(ADMIN_SESSION_COOKIE);
  if (token === undefined) {
    writeJson(response, 401, { error: "unauthorized" });
    return undefined;
  }
  const session = await options.adminAuth.resolveSession(token);
  if (!session) {
    writeJson(response, 401, { error: "unauthorized" });
    return undefined;
  }
  if (opts.requireCsrf) {
    const headerValue = request.headers[ADMIN_CSRF_HEADER];
    const headerToken = typeof headerValue === "string" ? headerValue : undefined;
    const cookieToken = cookies.get(ADMIN_CSRF_COOKIE);
    if (
      headerToken === undefined ||
      cookieToken === undefined ||
      headerToken.length === 0 ||
      headerToken !== cookieToken
    ) {
      writeJson(response, 403, { error: "csrf_failed" });
      return undefined;
    }
  }
  return { token, ip: session.ip };
}

/** CORS ar credentials admin web izcelsmei (cookies prasa konkrētu Origin, NE `*`). */
function applyAdminCors(
  request: IncomingMessage,
  response: ServerResponse,
  origins: readonly string[],
  dev: boolean
): void {
  const origin = request.headers.origin;
  if (typeof origin === "string" && isAllowedOrigin(origin, origins, dev)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "content-type, x-csrf-token");
    response.setHeader("Access-Control-Max-Age", "86400");
  }
}

/** Parsē veselu skaitli no query ar noklusējumu + robežām. */
function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}
