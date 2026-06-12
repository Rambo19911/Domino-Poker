"use client";

import {
  useCallback,
  useEffect,
  useState
} from "react";
import { AudioControls } from "./AudioControls";
import { AuthDialog } from "./auth/AuthDialog";
import { LobbyProfile } from "./auth/LobbyProfile";
import { ResetPasswordScreen } from "./auth/ResetPasswordScreen";
import { Dialog } from "./Dialog";
import { DominoPokerGame } from "./DominoPokerGame";
import { CompactLobbyPanel, LobbyWheel } from "./LobbyWheel";
import { MultiplayerLobby } from "./MultiplayerLobby";
import { HelpIcon, RulesDialog } from "./RulesDialog";
import { titleForWins } from "@domino-poker/shared";

import { avatarUrl } from "../lib/auth/avatarUrl";
import { titleLabel } from "../lib/auth/titleLabel";
import { useAuthUser } from "../lib/auth/useAuthUser";
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
  const [authOpen, setAuthOpen] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const audio = useAudioSettings();
  const auth = useAuthUser();
  const refreshAuth = auth.refresh;
  const t = getAppStrings(locale);

  const openAuth = () => {
    audio.play("uiClick");
    setAuthOpen(true);
  };

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
    <main className="lobbyShell">
      <header className="lobbyTopBar">
        {auth.status !== "authenticated" ? (
          <button
            className="iconButton lobbyLoginButton"
            type="button"
            aria-label={t.logIn}
            title={t.logIn}
            onClick={openAuth}
          >
            <LoginIcon />
          </button>
        ) : null}
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
        <LobbyProfile
          labels={t}
          status={auth.status}
          user={auth.user}
          {...(auth.stats ? { stats: { wins: auth.stats.wins, losses: auth.stats.losses } } : {})}
          onOpen={openAuth}
        />
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

      {authOpen ? (
        <AuthDialog
          labels={t}
          locale={locale}
          status={auth.status}
          user={auth.user}
          register={auth.register}
          login={auth.login}
          logout={auth.logout}
          updateProfile={auth.updateProfile}
          uploadAvatar={auth.uploadAvatar}
          playClick={() => audio.play("uiClick")}
          onClose={() => setAuthOpen(false)}
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
  const [tab, setTab] = useState<"settings" | "about">("settings");
  const handleClose = useCallback(() => {
    audio.play("uiClick");
    onClose();
  }, [audio, onClose]);

  const selectTab = (next: "settings" | "about") => {
    if (next === tab) return;
    audio.play("uiClick");
    setTab(next);
  };

  return (
    <Dialog
      ariaLabelledBy="settings-title"
      className="alertDialog settingsDialog"
      onEscape={handleClose}
      resetScrollOnMount
    >
        <h2 id="settings-title" className="srOnly">{t.settings}</h2>
        <div className="settingsHeader">
          {/* Vienkāršs 2-skatu pārslēdzējs (Settings/About), NE pilns ARIA tabs widget:
              role="group" + aria-pressed pogas → tastatūras uzvedība (Tab + Enter/Space)
              atbilst semantikai bez roving tabindex / bultiņu navigācijas. */}
          <div className="settingsTabs" role="group" aria-label={t.settings}>
            <button
              className="settingsTab"
              type="button"
              aria-pressed={tab === "settings"}
              onClick={() => selectTab("settings")}
            >
              <SettingsIcon /> {t.settings}
            </button>
            <button
              className="settingsTab"
              type="button"
              aria-pressed={tab === "about"}
              onClick={() => selectTab("about")}
            >
              {t.about}
            </button>
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

        {tab === "settings" ? (
          <>
            <p className="settingsTabDescription">{t.settingsDescription}</p>

            <div className="settingsSectionTitle">{t.audioSection}</div>
            <AudioControls audio={audio} labels={labels} />

            <div className="settingsSectionTitle">{t.languageSection}</div>
            <LanguageSelector
              audio={audio}
              labels={t}
              locale={locale}
              onLocaleChange={onLocaleChange}
            />
          </>
        ) : (
          <AboutPanel labels={t} />
        )}
    </Dialog>
  );
}

function AboutPanel({ labels: t }: { readonly labels: AppStrings }) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

  return (
    <div className="aboutPanel">
      <p className="settingsTabDescription">{t.aboutDescription}</p>

      <dl className="aboutMeta">
        <div className="aboutMetaRow">
          <dt>{t.versionLabel}</dt>
          <dd>{version}</dd>
        </div>
        <div className="aboutMetaRow">
          <dt>{t.authorLabel}</dt>
          <dd>Rihards Laškovs</dd>
        </div>
        <div className="aboutMetaRow">
          <dt>{t.licenseLabel}</dt>
          <dd>Apache License 2.0</dd>
        </div>
      </dl>

      <a
        className="aboutGithubLink"
        href="https://github.com/Rambo19911/Domino-Poker"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t.openOnGithub}
        title={t.openOnGithub}
      >
        <GithubIcon />
      </a>
    </div>
  );
}

function GithubIcon() {
  return (
    <span className="githubAssetIcon" aria-hidden="true">
      <img
        className="githubAssetIconFrame static"
        src="/assets/icons/square-github.svg"
        alt=""
      />
      <img
        className="githubAssetIconFrame animated"
        src="/assets/icons/square-github_brands_beat.svg"
        alt=""
      />
    </span>
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

function LoginIcon() {
  return <span className="loginAssetIcon" aria-hidden="true" />;
}

function CloseIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
