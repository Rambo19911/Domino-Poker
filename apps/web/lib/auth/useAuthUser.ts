import { STARTING_COINS, type GameLanguage, type RankBadgeId } from "@domino-poker/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { readLocalStorage, writeLocalStorage } from "../safeStorage";
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiRegister,
  apiSetLanguage,
  apiUpdateProfile,
  apiUploadAvatar,
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
  /** Globālā ranga badge (Leaderboard fāze) main-lobby profilam; `null`, ja ārpus top-rangiem. */
  readonly rankBadge: RankBadgeId | null;
  /** Zelta monētu bilance (Fāze 1); `null`, ja anonīms vai vēl neielādēta. */
  readonly balance: number | null;
  /**
   * Konta serverī saglabātā spēles valoda; `null`, ja anonīms vai vēl neielādēta.
   * Atjaunojas TIKAI sesijas iegūšanas brīžos (mount-ar-tokenu, login) un caur
   * `setLanguage` — NE parastā `refresh()`, lai atgriešanās lobby nepārslēgtu UI valodu.
   */
  readonly language: GameLanguage | null;
  /** Pašreizējais tokens (reconnect atkarībai); `null`, ja anonīms. */
  readonly token: string | null;
  register(input: RegisterInput): Promise<AuthResult<TokenUser>>;
  login(input: LoginInput): Promise<AuthResult<TokenUser>>;
  logout(): Promise<void>;
  updateProfile(input: ProfileInput): Promise<AuthResult<{ user: AuthUser }>>;
  /** Augšupielādē pielāgoto avataru (JAU klienta pusē samazinātu Blob). */
  uploadAvatar(blob: Blob): Promise<AuthResult<{ user: AuthUser; avatarVersion: number }>>;
  /** Pārlādē profilu + statistiku no `/auth/me` (piem. atgriežoties lobby pēc spēles). */
  refresh(): void;
  /** Saglabā spēles valodu serverī (tikai autentificēts; anonīmam no-op). Optimistisks. */
  setLanguage(next: GameLanguage): void;
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
  const [rankBadge, setRankBadge] = useState<RankBadgeId | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [language, setLanguageState] = useState<GameLanguage | null>(null);
  const tokenRef = useRef<string | null>(null);
  // Palielinās ar katru lietotāja valodas maiņu; novecojusi `/auth/me` atbilde
  // (kas startēja PIRMS maiņas) NEPĀRRAKSTA jaunāku user intent (race aizsardzība).
  const languageWriteSeq = useRef(0);

  const applyToken = useCallback((next: string | null): void => {
    tokenRef.current = next;
    setToken(next);
    writeLocalStorage(AUTH_TOKEN_STORAGE_KEY, next ?? "");
  }, []);

  // Atiestata uz anonīmu (logout / nederīgs tokens). Nesauc `apiLogout` — to dara `logout`.
  const clearAuth = useCallback((): void => {
    applyToken(null);
    setUser(null);
    setStats(null);
    setRankBadge(null);
    setBalance(null);
    setLanguageState(null);
    setStatus("anonymous");
  }, [applyToken]);

  // Privāts: ielādē profilu/statistiku/rangu no `/auth/me`.
  //  - `applyLanguage`: vai pielietot servera valodu (true: mount/login = sesijas
  //    iegūšana; false: lobby refresh).
  //  - `clearOnFailure`: vai JEBKURA kļūme (ne tikai 401) atiestata uz anonīmu. Mount
  //    ar nevalidētu glabāto tokenu to prasa, lai sākotnējais "loading" vienmēr
  //    atrisinātos pat pie network/500 kļūmes (kā pirms F7); login/refresh = tikai 401.
  const loadMe = useCallback(
    async (
      currentToken: string,
      options: { applyLanguage: boolean; clearOnFailure: boolean }
    ): Promise<void> => {
      const seqAtStart = languageWriteSeq.current;
      const result = await apiMe(currentToken);
      // Novecojusi atbilde pēc logout/login maiņas — ignorē.
      if (tokenRef.current !== currentToken) return;
      if (result.ok) {
        setUser(result.data.user);
        setStats(result.data.stats);
        setRankBadge(result.data.rankBadge ?? null);
        setBalance(result.data.balance ?? null);
        // Valodu pielieto TIKAI ja prasīts UN lietotājs to nav mainījis šī izsaukuma laikā.
        if (options.applyLanguage && result.data.language && seqAtStart === languageWriteSeq.current) {
          setLanguageState(result.data.language);
        }
        setStatus("authenticated");
      } else if (result.status === 401 || options.clearOnFailure) {
        // 401 = nederīgs tokens (vienmēr anonīms); clearOnFailure = mount, kur jebkura
        // kļūme jāatrisina uz anonīmu (citādi paliktu uz "loading").
        clearAuth();
      }
    },
    [clearAuth]
  );

  // Mount: hidratē no glabātā tokena (sesijas iegūšana → pielieto servera valodu).
  useEffect(() => {
    const stored = readLocalStorage(AUTH_TOKEN_STORAGE_KEY);
    if (stored === null || stored.trim() === "") {
      setStatus("anonymous");
      return;
    }
    tokenRef.current = stored;
    setToken(stored);
    // Mount: jebkura kļūme atrisina "loading" → anonīms (kā pirms F7).
    void loadMe(stored, { applyLanguage: true, clearOnFailure: true });
  }, [loadMe]);

  // Publisks: pārlādē profilu + statistiku (NEMaina UI valodu — applyLanguage:false;
  // pārejošu kļūmi NEizlogo — tikai 401, kā agrāk).
  const refresh = useCallback((): void => {
    const current = tokenRef.current;
    if (current === null) return;
    void loadMe(current, { applyLanguage: false, clearOnFailure: false });
  }, [loadMe]);

  const register = useCallback(
    async (input: RegisterInput): Promise<AuthResult<TokenUser>> => {
      const result = await apiRegister(input);
      if (result.ok) {
        applyToken(result.data.token);
        setUser(result.data.user);
        setStats(null); // jauns konts — vēl bez statistikas
        setRankBadge(null); // jauns konts — vēl bez ranga
        // Jauns konts saņem starta bonusu serverī (autoritatīvi); rādām to uzreiz
        // optimistiski (nākamais /auth/me apstiprina no servera).
        setBalance(STARTING_COINS);
        setLanguageState(null); // valodu serverī iestata izsaucējs (AppShell) ar pašreizējo locale
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
        // Ielādē statistiku + saglabāto valodu (sesijas iegūšana → applyLanguage).
        // Login jau iestatīja "authenticated"; pārejošu /auth/me kļūmi NEizlogo (tikai 401).
        void loadMe(result.data.token, { applyLanguage: true, clearOnFailure: false });
      }
      return result;
    },
    [applyToken, loadMe]
  );

  const logout = useCallback(async (): Promise<void> => {
    const current = tokenRef.current;
    clearAuth();
    if (current) {
      await apiLogout(current);
    }
  }, [clearAuth]);

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

  const uploadAvatar = useCallback(
    async (blob: Blob): Promise<AuthResult<{ user: AuthUser; avatarVersion: number }>> => {
      const current = tokenRef.current;
      if (current === null) {
        return { ok: false, status: 401, error: "unauthorized" };
      }
      const result = await apiUploadAvatar(current, blob);
      if (result.ok) {
        setUser(result.data.user);
      }
      return result;
    },
    []
  );

  // Saglabā valodu serverī. Optimistisks (lokālais state uzreiz); 401 → graciozs logout.
  // Anonīmam no-op (locale paliek tikai localStorage — to dara AppShell.changeLocale).
  const setLanguage = useCallback(
    (next: GameLanguage): void => {
      const current = tokenRef.current;
      if (current === null) return;
      languageWriteSeq.current += 1;
      setLanguageState(next);
      void apiSetLanguage(current, next).then((result) => {
        // Stale-token guard: novecojusi 401 (no JAU nomainīta tokena) NEDRĪKST izlogot
        // pa to laiku ielogotu CITU sesiju.
        if (!result.ok && result.status === 401 && tokenRef.current === current) {
          clearAuth();
        }
      });
    },
    [clearAuth]
  );

  const getToken = useCallback((): string | undefined => tokenRef.current ?? undefined, []);

  return {
    status,
    user,
    stats,
    rankBadge,
    balance,
    language,
    token,
    register,
    login,
    logout,
    updateProfile,
    uploadAvatar,
    refresh,
    setLanguage,
    getToken
  };
}
