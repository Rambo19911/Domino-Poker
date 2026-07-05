"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  apiClaimWeeklyTask,
  apiWeeklyTasks,
  type WeeklyClaimView,
  type WeeklyTasksView
} from "./weeklyApi";

/**
 * Nedēļas uzdevumu stāvokļa hooks lobija ekrānam. Mirror `useDailyTasks`. Ielasa, kad lietotājs
 * ir autentificēts (mount + kad `refreshSignal` mainās). SP progress: AppShell palielina
 * `refreshSignal` PĒC `/sp/complete` (lobijs var būt remontējies pirms ieraksta). MP progress:
 * uzdevumu dialogs dzīvo TIKAI galvenajā lobby, un MP spēle prasa pāriet uz `mp-lobby` ekrānu →
 * atgriežoties LobbyScreen remountējas un šis hooks fetcho no jauna (nav atsevišķa MP `GAME_OVER`
 * bump). Anonīmiem: no-op. Countdown atskaitās lokāli dialogā. Secības sargs (`reqRef`): lēns vecs
 * pieprasījums NEDRĪKST pārrakstīt jaunāku stāvokli.
 */
export function useWeeklyTasks(
  getToken: () => string | undefined,
  enabled: boolean,
  refreshSignal = 0
) {
  const [state, setState] = useState<WeeklyTasksView | null>(null);
  const reqRef = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const token = getToken();
    const id = ++reqRef.current;
    if (!token) {
      setState(null);
      return;
    }
    const res = await apiWeeklyTasks(token);
    if (id !== reqRef.current) {
      return; // novecojis — jaunāks izsaukums jau notiek/pabeidzās
    }
    if (res.ok) {
      setState(res.data);
    }
  }, [getToken]);

  useEffect(() => {
    if (enabled) {
      void refresh();
    } else {
      reqRef.current++; // izlogošanās → atzīmē lidojumā esošos par novecojušiem
      setState(null);
    }
  }, [enabled, refreshSignal, refresh]);

  /** Savāc balvu; pie veiksmes atjaunina stāvokli un atgriež rezultātu (jaunā bilance). */
  const claim = useCallback(
    async (taskId: string): Promise<WeeklyClaimView | null> => {
      const token = getToken();
      if (!token) {
        return null;
      }
      const id = ++reqRef.current;
      const res = await apiClaimWeeklyTask(token, taskId);
      if (res.ok) {
        if (id === reqRef.current) {
          setState(res.data.state);
        }
        return res.data;
      }
      await refresh();
      return null;
    },
    [getToken, refresh]
  );

  return {
    state,
    anyClaimable: state?.anyClaimable ?? false,
    claim,
    refresh
  };
}
