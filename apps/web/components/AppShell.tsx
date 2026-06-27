"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { titleForWins } from "@domino-poker/shared";

import { ResetPasswordScreen } from "./auth/ResetPasswordScreen";
import { LobbyScreen } from "./LobbyScreen";
import { MultiplayerLobby } from "./MultiplayerLobby";
import { DEFAULT_DIFFICULTY, isBotDifficulty, type BotDifficulty } from "../lib/bot/difficulty";
import type { RegisterInput } from "../lib/auth/authApi";
import { avatarUrl } from "../lib/auth/avatarUrl";
import { titleLabel } from "../lib/auth/titleLabel";
import type { AuthResult } from "../lib/auth/authApi";
import { useAuthUser } from "../lib/auth/useAuthUser";
import { reconcileStoredTheme, startMotionFpsProbe } from "../lib/theme";
import { apiFetchOwned } from "../lib/store/storeApi";
import { apiSpComplete, apiSpStart, type SpGameResult, type SpStartResponse } from "../lib/sp/spReward";
import {
  defaultLocale,
  getAppStrings,
  isLocale,
  type Locale
} from "../lib/i18n";
import { setReloadSafe } from "../lib/pwa/reloadGate";
import {
  readLocalStorage,
  readSessionStorage,
  writeLocalStorage,
  writeSessionStorage
} from "../lib/safeStorage";
import { useAudioSettings } from "../lib/useAudioSettings";

// SP spēles UI (DominoPokerGame + tā atkarības) code-split ar next/dynamic, lai tas nav
// sākotnējā lobby bundle — lobby paliek viegls/ātri hidratējams. (Smagais ISMCTS bots pats
// jau dzīvo atsevišķā Web Worker bundle-ā, sk. apps/web/lib/bot/botWorker.ts.)
const DominoPokerGame = dynamic(
  () => import("./DominoPokerGame").then((module) => module.DominoPokerGame),
  { ssr: false }
);

type AppScreen = "lobby" | "game" | "mp-lobby";

const defaultRoundCount = 7;
const localeStorageKey = "domino-poker-locale";
/** SP botu grūtība saglabāta `localStorage` (kā locale), lai izvēle pārdzīvo lapas pārlādes. */
const difficultyStorageKey = "domino-poker-difficulty";
/** Saglabā, vai lietotājs bija MP lobby/spēlē, lai pēc refresh atgrieztos turp
 *  (tad MP klients pārsavienojas un serveris atjauno istabu/spēli — Fāze 9.2).
 *  Lieto `sessionStorage` (NE local): tas pārdzīvo tās pašas cilnes refresh, bet
 *  jauna sesija/cilne vienmēr sākas ar SP galveno lobby (noklusējums). Citādi MP
 *  lobby kļūtu par pastāvīgo sākuma ekrānu. */
const screenStorageKey = "domino-poker-screen";

/**
 * Aplikācijas čaula: ekrānu maršrutēšana (lobby / SP spēle / MP lobby / paroles
 * atjaunošana) + sesijas persistence (locale `localStorage`, ekrāna `sessionStorage`
 * atjaunošana, `#reset` tokens). Lobby UI dzīvo `LobbyScreen`; šeit paliek tikai
 * čaulas līmeņa state un efekti.
 */
export function AppShell() {
  const [screen, setScreen] = useState<AppScreen>("lobby");
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [selectedRoundCount, setSelectedRoundCount] = useState(defaultRoundCount);
  const [selectedDifficulty, setSelectedDifficulty] = useState<BotDifficulty>(DEFAULT_DIFFICULTY);
  const [resetToken, setResetToken] = useState<string | null>(null);
  // Fāze 2: SP balva. `spStartRef` tur /sp/start PIEPRASĪJUMU (promise), lai to var
  // sagaidīt pie spēles beigām, pat ja tas vēl nav atrisinājies (īsa spēle). `spAward`
  // ir piešķirtās monētas, ko GameEndDialog rāda kā "+N".
  const spStartRef = useRef<Promise<AuthResult<SpStartResponse>> | null>(null);
  const [spAward, setSpAward] = useState<number | null>(null);
  const audio = useAudioSettings();
  const auth = useAuthUser();
  const refreshAuth = auth.refresh;
  const getAuthToken = auth.getToken;
  const t = getAppStrings(locale);
  // localeRef vienmēr satur jaunāko locale (valodas-sync efekts to lasa bez `locale`
  // deps, lai changeLocale nestartētu lieku cikla atkārtojumu).
  const localeRef = useRef(locale);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = t.localeCode;
  }, [t.localeCode]);

  // Fāze 5.5 — post-paint FPS zonde: ja aktīvā animētā tēma krīt zem sliekšņa, pārslēdz uz
  // statisku posteri (papildina bootstrap pre-paint heiristikas). Vienreiz uz mount.
  useEffect(() => {
    startMotionFpsProbe();
  }, []);

  // P2 (Codex) — account-bound tēmas saskaņošana app-shell līmenī, NEatkarīgi no tā, vai
  // Personalization tabs ir atvērts. Uz katru auth identitātes maiņu (login/logout/konta
  // maiņa) pārbauda īpašumtiesības un atstata nepiederošu maksas tēmu uz Default. Pre-paint
  // bootstrap tēmu pielieto optimistiski; šis to koriģē, tiklīdz īpašumtiesības zināmas.
  useEffect(() => {
    if (auth.status === "loading") return; // identitāte vēl nezināma — negaidīti neatstatām
    if (auth.status === "anonymous") {
      reconcileStoredTheme([]); // anon neko nepieder → maksas tēma atkrīt uz Default
      return;
    }
    const token = getAuthToken();
    if (!token) return;
    let cancelled = false;
    void apiFetchOwned(token).then((result) => {
      if (cancelled || !result.ok) return;
      reconcileStoredTheme(result.data.owned);
    });
    return () => {
      cancelled = true;
    };
  }, [auth.status, auth.user?.id, getAuthToken]);

  useEffect(() => {
    const storedLocale = readLocalStorage(localeStorageKey);
    if (storedLocale && isLocale(storedLocale)) {
      setLocale(storedLocale);
    }
  }, []);

  useEffect(() => {
    const storedDifficulty = readLocalStorage(difficultyStorageKey);
    if (storedDifficulty && isBotDifficulty(storedDifficulty)) {
      setSelectedDifficulty(storedDifficulty);
    }
  }, []);

  // Leaderboard fāze (F7): ielogota konta serverī saglabāto valodu pielieto UI
  // locale-am sesijas iegūšanas brīžos (mount/login → `auth.language` ielādējas).
  // NE pie `changeLocale` (tas pats raksta localStorage + PATCH) un NE pie `refresh`
  // (applyLanguage:false), tāpēc bez cikla. `localeRef` lasa pašreizējo bez deps.
  useEffect(() => {
    if (auth.status !== "authenticated" || auth.language === null) return;
    if (!isLocale(auth.language)) return;
    if (localeRef.current !== auth.language) {
      setLocale(auth.language);
      writeLocalStorage(localeStorageKey, auth.language);
    }
  }, [auth.status, auth.language]);

  // Pēc refresh atgriežamies MP lobby, ja lietotājs tur bija — tad MultiplayerLobby
  // mountējas, MP klients pārsavienojas, un serveris atjauno istabu/spēli (9.2).
  useEffect(() => {
    if (readSessionStorage(screenStorageKey) === "mp-lobby") {
      setScreen("mp-lobby");
    }
  }, []);

  // Fāze 5: paroles atjaunošanas links (`#reset=<token>`) → reset ekrāns. Tokenu
  // lasām no URL hash (nenonāk servera/proxy logos), turam tikai state, un uzreiz
  // iztīram URL, lai tas nepaliek adreses joslā / pārlūka vēsturē.
  useEffect(() => {
    const marker = "#reset=";
    if (window.location.hash.startsWith(marker)) {
      const token = window.location.hash.slice(marker.length);
      if (token) {
        setResetToken(decodeURIComponent(token));
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
  }, []);

  // Fāze 3: atgriežoties galvenajā lobby (piem. pēc MP spēles), pārlādē profila
  // statistiku no servera. Anonīmam `refresh` ir no-op.
  useEffect(() => {
    if (screen === "lobby") {
      refreshAuth();
    }
  }, [screen, refreshAuth]);

  // PWA atjaunināšana: klusa auto-pārlāde uz jaunu versiju ir droša TIKAI galvenajā
  // lobby (SP/MP partijas + paroles atjaunošanas forma dzīvo atmiņā). Citur jaunais
  // SW tikai parāda soft-promptu (sk. PwaRegister / reloadGate).
  useEffect(() => {
    setReloadSafe(resetToken === null && screen === "lobby");
  }, [resetToken, screen]);

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    writeLocalStorage(localeStorageKey, nextLocale);
    // Ielogotam: persistē izvēli serverī (anonīmam `setLanguage` ir no-op).
    if (auth.status === "authenticated") {
      auth.setLanguage(nextLocale);
    }
  };

  const changeDifficulty = (nextDifficulty: BotDifficulty) => {
    setSelectedDifficulty(nextDifficulty);
    writeLocalStorage(difficultyStorageKey, nextDifficulty);
  };

  // Jaunam kontam reģistrācijas brīdī persistē PAŠREIZĒJO locale serverī — citādi
  // serveris noklusē "en", un vēlāka login/atgriešanās pārslēgtu lietotāja izvēlēto
  // valodu (F7). `AuthDialog` paliek "dumjš" — politika dzīvo šeit.
  // Stabili auth metožu refi (useAuthUser tos memoizē) — destrukturēti, lai
  // exhaustive-deps ir apmierināts bez visa `auth` objekta deps.
  const { register: registerAccount, setLanguage: persistLanguage } = auth;
  const registerWithCurrentLocale = useCallback(
    async (input: RegisterInput) => {
      const result = await registerAccount(input);
      if (result.ok) {
        persistLanguage(localeRef.current);
      }
      return result;
    },
    [registerAccount, persistLanguage]
  );

  const startSinglePlayer = () => {
    audio.play("uiClick");
    // Fāze 2: ielogotam pieprasām vienreizēju balvas tokenu (grūtība momentuzņemta
    // serverī). Glabājam PAŠU pieprasījumu, lai to var sagaidīt pie spēles beigām, pat
    // ja īsa spēle beidzas pirms atbildes. Anonīmam izlaižam — spēlē, bet nesaņem neko.
    setSpAward(null);
    const token = getAuthToken();
    spStartRef.current = token ? apiSpStart(token, selectedDifficulty, selectedRoundCount) : null;
    setScreen("game");
  };

  // Fāze 2 + statistika: SP spēle beigusies. VISIEM placement 1..4 sagaidām /sp/start
  // atbildi un izsaucam `/sp/complete` (reģistrē statistiku + piešķir balvu 1./2. vietai;
  // serveris piespiež grūtību+raundu skaitu+griestus). Bilance lobby atjaunojas pati.
  const handleSpGameEnd = useCallback(
    (result: SpGameResult): void => {
      const startRequest = spStartRef.current;
      const token = getAuthToken();
      spStartRef.current = null; // viena izsaukuma sargs
      if (!startRequest || !token || result.placement < 1 || result.placement > 4) {
        return;
      }
      void startRequest
        .then((startRes) =>
          startRes.ok
            ? apiSpComplete(token, {
                gameToken: startRes.data.gameToken,
                placement: result.placement,
                bidMet: result.bidMet,
                bidExceeded: result.bidExceeded,
                bidMissed: result.bidMissed
              })
            : null
        )
        .then((completeRes) => {
          if (completeRes && completeRes.ok && completeRes.data.coinsAwarded > 0) {
            setSpAward(completeRes.data.coinsAwarded);
          }
        });
    },
    [getAuthToken]
  );

  const openMultiplayerLobby = () => {
    audio.play("uiClick");
    writeSessionStorage(screenStorageKey, "mp-lobby");
    setScreen("mp-lobby");
  };

  if (resetToken !== null) {
    return (
      <ResetPasswordScreen
        labels={t}
        token={resetToken}
        playClick={() => audio.play("uiClick")}
        onDone={() => setResetToken(null)}
      />
    );
  }

  if (screen === "mp-lobby") {
    return (
      <MultiplayerLobby
        audio={audio}
        labels={t}
        authToken={auth.token}
        getAuthToken={auth.getToken}
        onExit={() => {
          writeSessionStorage(screenStorageKey, "lobby");
          setScreen("lobby");
        }}
      />
    );
  }

  if (screen === "game") {
    // Ielogotam SP cilvēkam sēdvietā rāda viņa avataru + lietotājvārdu + titulu
    // (atvasinātu no uzvaru skaita). Anonīmam — noklusējums (bez avatara, "Tu").
    const humanProfile =
      auth.status === "authenticated" && auth.user
        ? {
            avatarUrl: avatarUrl(auth.user.avatar, auth.user.id, auth.user.avatarVersion),
            displayName: auth.user.username,
            title: titleLabel(t, titleForWins(auth.stats?.wins ?? 0))
          }
        : { avatarUrl: null, displayName: t.you, title: null };
    return (
      <DominoPokerGame
        audio={audio}
        difficulty={selectedDifficulty}
        humanProfile={humanProfile}
        labels={t}
        numberOfRounds={selectedRoundCount}
        spAward={spAward}
        onGameEnd={handleSpGameEnd}
        onExitToLobby={() => {
          setScreen("lobby");
        }}
      />
    );
  }

  // Dekorē `register`, lai jauns konts saglabā pašreizējo valodu (skat. augstāk).
  const authForLobby = { ...auth, register: registerWithCurrentLocale };
  return (
    <LobbyScreen
      audio={audio}
      labels={t}
      locale={locale}
      auth={authForLobby}
      selectedRoundCount={selectedRoundCount}
      onRoundCountChange={setSelectedRoundCount}
      difficulty={selectedDifficulty}
      onDifficultyChange={changeDifficulty}
      onStartSinglePlayer={startSinglePlayer}
      onStartMultiplayer={openMultiplayerLobby}
      onLocaleChange={changeLocale}
    />
  );
}
