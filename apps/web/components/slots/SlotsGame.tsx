"use client";

import { useEffect, useRef } from "react";

import type { LineBet } from "@domino-poker/core/slots";

import { apiSlotSpin, readErrorBalance } from "../../lib/slots/slotsApi";
import { GameApp } from "./app/GameApp";
import { GameController, type SpinResponse } from "./app/GameController";
import { GameStore } from "./app/GameStore";
import { createInitialState } from "./app/GameController";
import { toSpinResult } from "./spinAdapter";
import type { SoundSettings } from "./audio/SoundPlayer";

import "./styles/reset.css";
import "./styles/app.css";
import "./styles/dialogs.css";

export interface SlotsGameProps {
  /** Bearer tokens; `null` nozīmē, ka sesija ir beigusies. */
  readonly getToken: () => string | null;
  /** Konta bilance, ar ko sākt; serveris paliek autoritāte. */
  readonly initialBalance: number;
  /** Autoritatīvā bilance uz augšu lobijam pēc katra norēķina. */
  readonly onBalanceChange: (balance: number) => void;
  /** Globālie skaņas iestatījumi (mute/skaļums) no `useAudioSettings`. */
  readonly getSoundSettings: () => SoundSettings;
}

/**
 * Domino Slots PixiJS spēle React komponentē.
 *
 * Montāža ir `ref`-piederīga (standalone versija hardkodēja `#app`), un viss dzīves
 * cikls ir atcelšanas-drošs: `Application.init` un assets ielāde ir asinhronas, tāpēc
 * React Strict Mode dubultā montāža vai lietotājs, kas aizver dialogu ielādes laikā,
 * citādi atstātu otru canvas un noplūdušus klausītājus.
 *
 * Šo komponenti IELĀDĒ tikai dinamiski (`ssr: false`) — sk. `SlotsGameLoader`.
 */
export default function SlotsGame({
  getToken,
  initialBalance,
  onBalanceChange,
  getSoundSettings
}: SlotsGameProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Callback-i tiek lasīti caur ref, lai efekts nepārstartētu spēli, kad vecāks
  // pārrenderējas — Pixi restarts nozīmētu 4,5 MiB assets ielādi no jauna.
  const latest = useRef({ getToken, onBalanceChange, getSoundSettings });
  latest.current = { getToken, onBalanceChange, getSoundSettings };

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    let cancelled = false;
    let app: GameApp | null = null;

    const store = new GameStore(createInitialState());
    const controller = new GameController({
      store,
      createSpinId: () => crypto.randomUUID(),
      onBalanceChange: (balance) => latest.current.onBalanceChange(balance),
      spin: async (spinId, lineBet): Promise<SpinResponse> => {
        const token = latest.current.getToken();
        if (token === null) return { ok: false, reason: "unauthorized" };
        const result = await apiSlotSpin(token, spinId, lineBet);
        if (result.ok) {
          return {
            ok: true,
            value: {
              balance: result.data.balance,
              payout: result.data.spin.payout,
              result: toSpinResult(result.data.spin)
            }
          };
        }
        // 402 nes autoritatīvo bilanci — vienīgais ceļš, kā izlabot novecojušu lokālo
        // skaitli, kad grieziens netika pieņemts (T7.7).
        if (result.status === 402) {
          const authoritative = readErrorBalance(result.body);
          return {
            ok: false,
            reason: "insufficient",
            ...(authoritative === undefined ? {} : { balance: authoritative })
          };
        }
        if (result.status === 401) return { ok: false, reason: "unauthorized" };
        if (result.status === 429) return { ok: false, reason: "rate_limited" };
        if (result.status === 0) return { ok: false, reason: "network" };
        return { ok: false, reason: "failed" };
      }
    });

    void GameApp.start({
      host,
      store,
      controller,
      initialBalance,
      getSoundSettings: () => latest.current.getSoundSettings(),
      isCancelled: () => cancelled
    })
      .then((started) => {
        if (cancelled) {
          started?.destroy();
          return;
        }
        app = started;
      })
      .catch((error: unknown) => {
        console.error("Slot game failed to start", error);
      });

    return () => {
      cancelled = true;
      controller.dispose();
      app?.destroy();
      app = null;
      // Pixi canvas + DOM slāņi tika pievienoti host'am imperatīvi, tāpēc React
      // par tiem nezina; teardown pēc `destroy()` atstāj tīru konteineru.
      host.replaceChildren();
    };
    // `initialBalance` apzināti NAV atkarībās: tā ir tikai sēkla. Pārstartēšana
    // nozīmētu 4,5 MiB assets ielādi no jauna. Dialogs ir modāls, tāpēc, kamēr spēle
    // ir atvērta, konta bilanci maina TIKAI pati spēle — sinhronizācija nav vajadzīga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="slotsGameRoot" />;
}

/** Ērts lineBet tips atkārtotai lietošanai izsaukuma vietās. */
export type { LineBet };
