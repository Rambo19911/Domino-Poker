"use client";

import { useId } from "react";
import type { InputHTMLAttributes } from "react";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Redzams lauka nosaukums (saistīts ar `<input>` caur `htmlFor`/`id`). Ja nav —
      izsaucējs nodod `aria-label` caur rest (piem. čata ievade bez redzama label). */
  readonly label?: string;
  /** Palīgteksts zem lauka (`aria-describedby`). */
  readonly hint?: string;
  /** Kļūdas teksts — uzstāda `aria-invalid`, sarkanu malu un aizvieto hint. */
  readonly error?: string;
}

/**
 * Atkārtoti lietojams teksta lauks (Fāze 3 primitīvs). TIKAI prezentācija —
 * stāvokli (`value`/`onChange`) tur izsaucējs (kontrolēts passthrough, CLAUDE.md §1).
 * Unificē vēsturiski nekonsekventos ievades stilus (auth/čats/kods) vienā tokenu-
 * balstītā izskatā ar `:focus-visible` gredzenu un kļūdas stāvokli.
 *
 * Pieejamība: `useId` saista `label`↔`input` un `input`↔`hint`/`error`
 * (`aria-describedby`); `error` uzstāda `aria-invalid`. Šaura API — bez adornment
 * ikonām, maskēšanas vai validācijas loģikas (tā paliek izsaucējā).
 */
export function TextField({
  label,
  hint,
  error,
  type = "text",
  className,
  disabled = false,
  ...rest
}: TextFieldProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedById = error ? errorId : hint ? hintId : undefined;

  return (
    <div
      className={className ? `uiField ${className}` : "uiField"}
      data-invalid={error ? true : undefined}
    >
      {label ? (
        <label className="uiFieldLabel" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        {...rest}
        id={inputId}
        type={type}
        className="uiFieldInput"
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedById}
      />
      {error ? (
        <small id={errorId} className="uiFieldError">
          {error}
        </small>
      ) : hint ? (
        <small id={hintId} className="uiFieldHint">
          {hint}
        </small>
      ) : null}
    </div>
  );
}
