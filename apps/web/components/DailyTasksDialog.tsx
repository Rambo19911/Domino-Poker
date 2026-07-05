"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Dialog } from "./Dialog";
import { Button } from "./ui/Button";
import { CloseIcon } from "./ui/CloseIcon";
import { IconButton } from "./ui/IconButton";
import type {
  DailyClaimView,
  DailyDifficulty,
  DailyTasksView,
  DailyTaskView
} from "../lib/daily/dailyApi";
import type { WeeklyClaimView, WeeklyTasksView, WeeklyTaskView } from "../lib/weekly/weeklyApi";
import type { AppStrings } from "../lib/i18n";
import type { AudioSettings } from "../lib/useAudioSettings";

/** Uzdevuma id → PNG attēls (assets/daily). Katalogs ir servera puses; attēli ir web puses. */
const DAILY_TASK_ART: Record<string, string> = {
  win10_medium: "win_medium",
  win20_hard: "win_hard",
  win30_epic: "win_epic_30",
  win50_epic: "win_epic_50"
};

const WEEKLY_TASK_ART: Record<string, string> = {
  mp_finish_20: "Play-and-finish-20-multiplayer-games",
  sp_epic50_x2: "Win-twice-50-round-game-on-Epic",
  boss30: "Take-winning-place-in-30-rounds",
  boss50: "Take-winning-place-in-50-rounds"
};

const DIFFICULTY_LABEL: Record<DailyDifficulty, keyof AppStrings> = {
  medium: "difficultyMedium",
  hard: "difficultyHard",
  epic: "difficultyEpic"
};

type TasksTab = "daily" | "weekly";

/** Claim rezultāts, kas der GAN daily, GAN weekly (abiem ir `balance` + `awarded`). */
type AnyClaimResult = { readonly balance: number; readonly awarded: number };

/** HH:MM:SS no sekundēm (countdown līdz UTC atiestatīšanai). */
function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/**
 * Viena uzdevuma kartīte (dala daily + weekly). Tikai izkārtojums; darbības mezglu (claim poga /
 * play poga / nozīme) padod izsaucējs. Progress ir parametrizēts (`progress/threshold`), tāpēc
 * daily binārais (threshold=1) izskatās identiski kā agrāk, bet weekly rāda īsto skaitītāju.
 */
function TaskCard({
  artSrc,
  title,
  progress,
  threshold,
  rewardCoins,
  status,
  action
}: {
  readonly artSrc: string;
  readonly title: string;
  readonly progress: number;
  readonly threshold: number;
  readonly rewardCoins: number;
  readonly status: "claimed" | "claimable" | "open" | "locked";
  readonly action: ReactNode;
}) {
  const pct = threshold > 0 ? Math.min(100, (progress / threshold) * 100) : 0;
  return (
    <div className="dailyCard" data-status={status}>
      <img className="dailyCardArt" src={artSrc} alt="" aria-hidden="true" />
      <div className="dailyCardBody">
        <h3 className="dailyCardTitle">{title}</h3>
        <div className="dailyProgress" aria-label={`${progress}/${threshold}`}>
          <div className="dailyProgressTrack">
            <span className="dailyProgressFill" style={{ width: `${pct}%` }} />
          </div>
          <span className="dailyProgressText">
            {progress}/{threshold}
          </span>
        </div>
        <div className="dailyReward">
          <img
            className="dailyCoin"
            src="/assets/coins/spinRight-32.gif"
            alt=""
            aria-hidden="true"
          />
          <span>{rewardCoins.toLocaleString()}</span>
        </div>
      </div>
      <div className="dailyCardAction">{action}</div>
    </div>
  );
}

export function DailyTasksDialog({
  audio,
  labels: t,
  state,
  claim,
  weeklyState,
  weeklyClaim,
  onPlayWeekly,
  onBalanceChange,
  onClose
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly state: DailyTasksView | null;
  readonly claim: (taskId: string) => Promise<DailyClaimView | null>;
  readonly weeklyState: WeeklyTasksView | null;
  readonly weeklyClaim: (taskId: string) => Promise<WeeklyClaimView | null>;
  /** Palaiž nedēļas boss uzdevuma speciālo istabu (uzd. 3/4 `[Play]`) ar doto raundu skaitu. */
  readonly onPlayWeekly: (rounds: number) => void;
  readonly onBalanceChange: (balance: number) => void;
  readonly onClose: () => void;
}) {
  const [tab, setTab] = useState<TasksTab>("daily");
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // Countdown atskaitās LOKĀLI no aktīvās cilnes `secondsUntilReset` (nav re-fetch — Codex).
  const activeSeconds =
    tab === "daily"
      ? (state?.secondsUntilReset ?? 0)
      : (weeklyState?.secondsUntilReset ?? 0);
  const [secondsLeft, setSecondsLeft] = useState(activeSeconds);

  useEffect(() => {
    setSecondsLeft(activeSeconds);
  }, [activeSeconds]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const id = setInterval(() => setSecondsLeft((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  const selectTab = (next: TasksTab) => {
    if (next === tab) return;
    audio.play("uiClick");
    setError(false);
    setInfoOpen(false);
    setTab(next);
  };

  const handleClose = () => {
    audio.play("uiClick");
    onClose();
  };

  const handleClaim = async (
    taskId: string,
    claimFn: (id: string) => Promise<AnyClaimResult | null>
  ) => {
    setError(false);
    setClaiming(taskId);
    audio.play("uiClick");
    const result = await claimFn(taskId);
    setClaiming(null);
    if (result) {
      onBalanceChange(result.balance);
      if (result.awarded > 0) {
        audio.play("coinClaim");
      }
    } else {
      setError(true);
    }
  };

  const dailyAction = (task: DailyTaskView): ReactNode => {
    if (task.claimed) {
      return <span className="dailyBadge dailyBadgeClaimed">{t.dailyClaimed}</span>;
    }
    if (task.claimable) {
      return (
        <Button
          variant="primary"
          size="sm"
          loading={claiming === task.id}
          onClick={() => void handleClaim(task.id, claim)}
        >
          {t.dailyClaim}
        </Button>
      );
    }
    if (!task.unlocked) {
      return <span className="dailyBadge dailyBadgeLocked">{t.dailyLocked}</span>;
    }
    return (
      <span className="dailyBadge">
        {task.progress}/1
      </span>
    );
  };

  const weeklyGoal = (task: WeeklyTaskView): string => {
    if (task.kind === "mp_finish") {
      return t.weeklyGoalMp.replace("{count}", String(task.threshold));
    }
    if (task.variant === "weekly_bosses") {
      return t.weeklyGoalPlace.replace("{rounds}", String(task.exactRounds ?? 0));
    }
    return t.weeklyGoalWinEpic
      .replace("{count}", String(task.threshold))
      .replace("{rounds}", String(task.exactRounds ?? 0));
  };

  const weeklyAction = (task: WeeklyTaskView): ReactNode => {
    if (task.claimed) {
      return <span className="dailyBadge dailyBadgeClaimed">{t.dailyClaimed}</span>;
    }
    if (task.claimable) {
      return (
        <Button
          variant="primary"
          size="sm"
          loading={claiming === task.id}
          onClick={() => void handleClaim(task.id, weeklyClaim)}
        >
          {t.dailyClaim}
        </Button>
      );
    }
    if (task.hasPlayButton && task.exactRounds !== undefined) {
      const rounds = task.exactRounds;
      return (
        <Button variant="secondary" size="sm" onClick={() => onPlayWeekly(rounds)}>
          {t.weeklyPlay}
        </Button>
      );
    }
    return (
      <span className="dailyBadge">
        {task.progress}/{task.threshold}
      </span>
    );
  };

  const infoLabel = tab === "daily" ? t.dailyInfoLabel : t.weeklyInfoLabel;

  return (
    <Dialog
      ariaLabelledBy="daily-title"
      className="alertDialog dailyDialog"
      onEscape={handleClose}
      resetScrollOnMount
    >
      <div className="settingsHeader">
        <div className="dailyHeaderMain">
          <h2 id="daily-title">
            <DailyTasksIcon /> {t.tasks}
            <span className="dailyInfoWrap">
              <button
                className="dailyInfoButton"
                type="button"
                aria-label={infoLabel}
                aria-controls="daily-info-tip"
                aria-expanded={infoOpen}
                onClick={() => {
                  audio.play("uiClick");
                  setInfoOpen((open) => !open);
                }}
              >
                ?
              </button>
              <span
                className="dailyTooltip"
                role="note"
                id="daily-info-tip"
                data-open={infoOpen}
                aria-hidden={!infoOpen}
              >
                {tab === "daily" ? (
                  <>
                    <span>{t.dailyInfoConditions}</span>
                    <span>{t.dailyInfoDifficulty}</span>
                    <span>{t.dailyInfoSpOnly}</span>
                  </>
                ) : (
                  <>
                    <span>{t.weeklyInfoConditions}</span>
                    <span>{t.weeklyInfoReset}</span>
                  </>
                )}
              </span>
            </span>
          </h2>
          <div className="settingsTabs dailyTabs" role="group" aria-label={t.tasks}>
            <button
              className="settingsTab"
              type="button"
              aria-pressed={tab === "daily"}
              onClick={() => selectTab("daily")}
            >
              {t.dailyTab}
            </button>
            <button
              className="settingsTab"
              type="button"
              aria-pressed={tab === "weekly"}
              onClick={() => selectTab("weekly")}
            >
              {t.weeklyTab}
            </button>
          </div>
          <p>{tab === "daily" ? t.dailyTasksSubtitle : t.weeklyTasksSubtitle}</p>
        </div>
        <IconButton className="settingsCloseButton" label={t.close} onClick={handleClose}>
          <CloseIcon />
        </IconButton>
      </div>

      <div className="dailyList">
        {tab === "daily"
          ? (state?.tasks ?? []).map((task) => {
              const goal = t.dailyGoal
                .replace("{count}", String(task.requiredRounds))
                .replace("{difficulty}", t[DIFFICULTY_LABEL[task.difficulty]]);
              const status = task.claimed
                ? "claimed"
                : task.claimable
                  ? "claimable"
                  : task.unlocked
                    ? "open"
                    : "locked";
              return (
                <TaskCard
                  key={task.id}
                  artSrc={`/assets/daily/${DAILY_TASK_ART[task.id] ?? "win_medium"}.png`}
                  title={goal}
                  progress={task.progress}
                  threshold={1}
                  rewardCoins={task.rewardCoins}
                  status={status}
                  action={dailyAction(task)}
                />
              );
            })
          : (weeklyState?.tasks ?? []).map((task) => {
              const status = task.claimed
                ? "claimed"
                : task.claimable
                  ? "claimable"
                  : "open";
              return (
                <TaskCard
                  key={task.id}
                  artSrc={`/assets/daily/${WEEKLY_TASK_ART[task.id] ?? "win_epic_50"}.png`}
                  title={weeklyGoal(task)}
                  progress={task.progress}
                  threshold={task.threshold}
                  rewardCoins={task.rewardCoins}
                  status={status}
                  action={weeklyAction(task)}
                />
              );
            })}
      </div>

      {error ? <p className="dailyError">{t.dailyClaimError}</p> : null}
      <p className="dailyReset">{t.dailyResetIn.replace("{time}", formatCountdown(secondsLeft))}</p>
    </Dialog>
  );
}

/** Kalendāra ikona (viens `currentColor` ceļš — token-krāsojas ar tēmu; pulsē caur CSS klasi). */
export function DailyTasksIcon() {
  return (
    <svg viewBox="0 0 640 640" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M224 64C241.7 64 256 78.3 256 96L256 128L384 128L384 96C384 78.3 398.3 64 416 64C433.7 64 448 78.3 448 96L448 128L480 128C515.3 128 544 156.7 544 192L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 192C96 156.7 124.7 128 160 128L192 128L192 96C192 78.3 206.3 64 224 64zM160 304L160 336C160 344.8 167.2 352 176 352L208 352C216.8 352 224 344.8 224 336L224 304C224 295.2 216.8 288 208 288L176 288C167.2 288 160 295.2 160 304zM288 304L288 336C288 344.8 295.2 352 304 352L336 352C344.8 352 352 344.8 352 336L352 304C352 295.2 344.8 288 336 288L304 288C295.2 288 288 295.2 288 304zM432 288C423.2 288 416 295.2 416 304L416 336C416 344.8 423.2 352 432 352L464 352C472.8 352 480 344.8 480 336L480 304C480 295.2 472.8 288 464 288L432 288zM160 432L160 464C160 472.8 167.2 480 176 480L208 480C216.8 480 224 472.8 224 464L224 432C224 423.2 216.8 416 208 416L176 416C167.2 416 160 423.2 160 432zM304 416C295.2 416 288 423.2 288 432L288 464C288 472.8 295.2 480 304 480L336 480C344.8 480 352 472.8 352 464L352 432C352 423.2 344.8 416 336 416L304 416zM416 432L416 464C416 472.8 423.2 480 432 480L464 480C472.8 480 480 472.8 480 464L480 432C480 423.2 472.8 416 464 416L432 416C423.2 416 416 423.2 416 432z" />
    </svg>
  );
}
