import type { IncomingMessage } from "node:http";

/**
 * Mazi sīkdatņu (cookie) helperi admin sesijai (raw `node:http`, bez bibliotēkas).
 * Sesijas tokens ir `HttpOnly` (JS to nelasa → XSS nevar nozagt); CSRF tokens ir
 * lasāms (double-submit: klients to nolasa un atkārto `X-CSRF-Token` headerī).
 */

/** Admin sesijas sīkdatnes nosaukums (HttpOnly). */
export const ADMIN_SESSION_COOKIE = "admin_session";
/** CSRF sīkdatnes nosaukums (NE HttpOnly; double-submit). */
export const ADMIN_CSRF_COOKIE = "admin_csrf";
/** CSRF headeris, ko klients sūta mutējošos pieprasījumos. */
export const ADMIN_CSRF_HEADER = "x-csrf-token";

/** Parsē `Cookie` headeri vārds→vērtība kartē (tikai pirmā vērtība uz vārdu). */
export function parseCookies(request: IncomingMessage): Map<string, string> {
  const out = new Map<string, string>();
  const header = request.headers.cookie;
  if (typeof header !== "string") {
    return out;
  }
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name.length > 0 && !out.has(name)) {
      out.set(name, decodeURIComponent(value));
    }
  }
  return out;
}

/**
 * Serializē vienu `Set-Cookie` virkni. `secure` ieslēdz `Secure` (prod, HTTPS);
 * `httpOnly` neļauj JS lasīt (sesijas tokenam). `SameSite=Strict` bloķē cross-site
 * sūtīšanu (CSRF aizsardzība slāņa līmenī). `maxAgeMs <= 0` → tūlītēja dzēšana.
 */
export function serializeCookie(
  name: string,
  value: string,
  options: { readonly maxAgeMs: number; readonly httpOnly: boolean; readonly secure: boolean }
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeMs / 1000))}`
  ];
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
