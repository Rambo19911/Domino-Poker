"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties
} from "react";
import { AudioControls } from "./AudioControls";
import { Dialog } from "./Dialog";
import { DominoPokerGame } from "./DominoPokerGame";
import { CompactLobbyPanel, LobbyWheel } from "./LobbyWheel";
import { HelpIcon, RulesDialog } from "./RulesDialog";
import {
  defaultLocale,
  getAppStrings,
  isLocale,
  locales,
  type AppStrings,
  type Locale
} from "../lib/i18n";
import { readLocalStorage, writeLocalStorage } from "../lib/safeStorage";
import {
  abandonStatsSession,
  fetchStatsSummary,
  finishStatsSession,
  sendAbandonStatsBeacon,
  startStatsSession
} from "../lib/stats/client";
import type { GameOutcome, StatsSummary } from "../lib/stats/types";
import { useAudioSettings } from "../lib/useAudioSettings";

type AppScreen = "lobby" | "game";

const minRoundCount = 1;
const maxRoundCount = 50;
const defaultRoundCount = 7;
const localeStorageKey = "domino-poker-locale";

export function AppShell() {
  const [screen, setScreen] = useState<AppScreen>("lobby");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [statsStatus, setStatsStatus] = useState<"loading" | "ready" | "error">("loading");
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [selectedRoundCount, setSelectedRoundCount] = useState(defaultRoundCount);
  const activeGlobalSessionIdRef = useRef<string | null>(null);
  const screenRef = useRef<AppScreen>(screen);
  const audio = useAudioSettings();
  const t = getAppStrings(locale);

  useEffect(() => {
    document.documentElement.lang = t.localeCode;
  }, [t.localeCode]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    const storedLocale = readLocalStorage(localeStorageKey);
    if (storedLocale && isLocale(storedLocale)) {
      setLocale(storedLocale);
    }
  }, []);

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    writeLocalStorage(localeStorageKey, nextLocale);
  };

  const refreshStats = useCallback(async () => {
    try {
      setStatsStatus((current) => (current === "ready" ? current : "loading"));
      const nextStats = await fetchStatsSummary();
      setStats(nextStats);
      setStatsStatus("ready");
    } catch {
      setStatsStatus("error");
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const createStatsSession = useCallback(async (): Promise<void> => {
    try {
      const globalSession = await startStatsSession();
      activeGlobalSessionIdRef.current = globalSession.sessionId;
      setStats(globalSession.stats);
      setStatsStatus("ready");
    } catch {
      activeGlobalSessionIdRef.current = null;
      setStatsStatus("error");
    }
  }, []);

  const finishActiveSession = useCallback((outcome: GameOutcome) => {
    const globalSessionId = activeGlobalSessionIdRef.current;
    if (!globalSessionId) return;

    activeGlobalSessionIdRef.current = null;

    const mutations: Promise<void>[] = [];
    mutations.push(
      finishStatsSession(globalSessionId, outcome).then((result) => {
        setStats(result.stats);
        setStatsStatus("ready");
      })
    );

    void Promise.allSettled(mutations)
      .then((results) => {
        if (results.some((result) => result.status === "rejected")) {
          setStatsStatus("error");
        }
      });
  }, []);

  const abandonActiveSession = useCallback((reason: string) => {
    const globalSessionId = activeGlobalSessionIdRef.current;
    if (!globalSessionId) return;

    activeGlobalSessionIdRef.current = null;

    const mutations: Promise<void>[] = [];
    mutations.push(
      abandonStatsSession(globalSessionId, reason).then((result) => {
        setStats(result.stats);
        setStatsStatus("ready");
      })
    );

    void Promise.allSettled(mutations)
      .then((results) => {
        if (results.some((result) => result.status === "rejected")) {
          setStatsStatus("error");
        }
      });
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (screenRef.current !== "game") return;

      const globalSessionId = activeGlobalSessionIdRef.current;
      if (!globalSessionId) return;

      activeGlobalSessionIdRef.current = null;
      sendAbandonStatsBeacon(globalSessionId, "page-unload");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
  const startSinglePlayer = async () => {
    if (isStartingGame) return;

    audio.play("uiClick");
    setIsStartingGame(true);
    await createStatsSession();
    setScreen("game");
    setIsStartingGame(false);
  };

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
        onGameFinished={finishActiveSession}
        onExitToLobby={() => {
          abandonActiveSession("exit-to-lobby");
          setScreen("lobby");
        }}
      />
    );
  }

  return (
    <main className="lobbyShell">
      <StatsBackground locale={locale} stats={stats} status={statsStatus} />

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
          disabled={isStartingGame}
          labels={t}
          maxRoundCount={maxRoundCount}
          minRoundCount={minRoundCount}
          onRoundCountChange={setSelectedRoundCount}
          onStartSinglePlayer={startSinglePlayer}
          selectedRoundCount={selectedRoundCount}
        />

        <CompactLobbyPanel
          disabled={isStartingGame}
          labels={t}
          maxRoundCount={maxRoundCount}
          minRoundCount={minRoundCount}
          onRoundCountChange={setSelectedRoundCount}
          onStartSinglePlayer={startSinglePlayer}
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

function StatsBackground({
  locale,
  stats,
  status
}: {
  readonly locale: Locale;
  readonly stats: StatsSummary | null;
  readonly status: "loading" | "ready" | "error";
}) {
  const t = getAppStrings(locale);
  const gamesPlayed = stats?.gamesPlayed ?? 0;
  const wins = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const abandoned = stats?.abandoned ?? 0;
  const maxMetric = Math.max(wins, losses, abandoned, 1);
  const winRate = stats?.winRate ?? 0;

  return (
    <aside className="lobbyStatsArt" aria-label={t.liveStats}>
      <div className="statsArtHeader">
        <span>{t.liveStats}</span>
        <small>{status === "error" ? t.statsUnavailable : status === "loading" ? t.statsLoading : `${t.activeGames}: ${stats?.activeGames ?? 0}`}</small>
      </div>
      <div
        className="statsDonut"
        style={{ "--winRate": `${Math.round(winRate * 100)}%` } as CSSProperties}
      >
        <span>{formatPercent(stats?.winRate)}</span>
        <small>{t.winRate}</small>
      </div>
      <div className="statsBars">
        <ChartBar label={t.wins} value={wins} max={maxMetric} tone="green" />
        <ChartBar label={t.losses} value={losses} max={maxMetric} tone="red" />
        <ChartBar label={t.abandonedGames} value={abandoned} max={maxMetric} tone="gold" />
      </div>
      <div className="statsArtFooter">
        <span>{t.gamesPlayed}</span>
        <strong>{gamesPlayed}</strong>
        <small>{t.winLossRatio}: {formatRatio(stats?.winLossRatio, t)}</small>
      </div>
    </aside>
  );
}

function ChartBar({
  label,
  value,
  max,
  tone
}: {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly tone: "green" | "red" | "gold";
}) {
  const height = Math.max(8, Math.round((value / max) * 100));

  return (
    <div className={`chartBar ${tone}`}>
      <div className="chartColumn">
        <span style={{ height: `${height}%` }} />
      </div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "--" : `${Math.round(value * 100)}%`;
}

function formatRatio(value: number | null | undefined, labels: AppStrings): string {
  if (value === undefined) return "--";
  if (value === null) return labels.notAvailable;
  return value.toFixed(2);
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
