// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DailyTasksDialog } from "../components/DailyTasksDialog";
import type { DailyClaimView, DailyTasksView } from "../lib/daily/dailyApi";
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DailyTasksDialog", () => {
  it("renders all four tasks with their goal text and reward amounts", () => {
    render(
      <DailyTasksDialog
        audio={audio}
        labels={en}
        state={STATE}
        claim={vi.fn()}
        onBalanceChange={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("Win a game with 10 rounds on Medium")).toBeTruthy();
    expect(screen.getByText("Win a game with 50 rounds on Epic")).toBeTruthy();
    // Balvas summa (atdalītājs atkarīgs no vides — tolerants regex).
    expect(screen.getByText(/2[,.\s]?000/u)).toBeTruthy();
    expect(screen.getByText(/16[,.\s]?000/u)).toBeTruthy();
    // Countdown attēlots (HH:MM:SS no secondsUntilReset).
    expect(screen.getByText(/01:01:01/u)).toBeTruthy();
  });

  it("shows a Claim button only for a claimable task; locked tasks show the Locked badge", () => {
    render(
      <DailyTasksDialog audio={audio} labels={en} state={STATE} claim={vi.fn()} onBalanceChange={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: en.dailyClaim })).toBeTruthy();
    // 3 bloķēti uzdevumi → 3 "Locked" nozīmītes.
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
    render(
      <DailyTasksDialog audio={audio} labels={en} state={STATE} claim={claim} onBalanceChange={onBalanceChange} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: en.dailyClaim }));
    await waitFor(() => expect(claim).toHaveBeenCalledWith("win10_medium"));
    await waitFor(() => expect(onBalanceChange).toHaveBeenCalledWith(7000));
    expect(screen.queryByText(en.dailyClaimError)).toBeNull();
    // Balvai atskaņo īpašo monētu skaņu.
    expect(audio.play).toHaveBeenCalledWith("coinClaim");
  });

  it("opens the info tooltip only on ? click (closed by default, not auto-open)", () => {
    render(
      <DailyTasksDialog audio={audio} labels={en} state={STATE} claim={vi.fn()} onBalanceChange={vi.fn()} onClose={vi.fn()} />
    );
    const infoBtn = screen.getByRole("button", { name: en.dailyInfoLabel });
    expect(infoBtn.getAttribute("aria-controls")).toBe("daily-info-tip");
    const tip = document.getElementById("daily-info-tip")!;
    // Sākotnēji AIZVĒRTS (dialoga atvēršana to NEatver automātiski).
    expect(tip.getAttribute("data-open")).toBe("false");
    expect(tip.getAttribute("aria-hidden")).toBe("true");
    expect(infoBtn.getAttribute("aria-expanded")).toBe("false");
    // Klikšķis uz "?" to atver; satur visus 3 nosacījumus.
    fireEvent.click(infoBtn);
    expect(tip.getAttribute("data-open")).toBe("true");
    expect(infoBtn.getAttribute("aria-expanded")).toBe("true");
    expect(tip.textContent).toContain(en.dailyInfoConditions);
    expect(tip.textContent).toContain(en.dailyInfoDifficulty);
    expect(tip.textContent).toContain(en.dailyInfoSpOnly);
    // Atkārtots klikšķis aizver.
    fireEvent.click(infoBtn);
    expect(tip.getAttribute("data-open")).toBe("false");
  });

  it("shows an error when the claim fails", async () => {
    const claim = vi.fn().mockResolvedValue(null);
    render(
      <DailyTasksDialog audio={audio} labels={en} state={STATE} claim={claim} onBalanceChange={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: en.dailyClaim }));
    await waitFor(() => expect(screen.getByText(en.dailyClaimError)).toBeTruthy());
  });

  it("shows the Claimed badge for an already-claimed task", () => {
    const claimed: DailyTasksView = {
      ...STATE,
      tasks: STATE.tasks.map((t, i) => (i === 0 ? { ...t, claimed: true, claimable: false } : t))
    };
    render(
      <DailyTasksDialog audio={audio} labels={en} state={claimed} claim={vi.fn()} onBalanceChange={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText(en.dailyClaimed)).toBeTruthy();
  });
});
