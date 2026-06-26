"use client";

import { useContext, useEffect, type ReactNode } from "react";
import { useDialogFocus } from "./useDialogFocus";
import { PresenceContext } from "./usePresence";

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
  // "open" pēc noklusējuma (bez `Presence` ietinēja); "closing" palaiž izejas CSS.
  const presenceStatus = useContext(PresenceContext);

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
    <div
      className={`modalBackdrop ${transparent ? "transparentBackdrop" : ""}`}
      data-state={presenceStatus}
    >
      {/* Ietinējs proporcionālai mērogošanai mobilajā (desktopā display:contents — bez ietekmes). */}
      <div className="modalScale">
        {/* Glass tēma centralizēta ŠEIT — VISI dialogi to saņem konsekventi (Fāze 4);
            atsevišķi dialogi vairs neopt-in pa vienam. */}
        <section
          ref={dialogRef}
          className={`glass glass-strong ${className}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
          tabIndex={-1}
          // Izejas laikā padara dialogu pilnībā neinteraktīvu (arī tastatūrai —
          // `pointer-events:none` bloķē tikai peli), lai Enter/Space uz vēl
          // fokusētas pogas nedubultotu kritisku darbību (bid/number/turpināt).
          inert={presenceStatus === "closing"}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
