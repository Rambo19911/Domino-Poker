"use client";

import { useEffect, useRef, useState } from "react";

import type { MpGameTableView, MpTrickPlay } from "./gameTableView";

/** Cik ilgi klients aiztur pabeigto triku (≤ servera `trickPauseMs`, lai nelēkā). */
const TRICK_FREEZE_MS = 1500;

type TrickFreezeInput = Pick<MpGameTableView, "completedTrickCount" | "lastCompletedTrick" | "trick">;

export interface TrickFreeze {
  /** Vai pašlaik rādām aizturēto (iesaldēto) pabeigto triku. */
  readonly frozen: boolean;
  /** Triks, ko rādīt: aizturē pēdējo pabeigto, citādi dzīvo `table.trick`. */
  readonly displayTrick: readonly MpTrickPlay[];
}

/**
 * Triku-pabeigšanas aizture: serveris pacē gājienus pa vienam, bet pabeidzot
 * triku snapshot uzreiz notīra galdu (core `completeTrick`). Tāpēc klients
 * īslaicīgi aiztur pēdējo pabeigto triku, lai paspēj redzēt visus 4 kauliņus
 * (servera `trickPauseMs` ≥ šai aizturei, lai nākamais gājiens neielaužas).
 *
 * Uzvedība identiska iepriekšējam inline efektam `MpGameTable`: nesaldē uz
 * pirmo renderi (ref inicializēts ar tekošo skaitli); saldē tikai tad, kad
 * `completedTrickCount` pieaug; cleanup notīra taimeri unmount laikā.
 */
export function useTrickFreeze(table: TrickFreezeInput): TrickFreeze {
  const [frozenTrick, setFrozenTrick] = useState<readonly MpTrickPlay[] | null>(null);
  const prevCompletedRef = useRef(table.completedTrickCount);
  const freezeTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (table.completedTrickCount > prevCompletedRef.current && table.lastCompletedTrick) {
      setFrozenTrick(table.lastCompletedTrick);
      if (freezeTimerRef.current !== undefined) window.clearTimeout(freezeTimerRef.current);
      freezeTimerRef.current = window.setTimeout(() => setFrozenTrick(null), TRICK_FREEZE_MS);
    }
    prevCompletedRef.current = table.completedTrickCount;
  }, [table.completedTrickCount, table.lastCompletedTrick]);

  useEffect(() => {
    return () => {
      if (freezeTimerRef.current !== undefined) window.clearTimeout(freezeTimerRef.current);
    };
  }, []);

  const frozen = frozenTrick !== null;
  const displayTrick = frozen && frozenTrick ? frozenTrick : table.trick;
  return { frozen, displayTrick };
}
