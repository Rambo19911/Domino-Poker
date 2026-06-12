"use client";

import { useEffect, useRef, useState } from "react";

import type { ClientView } from "./clientView";

const ERROR_TOAST_MS = 2400;

/**
 * Servera noraidīts gājiens/solījums → īslaicīgs toasts (lokālais state nemainās).
 * `lastError` salīdzina pēc OBJEKTA ATSAUCES (nevis ziņas/koda), lai katrs jauns
 * ERROR pārstartē taimeri, bet atkārtots render ar to pašu kļūdu neuzbāž toastu.
 *
 * Uzvedība identiska iepriekšējam inline efektam `MpGameTable`; cleanup notīra
 * taimeri unmount laikā.
 */
export function useTurnErrorToast(lastError: ClientView["lastError"]): string | null {
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const lastErrorRef = useRef<ClientView["lastError"]>(undefined);
  const errorTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (lastError && lastError !== lastErrorRef.current) {
      lastErrorRef.current = lastError;
      setErrorToast(lastError.message);
      if (errorTimerRef.current !== undefined) window.clearTimeout(errorTimerRef.current);
      errorTimerRef.current = window.setTimeout(() => setErrorToast(null), ERROR_TOAST_MS);
    }
  }, [lastError]);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current !== undefined) window.clearTimeout(errorTimerRef.current);
    };
  }, []);

  return errorToast;
}
