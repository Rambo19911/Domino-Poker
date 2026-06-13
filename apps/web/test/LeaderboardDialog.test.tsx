// @vitest-environment happy-dom
import type { LeaderboardResponse } from "@domino-poker/shared";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LeaderboardDialog } from "../components/LeaderboardDialog";
import { apiLeaderboard, type AuthResult } from "../lib/auth/authApi";
import { en } from "../lib/locales/en";
import type { AudioSettings } from "../lib/useAudioSettings";

vi.mock("../lib/auth/authApi", async (importActual) => {
  const actual = await importActual<typeof import("../lib/auth/authApi")>();
  return { ...actual, apiLeaderboard: vi.fn() };
});

const audio = { play: vi.fn() } as unknown as AudioSettings;

function entry(rank: number, username: string, wins: number, losses: number) {
  const games = wins + losses;
  return {
    rank,
    username,
    avatar: "avatar-01",
    wins,
    losses,
    gamesPlayed: games,
    winRate: games > 0 ? wins / games : 0,
    language: "en" as const
  };
}

function resolve(data: LeaderboardResponse): void {
  vi.mocked(apiLeaderboard).mockResolvedValue({ ok: true, data } as AuthResult<LeaderboardResponse>);
}

function renderDialog() {
  return render(
    <LeaderboardDialog audio={audio} labels={en} getToken={() => undefined} onClose={vi.fn()} />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LeaderboardDialog", () => {
  it("renders ranked entries with nickname, win rate, language and a truncatable name title", async () => {
    resolve({
      entries: [entry(1, "Alice", 9, 1), entry(2, "BobWithAVeryLongNickname", 6, 4)],
      me: { status: "anonymous" },
      minGames: 10
    });
    renderDialog();

    expect(await screen.findByText("Alice")).toBeTruthy();
    // Win rate rendered as a percentage.
    expect(screen.getByText("90%")).toBeTruthy();
    // Long nickname keeps its full value in the DOM (CSS truncates) via title attribute.
    const longName = screen.getByText("BobWithAVeryLongNickname");
    expect(longName.getAttribute("title")).toBe("BobWithAVeryLongNickname");
  });

  it("shows the 'not ranked yet' panel with the threshold and the player's game count", async () => {
    resolve({
      entries: [entry(1, "Alice", 9, 1)],
      me: { status: "unranked", gamesPlayed: 4 },
      minGames: 10
    });
    renderDialog();

    await screen.findByText("Alice");
    expect(screen.getByText(en.leaderboardNotRanked)).toBeTruthy();
    // {min}/{games} interpolated from the response.
    expect(screen.getByText(/at least 10 games/i)).toBeTruthy();
    expect(screen.getByText(/you have 4/i)).toBeTruthy();
  });

  it("still shows the self panel when the leaderboard is empty (unranked viewer)", async () => {
    resolve({ entries: [], me: { status: "unranked", gamesPlayed: 2 }, minGames: 10 });
    renderDialog();

    expect(await screen.findByText(en.leaderboardEmpty)).toBeTruthy();
    expect(screen.getByText(en.leaderboardNotRanked)).toBeTruthy();
    expect(screen.getByText(/you have 2/i)).toBeTruthy();
  });

  it("renders an error state with a retry control", async () => {
    vi.mocked(apiLeaderboard).mockResolvedValue({ ok: false, status: 500, error: "request_failed" });
    renderDialog();

    expect(await screen.findByText(en.leaderboardError)).toBeTruthy();
    expect(screen.getByRole("button", { name: en.leaderboardRetry })).toBeTruthy();
  });

  it("prompts an anonymous viewer to log in", async () => {
    resolve({ entries: [entry(1, "Alice", 9, 1)], me: { status: "anonymous" }, minGames: 10 });
    renderDialog();

    await screen.findByText("Alice");
    expect(screen.getByText(en.leaderboardAnonymous)).toBeTruthy();
  });

  it("toggles the min-games info note from the '?' control", async () => {
    resolve({ entries: [entry(1, "Alice", 9, 1)], me: { status: "anonymous" }, minGames: 10 });
    renderDialog();

    await screen.findByText("Alice");
    expect(screen.queryByText(/keeps the ranking fair/i)).toBeNull();
    screen.getByRole("button", { name: en.leaderboardInfoLabel }).click();
    await waitFor(() => expect(screen.getByText(/keeps the ranking fair/i)).toBeTruthy());
  });
});
