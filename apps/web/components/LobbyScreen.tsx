"use client";

import { useCallback, useState } from "react";

import { AudioControls } from "./AudioControls";
import { AuthDialog } from "./auth/AuthDialog";
import { LobbyProfile } from "./auth/LobbyProfile";
import { Dialog } from "./Dialog";
import { InstallPrompt } from "./InstallPrompt";
import { LeaderboardDialog, TrophyIcon } from "./LeaderboardDialog";
import { CoinGif } from "./CoinGif";
import { CompactLobbyPanel, LobbyWheel } from "./LobbyWheel";
import { HelpIcon, RulesDialog } from "./RulesDialog";
import { IconButton } from "./ui/IconButton";

import { SP_REWARDS } from "@domino-poker/shared";
import type { BotDifficulty } from "../lib/bot/difficulty";
import type { UseAuthUser } from "../lib/auth/useAuthUser";
import {
  getAppStrings,
  isLocale,
  locales,
  type AppStrings,
  type Locale
} from "../lib/i18n";
import type { AudioSettings } from "../lib/useAudioSettings";

const minRoundCount = 1;
const maxRoundCount = 50;

/**
 * Lobby ekrānam vajadzīgā auth daļa. `getToken` ir iekļauts (Leaderboard dialogam
 * vajag bearer "manai vietai"), bet `token`/`refresh` NETIEK padoti — tie pieder
 * `AppShell` router/sesijas slānim.
 */
type LobbyAuth = Pick<
  UseAuthUser,
  | "status"
  | "user"
  | "stats"
  | "rankBadge"
  | "balance"
  | "register"
  | "login"
  | "logout"
  | "updateProfile"
  | "uploadAvatar"
  | "getToken"
>;

/**
 * SP galvenais lobby ekrāns: virsraksts + profila/riteņa saturs + iestatījumu/
 * noteikumu/auth dialogi. Dialogu atvērtības stāvoklis ir lokāls šim ekrānam
 * (`AppShell` paliek tikai router + sesijas persistence). Ekrāna pārslēgšana un
 * raundu skaits plūst no `AppShell` caur callback/props.
 */
export function LobbyScreen({
  audio,
  labels: t,
  locale,
  auth,
  selectedRoundCount,
  onRoundCountChange,
  difficulty,
  onDifficultyChange,
  onStartSinglePlayer,
  onStartMultiplayer,
  onLocaleChange
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly locale: Locale;
  readonly auth: LobbyAuth;
  readonly selectedRoundCount: number;
  readonly onRoundCountChange: (count: number) => void;
  readonly difficulty: BotDifficulty;
  readonly onDifficultyChange: (difficulty: BotDifficulty) => void;
  readonly onStartSinglePlayer: () => void;
  readonly onStartMultiplayer: () => void;
  readonly onLocaleChange: (locale: Locale) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const openAuth = () => {
    audio.play("uiClick");
    setAuthOpen(true);
  };

  return (
    <main className="lobbyShell">
      <header className="lobbyTopBar">
        {auth.status !== "authenticated" ? (
          <IconButton
            className="lobbyLoginButton"
            label={t.logIn}
            title={t.logIn}
            onClick={openAuth}
          >
            <LoginIcon />
          </IconButton>
        ) : null}
        <IconButton
          className="lobbyHelpButton"
          label={t.rules}
          title={t.rules}
          onClick={() => {
            audio.play("uiClick");
            setRulesOpen(true);
          }}
        >
          <HelpIcon />
        </IconButton>
        <IconButton
          className="lobbyLeaderboardButton"
          label={t.leaderboard}
          title={t.leaderboard}
          onClick={() => {
            audio.play("uiClick");
            setLeaderboardOpen(true);
          }}
        >
          <TrophyIcon />
        </IconButton>
        <IconButton
          className="lobbySettingsButton"
          label={t.settings}
          onClick={() => {
            audio.play("uiClick");
            setSettingsOpen(true);
          }}
        >
          <SettingsIcon />
        </IconButton>
      </header>

      <section className="lobbyContent" aria-labelledby="lobby-title">
        <h1 className="srOnly" id="lobby-title">{t.lobbyTitle}</h1>
        <LobbyProfile
          labels={t}
          status={auth.status}
          user={auth.user}
          {...(auth.stats ? { stats: { wins: auth.stats.wins, losses: auth.stats.losses } } : {})}
          rankBadge={auth.rankBadge}
          balance={auth.balance}
          onOpen={openAuth}
        />
        <LobbyWheel
          disabled={false}
          labels={t}
          maxRoundCount={maxRoundCount}
          minRoundCount={minRoundCount}
          onRoundCountChange={onRoundCountChange}
          onStartSinglePlayer={onStartSinglePlayer}
          onStartMultiplayer={onStartMultiplayer}
          selectedRoundCount={selectedRoundCount}
        />

        <CompactLobbyPanel
          disabled={false}
          labels={t}
          maxRoundCount={maxRoundCount}
          minRoundCount={minRoundCount}
          onRoundCountChange={onRoundCountChange}
          onStartSinglePlayer={onStartSinglePlayer}
          onStartMultiplayer={onStartMultiplayer}
          selectedRoundCount={selectedRoundCount}
        />
      </section>

      {settingsOpen ? (
        <SettingsDialog
          audio={audio}
          labels={t}
          locale={locale}
          difficulty={difficulty}
          onDifficultyChange={onDifficultyChange}
          onClose={() => setSettingsOpen(false)}
          onLocaleChange={onLocaleChange}
        />
      ) : null}

      {rulesOpen ? (
        <RulesDialog
          audio={audio}
          labels={t}
          onClose={() => setRulesOpen(false)}
        />
      ) : null}

      {leaderboardOpen ? (
        <LeaderboardDialog
          audio={audio}
          labels={t}
          getToken={auth.getToken}
          onClose={() => setLeaderboardOpen(false)}
        />
      ) : null}

      {/* PWA instalēšanas piedāvājums — tikai galvenajā lobby, nekad spēles laikā.
          Paslēpts, kamēr atvērts kāds dialogs (banneris ir virs modālā fona slāņa
          un citādi paliktu klikšķināms ārpus modālā konteksta). */}
      {!settingsOpen && !rulesOpen && !leaderboardOpen && !authOpen ? (
        <InstallPrompt labels={t} />
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
  difficulty,
  onDifficultyChange,
  onClose,
  onLocaleChange
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly locale: Locale;
  readonly difficulty: BotDifficulty;
  readonly onDifficultyChange: (difficulty: BotDifficulty) => void;
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
          <IconButton
            className="settingsCloseButton"
            label={t.close}
            onClick={handleClose}
          >
            <CloseIcon />
          </IconButton>
        </div>

        {tab === "settings" ? (
          <>
            <p className="settingsTabDescription">{t.settingsDescription}</p>

            <div className="settingsSectionTitle">{t.difficultySection}</div>
            <DifficultySelector
              audio={audio}
              labels={t}
              difficulty={difficulty}
              onDifficultyChange={onDifficultyChange}
            />

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
    </div>
  );
}

function LanguageSelector({
  audio,
  labels,
  locale,
  onLocaleChange
}: {
  readonly audio: AudioSettings;
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

const DIFFICULTY_ORDER: readonly BotDifficulty[] = ["medium", "hard", "epic"];

const DIFFICULTY_META: Record<
  BotDifficulty,
  { readonly labelKey: keyof AppStrings; readonly commentKey: keyof AppStrings }
> = {
  medium: { labelKey: "difficultyMedium", commentKey: "difficultyMediumComment" },
  hard: { labelKey: "difficultyHard", commentKey: "difficultyHardComment" },
  epic: { labelKey: "difficultyEpic", commentKey: "difficultyEpicComment" }
};

function DifficultySelector({
  audio,
  labels: t,
  difficulty,
  onDifficultyChange
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly difficulty: BotDifficulty;
  readonly onDifficultyChange: (difficulty: BotDifficulty) => void;
}) {
  const select = (next: BotDifficulty) => {
    if (next === difficulty) return;
    audio.play("uiClick");
    onDifficultyChange(next);
  };

  return (
    <div className="difficultySelector">
      <div className="difficultyOptions" role="group" aria-label={t.difficultySection}>
        {DIFFICULTY_ORDER.map((level) => (
          <button
            key={level}
            className="difficultyOption"
            type="button"
            aria-pressed={difficulty === level}
            onClick={() => select(level)}
          >
            <span className="difficultyOptionLabel">{t[DIFFICULTY_META[level].labelKey]}</span>
            <span
              className="difficultyReward"
              aria-label={`${t.coinsEarned}: +${SP_REWARDS[level]}`}
            >
              <CoinGif className="difficultyRewardIcon" />+{SP_REWARDS[level]}
            </span>
          </button>
        ))}
      </div>
      <p className="difficultyComment">{t[DIFFICULTY_META[difficulty].commentKey]}</p>
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
