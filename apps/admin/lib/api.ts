/**
 * Admin paneļa API klients (sk. docs/TODO/admin-panel-plan.md, Fāze 0). Runā ar serveri
 * (`/admin/*`). Visi pieprasījumi sūta sīkdatnes (`credentials: "include"`); mutējošie
 * pievieno `X-CSRF-Token` headeri no lasāmās CSRF sīkdatnes (double-submit aizsardzība).
 */

/**
 * API bāze. Prioritāte: `NEXT_PUBLIC_ADMIN_API_BASE` (build-laikā iesūtīts) → ja nav,
 * DROŠS noklusējums pēc vides. D2 deploy ir SAME-ORIGIN (admin web un `/admin/*` aiz
 * viena Caddy host), tāpēc prod pārlūkā noklusējam uz RELATĪVU bāzi (`""`), NE lokālo
 * portu — citādi prod mēģinātu runāt ar lietotāja `localhost:4000`. Dev (admin web 3001 →
 * serveris 4000) patur lokālo portu. SSR/build laikā `window` nav → lokālais (netiek lietots).
 */
function resolveApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ADMIN_API_BASE;
  if (fromEnv !== undefined) {
    return fromEnv;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      return ""; // prod same-origin: Caddy proxē /admin/* uz serveri
    }
  }
  return "http://localhost:4000";
}

const API_BASE = resolveApiBase();

const CSRF_COOKIE = "admin_csrf";
const CSRF_HEADER = "X-CSRF-Token";

/** Nolasa CSRF tokenu no lasāmās sīkdatnes (NE HttpOnly). */
function readCsrf(): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  for (const part of document.cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    if (part.slice(0, eq).trim() === CSRF_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

async function request(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (method !== "GET") {
    const csrf = readCsrf();
    if (csrf !== undefined) {
      headers[CSRF_HEADER] = csrf;
    }
  }
  return fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

/**
 * Avatar attēla URL admin skatam (paritāte ar web `avatarUrl`): preset `avatar-NN` → admin
 * `public/` SVG; `custom`/`custom:uid:ver` → servera serve URL (`API_BASE` + `/auth/avatar/:uid`);
 * nederīgs/nezināms → noklusējuma preset (drošs fallback, nekad salūzis attēls).
 */
export function adminAvatarUrl(avatar: string, userId: string): string {
  if (avatar.startsWith("custom")) {
    const parts = avatar.split(":");
    const uid = parts[1] && parts[1] !== "" ? parts[1] : userId;
    const ver = parts[2] ?? "";
    return `${API_BASE}/auth/avatar/${encodeURIComponent(uid)}?v=${encodeURIComponent(ver)}`;
  }
  if (/^avatar-\d+$/u.test(avatar)) {
    return `/assets/avatars/${avatar}.svg`;
  }
  return "/assets/avatars/avatar-01.svg";
}

/** 1. solis: parole → serveris nosūta OTP uz admin e-pastu (konstantas formas atbilde). */
export async function apiLogin(password: string): Promise<boolean> {
  const res = await request("/admin/login", "POST", { password });
  return res.ok;
}

/** 2. solis: OTP kods → izsniedz sesiju (sīkdatnē). Atgriež `true`, ja izdevās. */
export async function apiVerify(code: string): Promise<boolean> {
  const res = await request("/admin/verify", "POST", { code });
  return res.ok;
}

/** Pārbauda, vai pašreizējā sesija ir derīga. */
export async function apiSession(): Promise<boolean> {
  const res = await request("/admin/session", "GET");
  return res.ok;
}

/** Atsauc sesiju (logout). */
export async function apiLogout(): Promise<void> {
  await request("/admin/logout", "POST", {});
}

export interface AuditEntry {
  readonly id: string;
  readonly action: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly summary: string;
  readonly diff?: unknown;
  readonly ip?: string;
  readonly createdAt: number;
}

/** Audit History saraksts (jaunākie pirmie). */
export async function apiAudit(limit = 50, offset = 0): Promise<readonly AuditEntry[]> {
  const res = await request(`/admin/audit?limit=${limit}&offset=${offset}`, "GET");
  if (!res.ok) {
    return [];
  }
  const body = (await res.json()) as { entries?: readonly AuditEntry[] };
  return body.entries ?? [];
}

export interface PlayerRow {
  readonly id: string;
  readonly username: string;
  readonly email?: string;
  readonly avatar: string;
  readonly createdAt: number;
  readonly lastLoginAt?: number;
}

export interface LoginAttempt {
  readonly id: string;
  readonly ip?: string;
  readonly userAgent?: string;
  readonly source: string;
  readonly success: boolean;
  readonly createdAt: number;
}

export interface PlayerOverview {
  readonly account: {
    readonly id: string;
    readonly username: string;
    readonly email?: string;
    readonly avatar: string;
    readonly createdAt: number;
    readonly updatedAt: number;
  };
  readonly balance: number;
  readonly stats: { readonly wins: number; readonly losses: number; readonly gamesPlayed: number } | null;
  readonly logins: { readonly total: number; readonly failed: number; readonly recent: readonly LoginAttempt[] };
}

export interface LoginHistoryPage {
  readonly total: number;
  readonly failed: number;
  readonly entries: readonly LoginAttempt[];
}

/** Spēlētāju meklēšana (ID/vārds/e-pasts), kārtots pēc pēdējās pieslēgšanās. */
export async function apiPlayers(query: string, limit = 25, offset = 0): Promise<readonly PlayerRow[]> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (query.trim() !== "") {
    params.set("q", query.trim());
  }
  const res = await request(`/admin/players?${params.toString()}`, "GET");
  if (!res.ok) {
    return [];
  }
  const body = (await res.json()) as { players?: readonly PlayerRow[] };
  return body.players ?? [];
}

/** Viena spēlētāja profila pārskats vai `undefined`, ja nav atrasts. */
export async function apiPlayerOverview(id: string): Promise<PlayerOverview | undefined> {
  const res = await request(`/admin/players/${encodeURIComponent(id)}`, "GET");
  if (!res.ok) {
    return undefined;
  }
  return (await res.json()) as PlayerOverview;
}

/** Spēlētāja login vēstures lapa. */
export async function apiPlayerLogins(id: string, limit = 25, offset = 0): Promise<LoginHistoryPage> {
  const res = await request(
    `/admin/players/${encodeURIComponent(id)}/logins?limit=${limit}&offset=${offset}`,
    "GET"
  );
  if (!res.ok) {
    return { total: 0, failed: 0, entries: [] };
  }
  return (await res.json()) as LoginHistoryPage;
}

// --- Phase 2: player write operations ---

/** Vienots mutācijas rezultāts ar servera `error` kodu UI ziņojumiem. */
export type MutationResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

/** Izvelk servera `error` lauku (vai HTTP statusu) neveiksmes ziņojumam. */
async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `http_${res.status}`;
  } catch {
    return `http_${res.status}`;
  }
}

/** Konta rediģēšana (Fāze 2.1): dotie lauki tiek mainīti; pārējie saglabājas. */
export async function apiUpdateAccount(
  id: string,
  patch: { displayName?: string; email?: string; avatar?: string }
): Promise<MutationResult> {
  const res = await request(`/admin/players/${encodeURIComponent(id)}`, "PATCH", patch);
  return res.ok ? { ok: true } : { ok: false, error: await readError(res) };
}

/** Statistikas korekcija (Fāze 2.2): SET wins/losses ar obligātu iemeslu. */
export async function apiCorrectStats(
  id: string,
  input: { wins: number; losses: number; reason: string }
): Promise<MutationResult> {
  const res = await request(`/admin/players/${encodeURIComponent(id)}/stats`, "PATCH", input);
  return res.ok ? { ok: true } : { ok: false, error: await readError(res) };
}

/** Valūtas korekcija (Fāze 2.3): delta (+/−) ar obligātu iemeslu + idempotences atslēga. */
export async function apiAdjustCoins(
  id: string,
  input: { delta: number; reason: string; adjustmentId: string }
): Promise<{ ok: true; balance: number; applied: boolean } | { ok: false; error: string }> {
  const res = await request(`/admin/players/${encodeURIComponent(id)}/coins`, "POST", input);
  if (!res.ok) {
    return { ok: false, error: await readError(res) };
  }
  const body = (await res.json()) as { balance: number; applied: boolean };
  return { ok: true, balance: body.balance, applied: body.applied };
}

/** Mīkstais paroles reset (Fāze 2.1): nosūta reset e-pastu lietotājam. */
export async function apiSendResetEmail(id: string, locale = "en"): Promise<MutationResult> {
  const res = await request(`/admin/players/${encodeURIComponent(id)}/send-reset-email`, "POST", {
    locale
  });
  return res.ok ? { ok: true } : { ok: false, error: await readError(res) };
}

/** Cietais paroles reset (Fāze 2.1): anulē paroli + atsauc sesijas + reset e-pasts. */
export async function apiForceResetPassword(id: string, locale = "en"): Promise<MutationResult> {
  const res = await request(`/admin/players/${encodeURIComponent(id)}/reset-password`, "POST", {
    locale
  });
  return res.ok ? { ok: true } : { ok: false, error: await readError(res) };
}

// --- Phase 3.1: bans ---

export type BanKind = "permanent" | "temporary";

export interface Ban {
  readonly id: string;
  readonly userId?: string;
  readonly ip?: string;
  readonly reason: string;
  readonly kind: BanKind;
  readonly durationLabel: string;
  readonly expiresAt?: number;
  readonly createdAt: number;
  readonly revokedAt?: number;
  readonly createdBy: string;
}

/** Konta bans (Fāze 3.1): atsauc sesijas + atvieno WS + e-pasts. */
export async function apiBanPlayer(
  id: string,
  input: { reason: string; kind: BanKind; durationDays?: number }
): Promise<MutationResult> {
  const res = await request(`/admin/players/${encodeURIComponent(id)}/ban`, "POST", input);
  return res.ok ? { ok: true } : { ok: false, error: await readError(res) };
}

/** IP bans (Fāze 3.1): bloķē jaunus login + WS no šī IP. */
export async function apiBanIp(input: {
  ip: string;
  reason: string;
  kind: BanKind;
  durationDays?: number;
}): Promise<MutationResult> {
  const res = await request("/admin/bans/ip", "POST", input);
  return res.ok ? { ok: true } : { ok: false, error: await readError(res) };
}

/** Banu saraksts (aktīvie + vēsture, jaunākie pirmie). */
export async function apiListBans(limit = 50, offset = 0): Promise<readonly Ban[]> {
  const res = await request(`/admin/bans?limit=${limit}&offset=${offset}`, "GET");
  if (!res.ok) {
    return [];
  }
  const body = (await res.json()) as { bans?: readonly Ban[] };
  return body.bans ?? [];
}

/** Atsauc banu pēc id. */
export async function apiRevokeBan(banId: string): Promise<MutationResult> {
  const res = await request(`/admin/bans/${encodeURIComponent(banId)}/revoke`, "POST", {});
  return res.ok ? { ok: true } : { ok: false, error: await readError(res) };
}

// --- Phase 3.2: chat moderation ---

/** Bloķēto čata vārdu saraksts (normalizēti). */
export async function apiListBlockedWords(): Promise<readonly string[]> {
  const res = await request("/admin/chat/blocked-words", "GET");
  if (!res.ok) {
    return [];
  }
  const body = (await res.json()) as { words?: readonly string[] };
  return body.words ?? [];
}

/** Pievieno bloķēto vārdu. */
export async function apiAddBlockedWord(word: string): Promise<MutationResult> {
  const res = await request("/admin/chat/blocked-words", "POST", { word });
  return res.ok ? { ok: true } : { ok: false, error: await readError(res) };
}

/** Noņem bloķēto vārdu. */
export async function apiRemoveBlockedWord(word: string): Promise<MutationResult> {
  const res = await request(`/admin/chat/blocked-words/${encodeURIComponent(word)}`, "DELETE");
  return res.ok ? { ok: true } : { ok: false, error: await readError(res) };
}

/** Admin paziņojums čatā no "Admin". */
export async function apiAnnounce(text: string): Promise<MutationResult> {
  const res = await request("/admin/chat/announce", "POST", { text });
  return res.ok ? { ok: true } : { ok: false, error: await readError(res) };
}

// --- Phase 4A: analytics ---

export interface AnalyticsOverview {
  readonly totalUsers: number;
  readonly newUsers7d: number;
  readonly newUsers30d: number;
  readonly activeUsers7d: number;
  readonly activeUsers30d: number;
  readonly totalMatches: number;
  readonly totalCoins: number;
  readonly activeBans: number;
}

export interface ActivityDay {
  readonly date: string;
  readonly registrations: number;
  readonly logins: number;
}

export interface SegmentPlayer {
  readonly id: string;
  readonly username: string;
  readonly createdAt: number;
}

export interface SuspiciousPlayer {
  readonly id: string;
  readonly username: string;
  readonly failedAttempts: number;
}

/** Viens valsts/platformas spaiņa skaits (D4): unikāli spēlētāji uz atslēgu. */
export interface SegmentBucket {
  readonly key: string;
  readonly count: number;
}

export interface AnalyticsSegments {
  readonly newPlayers: readonly SegmentPlayer[];
  readonly inactivePlayers: readonly SegmentPlayer[];
  readonly suspiciousPlayers: readonly SuspiciousPlayer[];
  readonly countries: readonly SegmentBucket[];
  readonly platforms: readonly SegmentBucket[];
  readonly geoTruncated: boolean;
}

export async function apiAnalyticsOverview(): Promise<AnalyticsOverview | null> {
  const res = await request("/admin/analytics/overview", "GET");
  return res.ok ? ((await res.json()) as AnalyticsOverview) : null;
}

export async function apiAnalyticsActivity(days = 30): Promise<readonly ActivityDay[]> {
  const res = await request(`/admin/analytics/activity?days=${days}`, "GET");
  if (!res.ok) {
    return [];
  }
  return ((await res.json()) as { days?: readonly ActivityDay[] }).days ?? [];
}

/** Aktivitātes CSV (caur credentials request, lai darbotos GAN dev cross-port, GAN prod). */
export async function apiActivityCsv(days = 30): Promise<string | null> {
  const res = await request(`/admin/analytics/activity.csv?days=${days}`, "GET");
  return res.ok ? await res.text() : null;
}

export async function apiAnalyticsSegments(): Promise<AnalyticsSegments | null> {
  const res = await request("/admin/analytics/segments", "GET");
  return res.ok ? ((await res.json()) as AnalyticsSegments) : null;
}

export interface LeaderboardView {
  readonly leaderboard: { readonly entries: ReadonlyArray<{ rank: number; username: string; wins: number; losses: number; winRate: number }> } | null;
  readonly config: { readonly minGames: number; readonly size: number };
}

export async function apiAnalyticsLeaderboard(): Promise<LeaderboardView | null> {
  const res = await request("/admin/analytics/leaderboard", "GET");
  return res.ok ? ((await res.json()) as LeaderboardView) : null;
}

// --- Phase 4B: export + delete ---

/** Pilns spēlētāja eksports (JSON objekts) vai `null`. */
export async function apiExportPlayer(id: string): Promise<unknown | null> {
  const res = await request(`/admin/players/${encodeURIComponent(id)}/export`, "GET");
  return res.ok ? await res.json() : null;
}

/** Hard-delete spēlētāju (neatgriezeniski). */
export async function apiDeletePlayer(id: string): Promise<MutationResult> {
  const res = await request(`/admin/players/${encodeURIComponent(id)}`, "DELETE");
  return res.ok ? { ok: true } : { ok: false, error: await readError(res) };
}
