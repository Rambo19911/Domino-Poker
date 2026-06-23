/**
 * Admin paneļa API klients (sk. docs/TODO/admin-panel-plan.md, Fāze 0). Runā ar serveri
 * (`/admin/*`). Visi pieprasījumi sūta sīkdatnes (`credentials: "include"`); mutējošie
 * pievieno `X-CSRF-Token` headeri no lasāmās CSRF sīkdatnes (double-submit aizsardzība).
 */

const API_BASE = process.env.NEXT_PUBLIC_ADMIN_API_BASE ?? "http://localhost:4000";

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

async function request(path: string, method: "GET" | "POST", body?: unknown): Promise<Response> {
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
