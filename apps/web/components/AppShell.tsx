"use client";

import { useEffect, useState } from "react";
import { ResetPasswordScreen } from "./auth/ResetPasswordScreen";
import { DominoPokerGame } from "./DominoPokerGame";
import { LobbyScreen } from "./LobbyScreen";
import { MultiplayerLobby } from "./MultiplayerLobby";
import { titleForWins } from "@domino-poker/shared";

import { avatarUrl } from "../lib/auth/avatarUrl";
import { titleLabel } from "../lib/auth/titleLabel";
import { useAuthUser } from "../lib/auth/useAuthUser";
import {
  defaultLocale,
  getAppStrings,
  isLocale,
  type Locale
} from "../lib/i18n";
import {
  readLocalStorage,
  readSessionStorage,
  writeLocalStorage,
  writeSessionStorage
} from "../lib/safeStorage";
import { useAudioSettings } from "../lib/useAudioSettings";

type AppScreen = "lobby" | "game" | "mp-lobby";

const defaultRoundCount = 7;
const localeStorageKey = "domino-poker-locale";
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
  const [resetToken, setResetToken] = useState<string | null>(null);
  const audio = useAudioSettings();
  const auth = useAuthUser();
  const refreshAuth = auth.refresh;
  const t = getAppStrings(locale);

  useEffect(() => {
    document.documentElement.lang = t.localeCode;
  }, [t.localeCode]);

  useEffect(() => {
    const storedLocale = readLocalStorage(localeStorageKey);
    if (storedLocale && isLocale(storedLocale)) {
      setLocale(storedLocale);
    }
  }, []);

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

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    writeLocalStorage(localeStorageKey, nextLocale);
  };

  const startSinglePlayer = () => {
    audio.play("uiClick");
    setScreen("game");
  };

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
        humanProfile={humanProfile}
        labels={t}
        numberOfRounds={selectedRoundCount}
        onExitToLobby={() => {
          setScreen("lobby");
        }}
      />
    );
  }

  return (
    <LobbyScreen
      audio={audio}
      labels={t}
      locale={locale}
      auth={auth}
      selectedRoundCount={selectedRoundCount}
      onRoundCountChange={setSelectedRoundCount}
      onStartSinglePlayer={startSinglePlayer}
      onStartMultiplayer={openMultiplayerLobby}
      onLocaleChange={changeLocale}
    />
  );
}
