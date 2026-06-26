import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";

import { z } from "zod";

import { emailField, usernameField } from "../auth/authFields.js";
import { clientIp, isAllowedOrigin, writeJson } from "../http/httpUtils.js";
import { readJsonBody } from "../http/readJsonBody.js";
import { RateLimiter } from "../http/rateLimiter.js";
import type { LeaderboardService } from "../leaderboard/LeaderboardService.js";
import type { AdminAnalyticsService } from "./AdminAnalyticsService.js";
import type { AdminAuthService } from "./AdminAuthService.js";
import type { AdminAuditService } from "./AdminAuditService.js";
import type { AdminPlayerGovernanceService } from "./AdminPlayerGovernanceService.js";
import type { AdminPlayerService } from "./AdminPlayerService.js";
import type { AdminPlayerWriteService } from "./AdminPlayerWriteService.js";
import type { BanService } from "./BanService.js";
import type { ChatModerationService } from "./ChatModerationService.js";
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

/** Fāze 2 bilances/statistikas korekciju drošie izmēri + obligātā pamatojuma garums. */
const COIN_ADJUST_LIMIT = 100_000_000;
const STATS_LIMIT = 1_000_000;
const REASON_MAX = 500;

/** Fāze 2.1 — konta rediģēšana (vismaz viens lauks). username/email no koplietotā `authFields`. */
const accountUpdateSchema = z
  .object({
    displayName: usernameField.optional(),
    email: emailField.optional(),
    avatar: z.string().min(1).max(64).optional()
  })
  .refine((v) => v.displayName !== undefined || v.email !== undefined || v.avatar !== undefined);

/** Fāze 2.2 — statistikas korekcija (obligāts iemesls → audit). */
const statsAdjustSchema = z.object({
  wins: z.number().int().min(0).max(STATS_LIMIT),
  losses: z.number().int().min(0).max(STATS_LIMIT),
  reason: z.string().trim().min(1).max(REASON_MAX)
});

/** Fāze 2.3 — valūtas korekcija. `adjustmentId` = idempotences atslēga (serveris ģenerē, ja nav). */
const coinsAdjustSchema = z.object({
  delta: z
    .number()
    .int()
    .min(-COIN_ADJUST_LIMIT)
    .max(COIN_ADJUST_LIMIT)
    .refine((d) => d !== 0),
  reason: z.string().trim().min(1).max(REASON_MAX),
  adjustmentId: z.string().uuid().optional()
});

/** Fāze 2.1 — paroles reset (locale reset e-pastam; noklusējums `en`). */
const resetSchema = z.object({ locale: z.enum(["lv", "en"]).optional() });

/** Fāze 3.1 — bana ievade. `durationDays` obligāts tikai `temporary` banam. */
const MAX_BAN_DAYS = 3650;
const banFields = z.object({
  reason: z.string().trim().min(1).max(REASON_MAX),
  kind: z.enum(["permanent", "temporary"]),
  durationDays: z.number().int().min(1).max(MAX_BAN_DAYS).optional()
});
// Temporary banam jābūt `durationDays` (permanent — nav vajadzīgs). Inline (Zod izsecina param).
const banSchema = banFields.refine((v) => v.kind === "permanent" || v.durationDays !== undefined);
const ipBanSchema = banFields
  // Validē IP FORMĀTU (NE tikai garumu) — citādi nederīgs IP tiktu saglabāts, bet `clientIp()`
  // salīdzināšana login/WS to nekad netrāpītu (kluss no-op bans). `isIP` → 0 nederīgam.
  .extend({ ip: z.string().trim().refine((v) => isIP(v) !== 0) })
  .refine((v) => v.kind === "permanent" || v.durationDays !== undefined);

/** Fāze 3.2 — čata moderācija (bloķētais vārds + admin paziņojums). */
const blockedWordSchema = z.object({ word: z.string().trim().min(1).max(64) });
const announceSchema = z.object({ text: z.string().trim().min(1).max(REASON_MAX) });

export type AdminHandler = (
  request: IncomingMessage,
  response: ServerResponse
) => Promise<boolean>;

export interface AdminRoutesOptions {
  readonly adminAuth: AdminAuthService;
  readonly audit: AdminAuditService;
  readonly players: AdminPlayerService;
  /** Spēlētāju rakstīšanas operācijas (Fāze 2): konts/statistika/valūta/parole. */
  readonly playerWrites: AdminPlayerWriteService;
  /** Bani (Fāze 3.1): ban/ip-ban/list/revoke. */
  readonly bans: BanService;
  /** Čata moderācija (Fāze 3.2): bloķēto vārdu saraksts. */
  readonly chatModeration: ChatModerationService;
  /** Admin čata paziņojuma izsūtīšana (index.ts: LobbyChat.announce + gateway broadcast). */
  readonly onAnnounce: (text: string) => boolean;
  /** Analītika (Fāze 4A): pārskats/aktivitāte/segmenti. */
  readonly analytics: AdminAnalyticsService;
  /** Pārvaldība (Fāze 4B.2): eksports + hard-delete. */
  readonly governance: AdminPlayerGovernanceService;
  /** Leaderboard skats (Fāze 4A.3); `undefined`, ja nav konfigurēts. */
  readonly leaderboard?: LeaderboardService | undefined;
  /** Leaderboard konfigurācija (read-only skats). */
  readonly leaderboardConfig: { readonly minGames: number; readonly size: number };
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
  // Pilna PII eksporta limits (Fāze 4B.2, Codex): 20 / 15 min uz IP.
  const exportLimiter = new RateLimiter(20, RATE_WINDOW_MS, options.clock);
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
      // Bani (Fāze 3.1). `/admin/bans/ip` ir EKSAKTS (pirms revoke regex, kas prasa `/revoke`).
      if (path === "/admin/bans" && request.method === "GET") {
        await handleBansList(request, response, options);
        return true;
      }
      if (path === "/admin/bans/ip" && request.method === "POST") {
        await handleIpBan(request, response, options);
        return true;
      }
      const banRevokeMatch = /^\/admin\/bans\/([^/]+)\/revoke$/u.exec(path);
      if (banRevokeMatch && request.method === "POST") {
        await handleBanRevoke(request, response, options, decodeURIComponent(banRevokeMatch[1]!));
        return true;
      }
      // Čata moderācija (Fāze 3.2).
      if (path === "/admin/chat/blocked-words" && request.method === "GET") {
        await handleBlockedWordsList(request, response, options);
        return true;
      }
      if (path === "/admin/chat/blocked-words" && request.method === "POST") {
        await handleBlockedWordAdd(request, response, options);
        return true;
      }
      const blockedWordMatch = /^\/admin\/chat\/blocked-words\/([^/]+)$/u.exec(path);
      if (blockedWordMatch && request.method === "DELETE") {
        await handleBlockedWordRemove(request, response, options, decodeURIComponent(blockedWordMatch[1]!));
        return true;
      }
      if (path === "/admin/chat/announce" && request.method === "POST") {
        await handleAnnounce(request, response, options);
        return true;
      }
      // Analītika (Fāze 4A, read-only, guard-only).
      if (path === "/admin/analytics/overview" && request.method === "GET") {
        await handleAnalyticsOverview(request, response, options);
        return true;
      }
      if (path === "/admin/analytics/activity" && request.method === "GET") {
        await handleAnalyticsActivity(request, response, options, "json");
        return true;
      }
      if (path === "/admin/analytics/activity.csv" && request.method === "GET") {
        await handleAnalyticsActivity(request, response, options, "csv");
        return true;
      }
      if (path === "/admin/analytics/segments" && request.method === "GET") {
        await handleAnalyticsSegments(request, response, options);
        return true;
      }
      if (path === "/admin/analytics/leaderboard" && request.method === "GET") {
        await handleAnalyticsLeaderboard(request, response, options);
        return true;
      }
      const playerMatch =
        /^\/admin\/players\/([^/]+)(?:\/(logins|stats|coins|reset-password|send-reset-email|ban|export))?$/u.exec(
          path
        );
      if (playerMatch) {
        const userId = decodeURIComponent(playerMatch[1]!);
        const sub = playerMatch[2];
        const method = request.method;
        // Lasīšana (Fāze 1): GET pārskats / login vēsture.
        if (method === "GET" && sub === undefined) {
          await handlePlayerOverview(request, response, options, userId);
          return true;
        }
        if (method === "GET" && sub === "logins") {
          await handlePlayerLogins(request, response, options, userId);
          return true;
        }
        // Rakstīšana (Fāze 2): mutācijas → requireCsrf + audit servisā.
        if (method === "PATCH" && sub === undefined) {
          await handleAccountUpdate(request, response, options, userId);
          return true;
        }
        if (method === "PATCH" && sub === "stats") {
          await handleStatsAdjust(request, response, options, userId);
          return true;
        }
        if (method === "POST" && sub === "coins") {
          await handleCoinsAdjust(request, response, options, userId);
          return true;
        }
        if (method === "POST" && sub === "reset-password") {
          await handleResetPassword(request, response, options, userId, "force");
          return true;
        }
        if (method === "POST" && sub === "send-reset-email") {
          await handleResetPassword(request, response, options, userId, "soft");
          return true;
        }
        if (method === "POST" && sub === "ban") {
          await handlePlayerBan(request, response, options, userId);
          return true;
        }
        // Pārvaldība (Fāze 4B.2): eksports (GET, audit+rate-limit) + hard-delete (DELETE, CSRF).
        if (method === "GET" && sub === "export") {
          await handlePlayerExport(request, response, options, userId, exportLimiter);
          return true;
        }
        if (method === "DELETE" && sub === undefined) {
          await handlePlayerDelete(request, response, options, userId);
          return true;
        }
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

/** PATCH /admin/players/:id — konta rediģēšana (Fāze 2.1). Mutācija → CSRF + audit. */
async function handleAccountUpdate(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  userId: string
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  const body = await readJsonBody(request, MAX_ADMIN_BODY_BYTES);
  if (!body.ok) {
    writeJson(response, body.status, { error: "invalid_input" });
    return;
  }
  const parsed = accountUpdateSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const outcome = await options.playerWrites.updateAccount(userId, parsed.data, { ip: session.ip });
  switch (outcome) {
    case "updated":
      writeJson(response, 200, { ok: true });
      return;
    case "not_found":
      writeJson(response, 404, { error: "player_not_found" });
      return;
    case "username_taken":
    case "email_taken":
      writeJson(response, 409, { error: outcome });
      return;
    case "invalid_avatar":
      writeJson(response, 400, { error: "invalid_avatar" });
      return;
  }
}

/** PATCH /admin/players/:id/stats — statistikas korekcija (Fāze 2.2). */
async function handleStatsAdjust(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  userId: string
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  const body = await readJsonBody(request, MAX_ADMIN_BODY_BYTES);
  if (!body.ok) {
    writeJson(response, body.status, { error: "invalid_input" });
    return;
  }
  const parsed = statsAdjustSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const outcome = await options.playerWrites.correctStats(userId, parsed.data, { ip: session.ip });
  if (outcome === "not_found") {
    writeJson(response, 404, { error: "player_not_found" });
    return;
  }
  writeJson(response, 200, { ok: true });
}

/** POST /admin/players/:id/coins — valūtas korekcija (Fāze 2.3). */
async function handleCoinsAdjust(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  userId: string
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  const body = await readJsonBody(request, MAX_ADMIN_BODY_BYTES);
  if (!body.ok) {
    writeJson(response, body.status, { error: "invalid_input" });
    return;
  }
  const parsed = coinsAdjustSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  // `adjustmentId` ir idempotences atslēga: ja klients to nesūta, serveris ģenerē svaigu
  // (degradē graciozi — tikai klienta paša retry nav dedublēts; UI vienmēr sūta savu).
  const adjustmentId = parsed.data.adjustmentId ?? randomUUID();
  const outcome = await options.playerWrites.adjustCoins(
    userId,
    { delta: parsed.data.delta, reason: parsed.data.reason, adjustmentId },
    { ip: session.ip }
  );
  switch (outcome.kind) {
    case "ok":
      writeJson(response, 200, { balance: outcome.balance, applied: outcome.applied });
      return;
    case "insufficient":
      writeJson(response, 409, { error: "insufficient_balance" });
      return;
    case "not_found":
      writeJson(response, 404, { error: "player_not_found" });
      return;
  }
}

/**
 * POST /admin/players/:id/reset-password (`force`) vai /send-reset-email (`soft`) — Fāze 2.1.
 * Cietais variants anulē paroli + atsauc sesijas TIKAI pēc veiksmīgas e-pasta piegādes.
 */
async function handleResetPassword(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  userId: string,
  mode: "soft" | "force"
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  const body = await readJsonBody(request, MAX_ADMIN_BODY_BYTES);
  if (!body.ok) {
    writeJson(response, body.status, { error: "invalid_input" });
    return;
  }
  const parsed = resetSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const locale = parsed.data.locale ?? "en";
  const ctx = { ip: session.ip };
  const result =
    mode === "force"
      ? await options.playerWrites.forcePasswordReset(userId, locale, ctx)
      : await options.playerWrites.sendResetEmail(userId, locale, ctx);
  switch (result) {
    case "sent":
      writeJson(response, 200, { ok: true });
      return;
    case "not_found":
      writeJson(response, 404, { error: "player_not_found" });
      return;
    case "no_email":
      writeJson(response, 400, { error: "no_email" });
      return;
    case "disabled":
      writeJson(response, 400, { error: "reset_disabled" });
      return;
    case "email_failed":
      writeJson(response, 502, { error: "email_failed" });
      return;
  }
}

/** GET /admin/chat/blocked-words — saraksts (Fāze 3.2). Lasīšana, bez CSRF. */
async function handleBlockedWordsList(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: false });
  if (!session) {
    return;
  }
  writeJson(response, 200, { words: options.chatModeration.list() });
}

/** POST /admin/chat/blocked-words {word} — pievieno bloķēto vārdu (Fāze 3.2). */
async function handleBlockedWordAdd(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  const body = await readJsonBody(request, MAX_ADMIN_BODY_BYTES);
  if (!body.ok) {
    writeJson(response, body.status, { error: "invalid_input" });
    return;
  }
  const parsed = blockedWordSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const word = await options.chatModeration.add(parsed.data.word, { ip: session.ip });
  writeJson(response, 200, { word });
}

/** DELETE /admin/chat/blocked-words/:word — noņem bloķēto vārdu (Fāze 3.2). */
async function handleBlockedWordRemove(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  word: string
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  await options.chatModeration.remove(word, { ip: session.ip });
  writeJson(response, 200, { ok: true });
}

/** POST /admin/chat/announce {text} — admin paziņojums čatā no "Admin" (Fāze 3.2). */
async function handleAnnounce(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  const body = await readJsonBody(request, MAX_ADMIN_BODY_BYTES);
  if (!body.ok) {
    writeJson(response, body.status, { error: "invalid_input" });
    return;
  }
  const parsed = announceSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const sent = options.onAnnounce(parsed.data.text);
  if (!sent) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  await options.audit.record({
    action: "chat.announce",
    targetType: "chat",
    summary: "Posted an admin chat announcement",
    diff: { text: parsed.data.text },
    ip: session.ip
  });
  writeJson(response, 200, { ok: true });
}

/** GET /admin/analytics/overview — pārskata metrikas (Fāze 4A.1). */
async function handleAnalyticsOverview(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: false });
  if (!session) {
    return;
  }
  writeJson(response, 200, await options.analytics.overview());
}

/** GET /admin/analytics/activity[.csv]?days=N — aktivitātes laikrinda (Fāze 4A.1). */
async function handleAnalyticsActivity(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  format: "json" | "csv"
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: false });
  if (!session) {
    return;
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  const days = clampInt(url.searchParams.get("days"), 30, 1, 365);
  const rows = await options.analytics.activity(days);
  if (format === "csv") {
    const csv = ["date,registrations,logins", ...rows.map((r) => `${r.date},${r.registrations},${r.logins}`)].join("\n");
    response.setHeader("Content-Disposition", 'attachment; filename="activity.csv"');
    response.writeHead(200, { "Content-Type": "text/csv; charset=utf-8" });
    response.end(csv);
    return;
  }
  writeJson(response, 200, { days: rows });
}

/** GET /admin/analytics/segments — jaunie/neaktīvie/aizdomīgie (Fāze 4A.2). */
async function handleAnalyticsSegments(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: false });
  if (!session) {
    return;
  }
  const segments = await options.analytics.segments({
    newWithinDays: 7,
    inactiveAfterDays: 30,
    suspiciousWithinDays: 7,
    suspiciousMinFailed: 5,
    limit: 50,
    geoWithinDays: 30
  });
  writeJson(response, 200, segments);
}

/** GET /admin/analytics/leaderboard — read-only skats + konfigurācija (Fāze 4A.3). */
async function handleAnalyticsLeaderboard(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: false });
  if (!session) {
    return;
  }
  if (!options.leaderboard) {
    writeJson(response, 200, { leaderboard: null, config: options.leaderboardConfig });
    return;
  }
  const leaderboard = await options.leaderboard.getResponse(null, options.leaderboardConfig.size);
  writeJson(response, 200, { leaderboard, config: options.leaderboardConfig });
}

/** GET /admin/players/:id/export — pilns PII eksports (Fāze 4B.2). Rate-limit + audit + no-store. */
async function handlePlayerExport(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  userId: string,
  limiter: RateLimiter
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: false });
  if (!session) {
    return;
  }
  if (!limiter.check(clientIp(request, options.trustProxy))) {
    writeJson(response, 429, { error: "rate_limited" });
    return;
  }
  const data = await options.governance.exportPlayer(userId);
  if (!data) {
    writeJson(response, 404, { error: "player_not_found" });
    return;
  }
  await options.audit.record({
    action: "player.export",
    targetType: "player",
    targetId: userId,
    summary: `Exported full data for "${data.account.username}"`,
    ip: session.ip
  });
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Disposition", `attachment; filename="player-${userId}.json"`);
  writeJson(response, 200, data);
}

/** DELETE /admin/players/:id — hard-delete (Fāze 4B.2, D5). CSRF; serviss snapshot→anonimizē→dzēš. */
async function handlePlayerDelete(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  userId: string
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  const outcome = await options.governance.deletePlayer(userId, { ip: session.ip });
  if (outcome === "not_found") {
    writeJson(response, 404, { error: "player_not_found" });
    return;
  }
  writeJson(response, 200, { ok: true });
}

/** POST /admin/players/:id/ban — konta bans (Fāze 3.1). Mutācija → CSRF + audit. */
async function handlePlayerBan(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  userId: string
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  const body = await readJsonBody(request, MAX_ADMIN_BODY_BYTES);
  if (!body.ok) {
    writeJson(response, body.status, { error: "invalid_input" });
    return;
  }
  const parsed = banSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const outcome = await options.bans.banUser(userId, parsed.data, { ip: session.ip });
  switch (outcome) {
    case "banned":
      writeJson(response, 200, { ok: true });
      return;
    case "not_found":
      writeJson(response, 404, { error: "player_not_found" });
      return;
    case "already_banned":
      writeJson(response, 409, { error: "already_banned" });
      return;
  }
}

/** POST /admin/bans/ip — IP bans (Fāze 3.1). */
async function handleIpBan(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  const body = await readJsonBody(request, MAX_ADMIN_BODY_BYTES);
  if (!body.ok) {
    writeJson(response, body.status, { error: "invalid_input" });
    return;
  }
  const parsed = ipBanSchema.safeParse(body.value);
  if (!parsed.success) {
    writeJson(response, 400, { error: "invalid_input" });
    return;
  }
  const { ip, ...input } = parsed.data;
  const outcome = await options.bans.banIp(ip, input, { ip: session.ip });
  if (outcome === "already_banned") {
    writeJson(response, 409, { error: "already_banned" });
    return;
  }
  writeJson(response, 200, { ok: true });
}

/** GET /admin/bans?limit=&offset= — banu saraksts (aktīvie + vēsture). Lasīšana, bez CSRF. */
async function handleBansList(
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
  const bans = await options.bans.list(limit, offset);
  writeJson(response, 200, { bans });
}

/** POST /admin/bans/:id/revoke — atsaukt banu (Fāze 3.1). */
async function handleBanRevoke(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRoutesOptions,
  banId: string
): Promise<void> {
  const session = await requireAdmin(request, response, options, { requireCsrf: true });
  if (!session) {
    return;
  }
  const outcome = await options.bans.revoke(banId, { ip: session.ip });
  switch (outcome) {
    case "revoked":
      writeJson(response, 200, { ok: true });
      return;
    case "not_found":
      writeJson(response, 404, { error: "ban_not_found" });
      return;
    case "not_active":
      writeJson(response, 409, { error: "not_active" });
      return;
  }
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
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
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
