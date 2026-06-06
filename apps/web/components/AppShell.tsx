"use client";

import {
  useCallback,
  useEffect,
  useState
} from "react";
import { AudioControls } from "./AudioControls";
import { Dialog } from "./Dialog";
import { DominoPokerGame } from "./DominoPokerGame";
import { CompactLobbyPanel, LobbyWheel } from "./LobbyWheel";
import { MultiplayerLobby } from "./MultiplayerLobby";
import { HelpIcon, RulesDialog } from "./RulesDialog";
import {
  defaultLocale,
  getAppStrings,
  isLocale,
  locales,
  type AppStrings,
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

const minRoundCount = 1;
const maxRoundCount = 50;
const defaultRoundCount = 7;
const localeStorageKey = "domino-poker-locale";
/** Saglabā, vai lietotājs bija MP lobby/spēlē, lai pēc refresh atgrieztos turp
 *  (tad MP klients pārsavienojas un serveris atjauno istabu/spēli — Fāze 9.2).
 *  Lieto `sessionStorage` (NE local): tas pārdzīvo tās pašas cilnes refresh, bet
 *  jauna sesija/cilne vienmēr sākas ar SP galveno lobby (noklusējums). Citādi MP
 *  lobby kļūtu par pastāvīgo sākuma ekrānu. */
const screenStorageKey = "domino-poker-screen";

export function AppShell() {
  const [screen, setScreen] = useState<AppScreen>("lobby");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [selectedRoundCount, setSelectedRoundCount] = useState(defaultRoundCount);
  const audio = useAudioSettings();
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

  if (screen === "mp-lobby") {
    return (
      <MultiplayerLobby
        audio={audio}
        labels={t}
        onExit={() => {
          writeSessionStorage(screenStorageKey, "lobby");
          setScreen("lobby");
        }}
      />
    );
  }

  if (screen === "game") {
    return (
      <DominoPokerGame
        audio={audio}
        humanProfile={{
          avatarUrl: null,
          displayName: t.you
        }}
        labels={t}
        numberOfRounds={selectedRoundCount}
        onExitToLobby={() => {
          setScreen("lobby");
        }}
      />
    );
  }

  return (
    <main className="lobbyShell">
      <header className="lobbyTopBar">
        <button
          className="iconButton lobbyHelpButton"
          type="button"
          aria-label={t.rules}
          title={t.rules}
          onClick={() => {
            audio.play("uiClick");
            setRulesOpen(true);
          }}
        >
          <HelpIcon />
        </button>
        <button
          className="iconButton lobbySettingsButton"
          type="button"
          aria-label={t.settings}
          onClick={() => {
            audio.play("uiClick");
            setSettingsOpen(true);
          }}
        >
          <SettingsIcon />
        </button>
      </header>

      <section className="lobbyContent" aria-labelledby="lobby-title">
        <h1 className="srOnly" id="lobby-title">{t.lobbyTitle}</h1>
        <LobbyWheel
          disabled={false}
          labels={t}
          maxRoundCount={maxRoundCount}
          minRoundCount={minRoundCount}
          onRoundCountChange={setSelectedRoundCount}
          onStartSinglePlayer={startSinglePlayer}
          onStartMultiplayer={openMultiplayerLobby}
          selectedRoundCount={selectedRoundCount}
        />

        <CompactLobbyPanel
          disabled={false}
          labels={t}
          maxRoundCount={maxRoundCount}
          minRoundCount={minRoundCount}
          onRoundCountChange={setSelectedRoundCount}
          onStartSinglePlayer={startSinglePlayer}
          onStartMultiplayer={openMultiplayerLobby}
          selectedRoundCount={selectedRoundCount}
        />
      </section>

      {settingsOpen ? (
        <SettingsDialog
          audio={audio}
          labels={t}
          locale={locale}
          onClose={() => setSettingsOpen(false)}
          onLocaleChange={changeLocale}
        />
      ) : null}

      {rulesOpen ? (
        <RulesDialog
          audio={audio}
          labels={t}
          onClose={() => setRulesOpen(false)}
        />
      ) : null}
    </main>
  );
}

function SettingsDialog({
  audio,
  labels,
  locale,
  onClose,
  onLocaleChange
}: {
  readonly audio: ReturnType<typeof useAudioSettings>;
  readonly labels: AppStrings;
  readonly locale: Locale;
  readonly onClose: () => void;
  readonly onLocaleChange: (locale: Locale) => void;
}) {
  const t = getAppStrings(locale);
  const handleClose = useCallback(() => {
    audio.play("uiClick");
    onClose();
  }, [audio, onClose]);

  return (
    <Dialog
      ariaLabelledBy="settings-title"
      className="alertDialog settingsDialog"
      onEscape={handleClose}
      resetScrollOnMount
    >
        <div className="settingsHeader">
          <div>
            <h2 id="settings-title"><SettingsIcon /> {t.settings}</h2>
            <p>{t.settingsDescription}</p>
          </div>
          <button
            className="iconButton settingsCloseButton"
            type="button"
            aria-label={t.close}
            onClick={handleClose}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="settingsSectionTitle">{t.audioSection}</div>
        <AudioControls audio={audio} labels={labels} />

        <div className="settingsSectionTitle">{t.languageSection}</div>
        <LanguageSelector
          audio={audio}
          labels={t}
          locale={locale}
          onLocaleChange={onLocaleChange}
        />
    </Dialog>
  );
}

function LanguageSelector({
  audio,
  labels,
  locale,
  onLocaleChange
}: {
  readonly audio: ReturnType<typeof useAudioSettings>;
  readonly labels: AppStrings;
  readonly locale: Locale;
  readonly onLocaleChange: (locale: Locale) => void;
}) {
  return (
    <div className="languageSelector">
      <select
        aria-label={labels.language}
        value={locale}
        onChange={(event) => {
          const nextLocale = event.currentTarget.value;
          if (!isLocale(nextLocale) || nextLocale === locale) return;
          audio.play("uiClick");
          onLocaleChange(nextLocale);
        }}
      >
        {locales.map((option) => (
          <option key={option.code} value={option.code}>
            {labels[option.labelKey]}
          </option>
        ))}
      </select>
    </div>
  );
}

function SettingsIcon() {
  return <span className="settingsAssetIcon" aria-hidden="true" />;
}

function CloseIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
