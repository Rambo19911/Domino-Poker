"use client";

import {
  createContext,
  createElement,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

/**
 * Maiga dialogu parādīšanās/pazušana (Codex-validēts Radix-Presence stila pattern,
 * bez bibliotēkas). React atmontē komponenti uzreiz, tāpēc bez šī izejas (exit)
 * animācija nekad nenospēlētu. `Presence` patur bērnu mountētu visu `closing` fāzi.
 *
 * Robeža ir IZSAUKUMA VIETĀ (virs datu piekļuves), nevis `Dialog` iekšienē, jo
 * dialogi ir datu-saistīti (`{dati && <X dati=.../>}`): aizverot `dati` kļūst `null`.
 * `Presence` renderē IESALDĒTO pēdējo atvērto elementu, tāpēc komponente nekad
 * neizpildās ar `null` datiem (React elementa IZVEIDE neizsauc komponenti — tikai
 * renderēšana; mēs renderējam kešoto veco elementu).
 */

export type PresenceStatus = "open" | "closing";

/** Noklusējums "open", lai `Dialog` BEZ `Presence` ietinēja strādā kā agrāk (tikai
 *  ienākšana, bez izejas) — pilnīgi atpakaļsaderīgi. */
export const PresenceContext = createContext<PresenceStatus>("open");

/** Sinhronizēts ar dialoga izejas CSS (`--motion-base`). Lokāla konstante apzināti —
 *  CSS tokena nolasīšana runtime (getComputedStyle) būtu lieka un riskanta SSR laikā. */
export const DIALOG_EXIT_MS = 200;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Atgriež `mounted` (vai vispār renderēt) un `status` ("open" | "closing").
 * `closing` tiek turēts `exitMs` ms, tad `mounted` kļūst `false`.
 * Reduced-motion → tūlītēja atmontēšana bez aiztures.
 */
export function usePresence(
  open: boolean,
  exitMs: number = DIALOG_EXIT_MS
): { mounted: boolean; status: PresenceStatus } {
  const [mounted, setMounted] = useState(open);
  const [status, setStatus] = useState<PresenceStatus>(open ? "open" : "closing");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      // Reopen-during-closing: atcel gaidošo izejas taimeri un atgriezies "open".
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setMounted(true);
      setStatus("open");
      return undefined;
    }

    if (!mounted) return undefined;

    if (prefersReducedMotion() || exitMs <= 0) {
      setMounted(false);
      return undefined;
    }

    setStatus("closing");
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setMounted(false);
    }, exitMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, mounted, exitMs]);

  return { mounted, status };
}

/**
 * Ietinējs, kas patur bērnu mountētu izejas animācijas laikā.
 * Lieto izsaukuma vietā: `<Presence open={cond}><SomeDialog .../></Presence>`.
 */
export function Presence({
  open,
  exitMs,
  children
}: {
  readonly open: boolean;
  readonly exitMs?: number;
  readonly children: ReactNode;
}): ReactNode {
  const { mounted, status } = usePresence(open, exitMs);

  // Kešo bērnu elementu TIKAI kamēr atvērts un satura ir; aizverot ignorē jauno null.
  const cachedRef = useRef<ReactNode>(children);
  if (open && children != null && children !== false) {
    cachedRef.current = children;
  }

  if (!mounted) return null;

  return createElement(
    PresenceContext.Provider,
    { value: status },
    open ? children : cachedRef.current
  );
}
