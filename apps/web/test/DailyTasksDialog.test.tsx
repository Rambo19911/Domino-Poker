// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DailyTasksDialog } from "../components/DailyTasksDialog";
import type { DailyClaimView, DailyTasksView } from "../lib/daily/dailyApi";
import type { WeeklyTasksView } from "../lib/weekly/weeklyApi";
import { en } from "../lib/locales/en";
import type { AudioSettings } from "../lib/useAudioSettings";

const audio = { play: vi.fn() } as unknown as AudioSettings;

const STATE: DailyTasksView = {
  serverDay: "20260710",
  secondsUntilReset: 3661, // 01:01:01
  anyClaimable: true,
  tasks: [
    { id: "win10_medium", difficulty: "medium", requiredRounds: 10, rewardCoins: 2000, order: 1, progress: 1, claimed: false, unlocked: true, claimable: true },
    { id: "win20_hard", difficulty: "hard", requiredRounds: 20, rewardCoins: 4000, order: 2, progress: 0, claimed: false, unlocked: false, claimable: false },
    { id: "win30_epic", difficulty: "epic", requiredRounds: 30, rewardCoins: 8000, order: 3, progress: 0, claimed: false, unlocked: false, claimable: false },
    { id: "win50_epic", difficulty: "epic", requiredRounds: 50, rewardCoins: 16000, order: 4, progress: 0, claimed: false, unlocked: false, claimable: false }
  ]
};

const WEEKLY_STATE: WeeklyTasksView = {
  serverWeek: "20260706",
  secondsUntilReset: 3661,
  anyClaimable: true,
  tasks: [
    { id: "mp_finish_20", kind: "mp_finish", threshold: 20, rewardCoins: 40000, hasPlayButton: false, progress: 12, claimed: false, claimable: false },
    { id: "sp_epic50_x2", kind: "sp_win", difficulty: "epic", exactRounds: 50, threshold: 2, rewardCoins: 100000, hasPlayButton: false, progress: 2, claimed: false, claimable: true },
    { id: "boss30", kind: "sp_win", difficulty: "epic", variant: "weekly_bosses", exactRounds: 30, threshold: 1, rewardCoins: 150000, hasPlayButton: true, progress: 0, claimed: false, claimable: false },
    { id: "boss50", kind: "sp_win", difficulty: "epic", variant: "weekly_bosses", exactRounds: 50, threshold: 1, rewardCoins: 400000, hasPlayButton: true, progress: 0, claimed: false, claimable: false }
  ]
};

type Props = Parameters<typeof DailyTasksDialog>[0];

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    audio,
    labels: en,
    state: STATE,
    claim: vi.fn(),
    weeklyState: WEEKLY_STATE,
    weeklyClaim: vi.fn(),
    onPlayWeekly: vi.fn(),
    onBalanceChange: vi.fn(),
    onClose: vi.fn(),
    ...overrides
  };
  return { props, ...render(<DailyTasksDialog {...props} />) };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DailyTasksDialog — daily tab", () => {
  it("renders all four daily tasks with their goal text and reward amounts", () => {
    renderDialog();
    expect(screen.getByText("Win a game with 10 rounds on Medium")).toBeTruthy();
    expect(screen.getByText("Win a game with 50 rounds on Epic")).toBeTruthy();
    expect(screen.getByText(/2[,.\s]?000/u)).toBeTruthy();
    expect(screen.getByText(/16[,.\s]?000/u)).toBeTruthy();
    expect(screen.getByText(/01:01:01/u)).toBeTruthy();
  });

  it("shows a Claim button only for a claimable task; locked tasks show the Locked badge", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: en.dailyClaim })).toBeTruthy();
    expect(screen.getAllByText(en.dailyLocked)).toHaveLength(3);
  });

  it("claims a task, applies the new balance and does not error on success", async () => {
    const claimResult: DailyClaimView = {
      awarded: 2000,
      balance: 7000,
      alreadyClaimed: false,
      state: { ...STATE, tasks: STATE.tasks.map((t) => (t.id === "win10_medium" ? { ...t, claimed: true, claimable: false } : t)) }
    };
    const claim = vi.fn().mockResolvedValue(claimResult);
    const onBalanceChange = vi.fn();
    renderDialog({ claim, onBalanceChange });
    fireEvent.click(screen.getByRole("button", { name: en.dailyClaim }));
    await waitFor(() => expect(claim).toHaveBeenCalledWith("win10_medium"));
    await waitFor(() => expect(onBalanceChange).toHaveBeenCalledWith(7000));
    expect(screen.queryByText(en.dailyClaimError)).toBeNull();
    expect(audio.play).toHaveBeenCalledWith("coinClaim");
  });

  it("opens the info tooltip only on ? click (closed by default, not auto-open)", () => {
    renderDialog();
    const infoBtn = screen.getByRole("button", { name: en.dailyInfoLabel });
    expect(infoBtn.getAttribute("aria-controls")).toBe("daily-info-tip");
    const tip = document.getElementById("daily-info-tip")!;
    expect(tip.getAttribute("data-open")).toBe("false");
    fireEvent.click(infoBtn);
    expect(tip.getAttribute("data-open")).toBe("true");
    expect(tip.textContent).toContain(en.dailyInfoConditions);
    fireEvent.click(infoBtn);
    expect(tip.getAttribute("data-open")).toBe("false");
  });

  it("shows an error when the claim fails", async () => {
    const claim = vi.fn().mockResolvedValue(null);
    renderDialog({ claim });
    fireEvent.click(screen.getByRole("button", { name: en.dailyClaim }));
    await waitFor(() => expect(screen.getByText(en.dailyClaimError)).toBeTruthy());
  });

  it("shows the Claimed badge for an already-claimed task", () => {
    const claimed: DailyTasksView = {
      ...STATE,
      tasks: STATE.tasks.map((t, i) => (i === 0 ? { ...t, claimed: true, claimable: false } : t))
    };
    renderDialog({ state: claimed });
    expect(screen.getByText(en.dailyClaimed)).toBeTruthy();
  });
});

describe("DailyTasksDialog — weekly tab", () => {
  it("switches to the weekly tab and renders count-based goals + progress", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: en.weeklyTab }));
    expect(screen.getByText("Play and finish 20 multiplayer games")).toBeTruthy();
    expect(screen.getByText("Take a winning place in a 30-round game")).toBeTruthy();
    // Count-based progress (mp 12/20), nevis binārais (progresa josla + nozīme abi to rāda).
    expect(screen.getAllByText("12/20").length).toBeGreaterThan(0);
  });

  it("shows a Play button for boss tasks and Claim for a claimable weekly task", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: en.weeklyTab }));
    // Divi boss uzdevumi ar [Play] pogu.
    expect(screen.getAllByRole("button", { name: en.weeklyPlay })).toHaveLength(2);
    // sp_epic50_x2 ir claimable → Claim poga.
    expect(screen.getByRole("button", { name: en.dailyClaim })).toBeTruthy();
  });

  it("Play launches the special room with the task's exact round count", () => {
    const onPlayWeekly = vi.fn();
    renderDialog({ onPlayWeekly });
    fireEvent.click(screen.getByRole("button", { name: en.weeklyTab }));
    fireEvent.click(screen.getAllByRole("button", { name: en.weeklyPlay })[0]!);
    expect(onPlayWeekly).toHaveBeenCalledWith(30); // boss30
  });
});
