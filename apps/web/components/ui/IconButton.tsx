"use client";

import type { ButtonHTMLAttributes } from "react";

export type IconButtonSize = "sm" | "md";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Obligāts pieejamais nosaukums (ikon-poga renderē tikai ikonu) — `aria-label`. */
  readonly label: string;
  readonly size?: IconButtonSize;
  readonly loading?: boolean;
}

/**
 * Atkārtoti lietojama ikon-poga (Fāze 3 primitīvs). TIKAI prezentācija — biznesa
 * loģika paliek `onClick` izsaucējā (CLAUDE.md §1). Neitrāls/smalks stils (sakrīt ar
 * vēsturisko `.iconButton`), plus tokenu-balstīti hover/active/`:focus-visible`/disabled
 * stāvokļi. `label` ir obligāts (ikon-pogai jābūt pieejamam nosaukumam).
 *
 * `loading` padara pogu nedarbīgu tāpat kā `disabled` un aizvieto ikonu ar spinneri.
 * Papildu izkārtojuma/pozīcijas klases nodod caur `className` — tās pievieno bāzes
 * `uiIconButton` klasei, nevis to aizstāj.
 */
export function IconButton({
  label,
  size = "md",
  loading = false,
  disabled = false,
  type = "button",
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={className ? `uiIconButton ${className}` : "uiIconButton"}
      data-size={size}
      aria-label={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="uiButtonSpinner" aria-hidden="true" /> : children}
    </button>
  );
}
