import type { GameLanguage, LeaderboardResponse, RankBadgeId } from "@domino-poker/shared";

import { resolveServerUrl } from "../mp/serverUrl";

/**
 * Klienta puses auth HTTP API (pret servera `/auth/*` maršrutiem). HTTP bāzi
 * atvasina no MP WebSocket URL (`NEXT_PUBLIC_MP_WS_URL` vai host-derived):
 * `ws(s)://host:port/ws` → `http(s)://host:port`. Tā gan WS, gan auth iet uz
 * vienu un to pašu serveri bez atsevišķas konfigurācijas.
 */

/** Lietotāja profils klientā (`email` zina tikai pats īpašnieks). */
export interface AuthUser {
  readonly id: string;
  readonly username: string;
  /** Preset avatar id (`avatar-NN`) VAI `'custom'` (augšupielādēts). */
  readonly avatar: string;
  readonly email?: string;
  /** Avatara cache versija (custom avatara cache-bustingam serve URL-ā). */
  readonly avatarVersion?: number;
}

/** Konta MP statistika (Fāze 3); `null`, ja vēl nav ieskaitītu spēļu. */
export interface UserStats {
  readonly wins: number;
  readonly losses: number;
  readonly gamesPlayed: number;
}

export type AuthResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly status: number; readonly error: string };

export interface TokenUser {
  readonly token: string;
  readonly user: AuthUser;
}

export interface RegisterInput {
  readonly username: string;
  readonly password: string;
  /** Obligāts: vienīgais paroles atjaunošanas kanāls (Fāze 5). */
  readonly email: string;
}

export interface LoginInput {
  readonly username: string;
  readonly password: string;
}

export interface ProfileInput {
  readonly username: string;
  readonly avatar: string;
}

export function httpBase(): string {
  const ws = resolveServerUrl({ envUrl: process.env.NEXT_PUBLIC_MP_WS_URL });
  // ws→http, wss→https; noņemam `/ws` ceļu. (URL protokola maiņa starp special
  // shēmām var būt liegta, tāpēc darbojamies ar virkni.)
  return ws.replace(/^ws/u, "http").replace(/\/ws$/u, "");
}

async function requestJson<T>(
  path: string,
  init: RequestInit
): Promise<AuthResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${httpBase()}${path}`, init);
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    const error =
      typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : "request_failed";
    return { ok: false, status: response.status, error };
  }
  return { ok: true, data: body as T };
}

function jsonInit(method: string, body?: unknown, token?: string): RequestInit {
  return {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  };
}

export function apiRegister(input: RegisterInput): Promise<AuthResult<TokenUser>> {
  return requestJson<TokenUser>("/auth/register", jsonInit("POST", input));
}

export function apiLogin(input: LoginInput): Promise<AuthResult<TokenUser>> {
  return requestJson<TokenUser>("/auth/login", jsonInit("POST", input));
}

/** `/auth/me` atbilde: profils + statistika + valoda + globālā ranga badge (vai `null`). */
export interface MeResponse {
  readonly user: AuthUser;
  readonly stats: UserStats | null;
  readonly language?: GameLanguage;
  readonly rankBadge?: RankBadgeId | null;
}

export function apiMe(token: string): Promise<AuthResult<MeResponse>> {
  return requestJson<MeResponse>("/auth/me", jsonInit("GET", undefined, token));
}

export function apiUpdateProfile(
  token: string,
  input: ProfileInput
): Promise<AuthResult<{ user: AuthUser }>> {
  return requestJson<{ user: AuthUser }>("/auth/me", jsonInit("PATCH", input, token));
}

export async function apiLogout(token: string): Promise<void> {
  await requestJson("/auth/logout", jsonInit("POST", {}, token));
}

/** Saglabā konta spēles valodu serverī (Leaderboard fāze; PATCH /auth/me/language). */
export function apiSetLanguage(
  token: string,
  language: GameLanguage
): Promise<AuthResult<{ ok: true }>> {
  return requestJson<{ ok: true }>("/auth/me/language", jsonInit("PATCH", { language }, token));
}

/**
 * Globālais tops (Leaderboard fāze). Tokens ir OPCIONĀLS: ja dots un derīgs,
 * atbildes `me` atspoguļo izsaucēja vietu; citādi `me = anonymous`. Nederīgs/
 * beidzies tokens → serveris to traktē kā anonīmu (NE kļūda) — dialogs nerāda
 * auth kļūdu. Tikai `Authorization` header (GET bez body).
 */
export function apiLeaderboard(token?: string): Promise<AuthResult<LeaderboardResponse>> {
  return requestJson<LeaderboardResponse>(
    "/auth/leaderboard",
    jsonInit("GET", undefined, token)
  );
}

/**
 * Pieprasa paroles atjaunošanas e-pastu. Serveris atbild ģeneriski (enumeration
 * novēršana), tāpēc `ok` nenozīmē, ka konts pastāv. `503 unavailable` → funkcija
 * nav konfigurēta serverī (klients to slēpj).
 */
export function apiForgotPassword(email: string, locale: "lv" | "en"): Promise<AuthResult<{ ok: true }>> {
  return requestJson<{ ok: true }>("/auth/forgot-password", jsonInit("POST", { email, locale }));
}

/** Pabeidz paroles atjaunošanu ar tokenu no e-pasta linka. */
export function apiResetPassword(token: string, password: string): Promise<AuthResult<{ ok: true }>> {
  return requestJson<{ ok: true }>("/auth/reset-password", jsonInit("POST", { token, password }));
}

/**
 * Augšupielādē JAU klienta pusē samazinātu avataru (WebP/JPEG Blob) kā raw body.
 * Serveris validē magic-bytes + izmēru; atgriež atjaunoto profilu (avatar='custom').
 */
export function apiUploadAvatar(token: string, blob: Blob): Promise<AuthResult<{ user: AuthUser; avatarVersion: number }>> {
  return requestJson<{ user: AuthUser; avatarVersion: number }>("/auth/avatar", {
    method: "POST",
    headers: { "content-type": blob.type, authorization: `Bearer ${token}` },
    body: blob
  });
}
