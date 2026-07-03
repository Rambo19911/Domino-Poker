// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDailyTasks } from "../lib/daily/useDailyTasks";
import {
  apiClaimDailyTask,
  apiDailyTasks,
  type DailyClaimView,
  type DailyTasksView
} from "../lib/daily/dailyApi";
import type { AuthResult } from "../lib/auth/authApi";

vi.mock("../lib/daily/dailyApi", async (importActual) => {
  const actual = await importActual<typeof import("../lib/daily/dailyApi")>();
  return { ...actual, apiDailyTasks: vi.fn(), apiClaimDailyTask: vi.fn() };
});

function view(progress: number): DailyTasksView {
  return {
    serverDay: "20260703",
    secondsUntilReset: 1000,
    anyClaimable: progress >= 10,
    tasks: [
      { id: "win10_medium", difficulty: "medium", threshold: 10, rewardCoins: 2000, order: 1, progress, claimed: false, unlocked: true, claimable: progress >= 10 }
    ]
  };
}

function ok(data: DailyTasksView): AuthResult<DailyTasksView> {
  return { ok: true, data };
}

// Stabils getToken (kā `auth.getToken` reālajā app — useCallback), lai `refresh`
// nemainās katrā renderī un efekts neatkārtojas (citādi dubults fetch = testa artefakts).
const getToken = () => "tok";
const noToken = () => undefined;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useDailyTasks (game -> game end -> back to lobby -> available)", () => {
  it("does not fetch for anonymous (disabled) users", async () => {
    renderHook(() => useDailyTasks(noToken, false, 0));
    await Promise.resolve();
    expect(apiDailyTasks).not.toHaveBeenCalled();
  });

  it("fetches on mount when authed and exposes anyClaimable", async () => {
    vi.mocked(apiDailyTasks).mockResolvedValue(ok(view(5)));
    const { result } = renderHook(() => useDailyTasks(getToken, true, 0));
    await waitFor(() => expect(result.current.state).not.toBeNull());
    expect(apiDailyTasks).toHaveBeenCalledTimes(1);
    expect(result.current.anyClaimable).toBe(false);
  });

  it("refetches when refreshSignal changes (post-/sp/complete after returning to lobby)", async () => {
    // Pirmais fetch: 5/10 (spēle vēl nav ierakstīta). Otrais: 10/10 (pēc /sp/complete).
    vi.mocked(apiDailyTasks)
      .mockResolvedValueOnce(ok(view(5)))
      .mockResolvedValueOnce(ok(view(10)));

    const { result, rerender } = renderHook(
      ({ signal }: { signal: number }) => useDailyTasks(getToken, true, signal),
      { initialProps: { signal: 0 } }
    );
    await waitFor(() => expect(result.current.state?.tasks[0]?.progress).toBe(5));
    expect(result.current.anyClaimable).toBe(false);

    // AppShell palielina signālu pēc /sp/complete → lobija progress atsvaidzinās.
    rerender({ signal: 1 });
    await waitFor(() => expect(result.current.state?.tasks[0]?.progress).toBe(10));
    expect(result.current.anyClaimable).toBe(true);
    expect(apiDailyTasks).toHaveBeenCalledTimes(2);
  });

  it("claim updates state from the returned server state and reports the new balance", async () => {
    vi.mocked(apiDailyTasks).mockResolvedValue(ok(view(10)));
    const claimedState = { ...view(10), anyClaimable: false, tasks: [{ ...view(10).tasks[0]!, claimed: true, claimable: false }] };
    vi.mocked(apiClaimDailyTask).mockResolvedValue({
      ok: true,
      data: { awarded: 2000, balance: 7000, alreadyClaimed: false, state: claimedState }
    });

    const { result } = renderHook(() => useDailyTasks(getToken, true, 0));
    await waitFor(() => expect(result.current.state).not.toBeNull());

    let claimResult: DailyClaimView | null = null;
    await act(async () => {
      claimResult = await result.current.claim("win10_medium");
    });
    // Cast: TS sašaurina uz `null`, jo piešķīrums notiek `act` slēgumā (netiek izsekots).
    expect((claimResult as DailyClaimView | null)?.balance).toBe(7000);
    expect(result.current.state?.tasks[0]?.claimed).toBe(true);
    expect(result.current.anyClaimable).toBe(false);
  });

  it("sequence guard: a slow stale refresh does not overwrite a newer response", async () => {
    // Pirmais (signal 0) fetch ir LĒNS un atgriež 5; otrais (signal 1) ir ĀTRS un atgriež 10.
    // Ja lēnais pabeidzas pēdējais, secības sargs to atmet → paliek 10 (ne 5).
    let resolveSlow: ((v: AuthResult<DailyTasksView>) => void) | null = null;
    vi.mocked(apiDailyTasks)
      .mockImplementationOnce(
        () => new Promise<AuthResult<DailyTasksView>>((res) => { resolveSlow = res; })
      )
      .mockResolvedValueOnce(ok(view(10)));

    const { result, rerender } = renderHook(
      ({ signal }: { signal: number }) => useDailyTasks(getToken, true, signal),
      { initialProps: { signal: 0 } }
    );
    // Palaiž otro (ātro) fetch, kas atrisinās uzreiz.
    rerender({ signal: 1 });
    await waitFor(() => expect(result.current.state?.tasks[0]?.progress).toBe(10));
    // TAGAD atrisina pirmo (lēno, novecojušo) — tam NEDRĪKST pārrakstīt jaunāko.
    await act(async () => {
      resolveSlow?.(ok(view(5)));
      await Promise.resolve();
    });
    expect(result.current.state?.tasks[0]?.progress).toBe(10);
  });

  it("clears state when the user logs out (enabled -> false)", async () => {
    vi.mocked(apiDailyTasks).mockResolvedValue(ok(view(10)));
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDailyTasks(getToken, enabled, 0),
      { initialProps: { enabled: true } }
    );
    await waitFor(() => expect(result.current.state).not.toBeNull());
    rerender({ enabled: false });
    await waitFor(() => expect(result.current.state).toBeNull());
  });
});
