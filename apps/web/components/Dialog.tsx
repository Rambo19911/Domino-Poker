"use client";

import { useEffect, type ReactNode } from "react";
import { useDialogFocus } from "./useDialogFocus";

export function Dialog({
  ariaLabelledBy,
  children,
  className,
  onEscape,
  resetScrollOnMount = false,
  transparent = false
}: {
  readonly ariaLabelledBy: string;
  readonly children: ReactNode;
  readonly className: string;
  readonly onEscape?: () => void;
  readonly resetScrollOnMount?: boolean;
  readonly transparent?: boolean;
}) {
  const dialogRef = useDialogFocus<HTMLElement>(onEscape);

  useEffect(() => {
    if (!resetScrollOnMount) return undefined;

    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    dialog.scrollTop = 0;
    const timeoutId = window.setTimeout(() => {
      dialog.scrollTop = 0;
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [dialogRef, resetScrollOnMount]);

  return (
    <div className={`modalBackdrop ${transparent ? "transparentBackdrop" : ""}`}>
      <section
        ref={dialogRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
