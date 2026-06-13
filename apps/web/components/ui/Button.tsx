"use client";

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "text" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly iconOnly?: boolean;
}

/**
 * Atkārtoti lietojama poga (Fāze 3 primitīvs). TIKAI prezentācija — biznesa
 * loģika paliek `onClick` izsaucējā (CLAUDE.md §1). Stils dzīvo `ui-button.css`;
 * variantu/izmēru/stāvokļus izsaka data-atribūti (sadursmju-droši pret esošajām
 * globālajām `.mp*` pogu klasēm).
 *
 * `loading` padara pogu nedarbīgu tieši tāpat kā `disabled` (klikšķi bloķēti caur
 * native `disabled`) un paziņo `aria-busy`. Papildu izkārtojuma klases nodod caur
 * `className` — tās pievieno bāzes `uiButton` klasei, nevis to aizstāj.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  iconOnly = false,
  disabled = false,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={className ? `uiButton ${className}` : "uiButton"}
      data-variant={variant}
      data-size={size}
      data-icon-only={iconOnly || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="uiButtonSpinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
