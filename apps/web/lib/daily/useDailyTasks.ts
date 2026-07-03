"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  apiClaimDailyTask,
  apiDailyTasks,
  type DailyClaimView,
  type DailyTasksView
} from "./dailyApi";

/**
 * Dienas uzdevumu stāvokļa hooks lobija ekrānam. Ielasa stāvokli, kad lietotājs ir
 * autentificēts (un pie mount + kad `refreshSignal` mainās — AppShell to palielina PĒC
 * `/sp/complete` pabeigšanas, lai progress ir svaigs, pat ja lobijs remontējās agrāk).
 * Anonīmiem: no-op (nekas netiek ielasīts, ikona slēpta). Countdown NETIEK re-fetchots
 * (Codex): `secondsUntilReset` atskaitās lokāli dialogā.
 *
 * Secības sargs (`reqRef`): lēns vecs pieprasījums (piem. pirms izlogošanās/claim) NEDRĪKST
 * pārrakstīt jaunāku stāvokli — piemēro tikai jaunākā izsaukuma rezultātu.
 */
export function useDailyTasks(
  getToken: () => string | undefined,
  enabled: boolean,
  refreshSignal = 0
) {
  const [state, setState] = useState<DailyTasksView | null>(null);
  const reqRef = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const token = getToken();
    const id = ++reqRef.current;
    if (!token) {
      setState(null);
      return;
    }
    const res = await apiDailyTasks(token);
    if (id !== reqRef.current) {
      return; // novecojis — jaunāks izsaukums jau notiek/pabeidzās
    }
    if (res.ok) {
      setState(res.data);
    }
  }, [getToken]);

  useEffect(() => {
    if (enabled) {
      // `refresh` palielina `reqRef` sākumā → jebkurš iepriekšējais lidojumā esošais
      // fetch (piem. no ātras dep izmaiņas) kļūst novecojis un neuzraksta pāri.
      void refresh();
    } else {
      reqRef.current++; // izlogošanās → atzīmē lidojumā esošos par novecojušiem
      setState(null);
    }
  }, [enabled, refreshSignal, refresh]);

  /** Savāc balvu; pie veiksmes atjaunina stāvokli un atgriež rezultātu (jaunā bilance). */
  const claim = useCallback(
    async (taskId: string): Promise<DailyClaimView | null> => {
      const token = getToken();
      if (!token) {
        return null;
      }
      const id = ++reqRef.current;
      const res = await apiClaimDailyTask(token, taskId);
      if (res.ok) {
        if (id === reqRef.current) {
          setState(res.data.state);
        }
        return res.data;
      }
      // 409 (locked/not_met) u.c. — atsvaidzina, lai rāda servera patieso stāvokli.
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
