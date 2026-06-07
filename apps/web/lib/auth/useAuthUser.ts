import { useCallback, useEffect, useRef, useState } from "react";

import { readLocalStorage, writeLocalStorage } from "../safeStorage";
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiRegister,
  apiUpdateProfile,
  type AuthResult,
  type AuthUser,
  type LoginInput,
  type ProfileInput,
  type RegisterInput,
  type TokenUser,
  type UserStats
} from "./authApi";

/** localStorage atslēga auth tokenam (atsevišķi no anonīmā `clientId`). */
export const AUTH_TOKEN_STORAGE_KEY = "domino-poker-auth-token";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface UseAuthUser {
  readonly status: AuthStatus;
  readonly user: AuthUser | null;
  /** Konta MP statistika (Fāze 3); `null`, ja anonīms vai vēl nav ieskaitītu spēļu. */
  readonly stats: UserStats | null;
  /** Pašreizējais tokens (reconnect atkarībai); `null`, ja anonīms. */
  readonly token: string | null;
  register(input: RegisterInput): Promise<AuthResult<TokenUser>>;
  login(input: LoginInput): Promise<AuthResult<TokenUser>>;
  logout(): Promise<void>;
  updateProfile(input: ProfileInput): Promise<AuthResult<{ user: AuthUser }>>;
  /** Pārlādē profilu + statistiku no `/auth/me` (piem. atgriežoties lobby pēc spēles). */
  refresh(): void;
  /** Stabils tokena lasītājs WS HELLO vajadzībām (lasa pašreizējo vērtību). */
  getToken(): string | undefined;
}

/**
 * Opcionālās autentifikācijas klienta stāvoklis (tikai React hooks, kā pārējais
 * projekts). Tokens glabājas `localStorage`; uz mount validē ar `/auth/me`.
 * Anonīms lietotājs paliek pilnībā darbspējīgs — auth ir aditīvs.
 */
export function useAuthUser(): UseAuthUser {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // getToken lasa ref, lai WS slānis vienmēr redz jaunāko tokenu bez re-render.
  const [stats, setStats] = useState<UserStats | null>(null);
  const tokenRef = useRef<string | null>(null);

  const applyToken = useCallback((next: string | null): void => {
    tokenRef.current = next;
    setToken(next);
    if (next === null) {
      writeLocalStorage(AUTH_TOKEN_STORAGE_KEY, "");
    } else {
      writeLocalStorage(AUTH_TOKEN_STORAGE_KEY, next);
    }
  }, []);

  // Mount: hidratē no glabātā tokena.
  useEffect(() => {
    const stored = readLocalStorage(AUTH_TOKEN_STORAGE_KEY);
    if (stored === null || stored.trim() === "") {
      setStatus("anonymous");
      return;
    }
    tokenRef.current = stored;
    setToken(stored);
    let cancelled = false;
    void apiMe(stored).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setUser(result.data.user);
        setStats(result.data.stats);
        setStatus("authenticated");
      } else {
        // Beidzies/nederīgs tokens → graciozi anonīms.
        applyToken(null);
        setUser(null);
        setStats(null);
        setStatus("anonymous");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [applyToken]);

  // Pārlādē profilu + statistiku no /auth/me (status jau autentificēts).
  const refresh = useCallback((): void => {
    const current = tokenRef.current;
    if (current === null) return;
    void apiMe(current).then((result) => {
      if (result.ok) {
        setUser(result.data.user);
        setStats(result.data.stats);
      } else if (result.status === 401) {
        applyToken(null);
        setUser(null);
        setStats(null);
        setStatus("anonymous");
      }
    });
  }, [applyToken]);

  const register = useCallback(
    async (input: RegisterInput): Promise<AuthResult<TokenUser>> => {
      const result = await apiRegister(input);
      if (result.ok) {
        applyToken(result.data.token);
        setUser(result.data.user);
        setStats(null); // jauns konts — vēl bez statistikas
        setStatus("authenticated");
      }
      return result;
    },
    [applyToken]
  );

  const login = useCallback(
    async (input: LoginInput): Promise<AuthResult<TokenUser>> => {
      const result = await apiLogin(input);
      if (result.ok) {
        applyToken(result.data.token);
        setUser(result.data.user);
        setStatus("authenticated");
        refresh(); // ielādē esošā konta statistiku
      }
      return result;
    },
    [applyToken, refresh]
  );

  const logout = useCallback(async (): Promise<void> => {
    const current = tokenRef.current;
    applyToken(null);
    setUser(null);
    setStats(null);
    setStatus("anonymous");
    if (current) {
      await apiLogout(current);
    }
  }, [applyToken]);

  const updateProfile = useCallback(
    async (input: ProfileInput): Promise<AuthResult<{ user: AuthUser }>> => {
      const current = tokenRef.current;
      if (current === null) {
        return { ok: false, status: 401, error: "unauthorized" };
      }
      const result = await apiUpdateProfile(current, input);
      if (result.ok) {
        setUser(result.data.user);
      }
      return result;
    },
    []
  );

  const getToken = useCallback((): string | undefined => tokenRef.current ?? undefined, []);

  return { status, user, stats, token, register, login, logout, updateProfile, refresh, getToken };
}
