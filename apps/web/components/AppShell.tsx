"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent
} from "react";
import { AudioControls } from "./AudioControls";
import { DominoPokerGame } from "./DominoPokerGame";
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
    const storedLocale = window.localStorage.getItem(localeStorageKey);
    if (storedLocale && isLocale(storedLocale)) {
      setLocale(storedLocale);
    }
  }, []);

  const changeLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    window.localStorage.setItem(localeStorageKey, nextLocale);
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

  const playButtonPoint = getWheelPoint(348, 215);

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
        <div className="modeWheel" aria-label={t.gameModes}>
          <svg className="modeWheelArt" viewBox="0 0 500 500" aria-hidden="true">
            <defs>
              <path
                id="single-player-label-path"
                d="M 118 162 A 170 170 0 0 1 382 162"
              />
              <path
                id="multiplayer-label-path"
                d="M 115 360 A 170 170 0 0 0 385 360"
              />
            </defs>
            <path
              className="modeWheelArc top"
              d="M 6 235 A 245 245 0 0 1 494 235 L 394 235 A 145 145 0 0 0 106 235 Z"
            />
            <path
              className="modeWheelArc bottom"
              d="M 494 265 A 245 245 0 0 1 6 265 L 106 265 A 145 145 0 0 0 394 265 Z"
            />
            <text className="modeWheelText top">
              <textPath href="#single-player-label-path" startOffset="50%">
                {t.modeSinglePlayer}
              </textPath>
            </text>
            <text className="modeWheelText bottom">
              <textPath href="#multiplayer-label-path" startOffset="50%">
                {t.modeMultiplayer}
              </textPath>
            </text>
          </svg>

          <div className="singleModeControls">
            <RoundArcSelector
              decreaseLabel={t.decreaseRounds}
              disabled={isStartingGame}
              id="single-player-round-count"
              increaseLabel={t.increaseRounds}
              label={t.roundCount}
              max={maxRoundCount}
              min={minRoundCount}
              onChange={setSelectedRoundCount}
              value={selectedRoundCount}
            />

            <button
              className="playButton"
              style={{
                left: formatWheelPercent(playButtonPoint.x),
                top: formatWheelPercent(playButtonPoint.y)
              } as CSSProperties}
              type="button"
              disabled={isStartingGame}
              onClick={startSinglePlayer}
            >
              {t.play}
            </button>
          </div>

          <div className="modeWheelLogo">
            <img src="/assets/images/domino_poker_logo.png" alt="" />
          </div>
        </div>
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

const wheelCenter = 250;
const roundArcRadius = 214;
const roundArcStartAngle = 214;
const roundArcEndAngle = 326;
const roundArcPath = describeArc(
  wheelCenter,
  wheelCenter,
  roundArcRadius,
  roundArcStartAngle,
  roundArcEndAngle
);

function RoundArcSelector({
  decreaseLabel,
  disabled,
  id,
  increaseLabel,
  label,
  max,
  min,
  onChange,
  value
}: {
  readonly decreaseLabel: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly increaseLabel: string;
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly onChange: (roundCount: number) => void;
  readonly value: number;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const progress = (value - min) / (max - min);
  const thumb = getRoundArcPoint(progress);
  const minusPoint = getWheelPoint(206, 210);
  const plusPoint = getWheelPoint(334, 210);
  const labelPoint = getWheelPoint(220, 185);
  const valuePoint = getWheelPoint(270, 188);

  const setClampedValue = (nextValue: number) => {
    onChange(clampRoundCount(nextValue, min, max));
  };

  const setValueFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / rect.width) * 500;
    const localY = ((event.clientY - rect.top) / rect.height) * 500;
    const angle = normalizeDegrees(
      (Math.atan2(localY - wheelCenter, localX - wheelCenter) * 180) / Math.PI
    );
    const clampedAngle = Math.min(roundArcEndAngle, Math.max(roundArcStartAngle, angle));
    const nextProgress =
      (clampedAngle - roundArcStartAngle) / (roundArcEndAngle - roundArcStartAngle);
    setClampedValue(min + nextProgress * (max - min));
  };

  return (
    <div className="roundArcSelector">
      <span
        className="roundArcLabel"
        style={{
          left: formatWheelPercent(labelPoint.x),
          top: formatWheelPercent(labelPoint.y)
        } as CSSProperties}
      >
        {label}
      </span>
      <output
        className="roundArcValue"
        htmlFor={id}
        style={{
          left: formatWheelPercent(valuePoint.x),
          top: formatWheelPercent(valuePoint.y)
        } as CSSProperties}
      >
        {value}
      </output>
      <button
        className="roundArcStep minus"
        style={{
          left: formatWheelPercent(minusPoint.x),
          top: formatWheelPercent(minusPoint.y)
        } as CSSProperties}
        type="button"
        disabled={disabled || value <= min}
        aria-label={decreaseLabel}
        onClick={() => setClampedValue(value - 1)}
      >
        -
      </button>
      <svg
        id={id}
        className="roundArcSvg"
        viewBox="0 0 500 500"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={(event) => {
          setIsDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          setValueFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (isDragging) setValueFromPointer(event);
        }}
        onPointerUp={() => setIsDragging(false)}
        onPointerCancel={() => setIsDragging(false)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            setClampedValue(value - 1);
          }
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            setClampedValue(value + 1);
          }
        }}
      >
        <path className="roundArcTrack" d={roundArcPath} pathLength={100} />
        <path
          className="roundArcActive"
          d={roundArcPath}
          pathLength={100}
          strokeDasharray={`${formatNumber(progress * 100)} 100`}
        />
        <circle
          className="roundArcThumbHalo"
          cx={formatNumber(thumb.x)}
          cy={formatNumber(thumb.y)}
          r="16"
        />
        <circle
          className="roundArcThumb"
          cx={formatNumber(thumb.x)}
          cy={formatNumber(thumb.y)}
          r="10"
        />
      </svg>
      <button
        className="roundArcStep plus"
        style={{
          left: formatWheelPercent(plusPoint.x),
          top: formatWheelPercent(plusPoint.y)
        } as CSSProperties}
        type="button"
        disabled={disabled || value >= max}
        aria-label={increaseLabel}
        onClick={() => setClampedValue(value + 1)}
      >
        +
      </button>
    </div>
  );
}

function clampRoundCount(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function getRoundArcPoint(progress: number): { x: number; y: number } {
  return getWheelPoint(
    roundArcStartAngle + progress * (roundArcEndAngle - roundArcStartAngle),
    roundArcRadius
  );
}

function getWheelPoint(angleDegrees: number, radius: number): { x: number; y: number } {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: wheelCenter + radius * Math.cos(radians),
    y: wheelCenter + radius * Math.sin(radians)
  };
}

function describeArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = getWheelPoint(startAngle, radius);
  const end = getWheelPoint(endAngle, radius);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function formatWheelPercent(value: number): string {
  return `${formatNumber(value / 5)}%`;
}

function formatNumber(value: number): string {
  return value.toFixed(4);
}

function normalizeDegrees(degrees: number): number {
  return (degrees + 360) % 360;
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
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    dialog.scrollTop = 0;
    const timeoutId = window.setTimeout(() => {
      dialog.scrollTop = 0;
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div className="modalBackdrop">
      <section ref={dialogRef} className="alertDialog settingsDialog" aria-labelledby="settings-title">
        <div className="settingsHeader">
          <div>
            <h2 id="settings-title"><SettingsIcon /> {t.settings}</h2>
            <p>{t.settingsDescription}</p>
          </div>
          <button
            className="iconButton settingsCloseButton"
            type="button"
            aria-label={t.close}
            onClick={() => {
              audio.play("uiClick");
              onClose();
            }}
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
      </section>
    </div>
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
