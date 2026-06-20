"use client";

import { useEffect, useRef, useState } from "react";

import { CoinIcon } from "./CoinIcon";

/** Count-up ilgums (saskan ar `--motion-slow` tonalitāti; nedaudz garāks skaitlim). */
const COUNT_UP_MS = 600;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/**
 * Animēts skaitļa count-up no IEPRIEKŠĒJĀS uz jauno vērtību (RAF, bez bibliotēkas).
 * Pirmajā renderī rāda vērtību uzreiz (nav trokšņa pie katras lobby ielādes);
 * animē tikai, kad vērtība MAINĀS (piem. pēc uzvaras). `prefers-reduced-motion` →
 * lec uzreiz galarezultātā.
 */
function useCountUp(target: number): number {
  const [display, setDisplay] = useState(target);
  // Vienmēr tur PĒDĒJO attēloto vērtību, lai nākamā izmaiņa animētu no tās, kur
  // skaitlis vizuāli ir (arī ja mainās count-up vidū) — bez pārlēkšanas.
  const displayRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = displayRef.current;
    if (from === target || prefersReducedMotion()) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number): void => {
      const p = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out
      const next = Math.round(from + (target - from) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target]);

  return display;
}

/**
 * Zelta monētu bilance: monētas ikona + animēts skaitlis. Token-krāsots (`--coin`).
 * `label` ir lokalizēts pieejamības (aria) nolūkam.
 */
export function CoinBalance({
  value,
  label,
  className
}: {
  readonly value: number;
  readonly label: string;
  readonly className?: string;
}) {
  const display = useCountUp(value);
  return (
    <span
      className={className ? `coinBalance ${className}` : "coinBalance"}
      aria-label={`${label}: ${value}`}
    >
      <CoinIcon className="coinBalanceIcon" />
      <span className="coinBalanceValue">{display.toLocaleString()}</span>
    </span>
  );
}
