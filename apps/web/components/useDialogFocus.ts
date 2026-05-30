"use client";

import { useEffect, useRef, type RefObject } from "react";

const focusableSelector = [
  "[data-autofocus]",
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

export function useDialogFocus<T extends HTMLElement>(
  onEscape?: () => void
): RefObject<T | null> {
  const dialogRef = useRef<T | null>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initialFocus = getFocusableElements(dialog)[0] ?? dialog;
    initialFocus.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        trapTabFocus(event, dialog);
        return;
      }

      if (event.key !== "Escape") return;
      const escapeHandler = onEscapeRef.current;
      if (!escapeHandler) return;

      event.preventDefault();
      event.stopPropagation();
      escapeHandler();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return dialogRef;
}

function trapTabFocus(event: KeyboardEvent, dialog: HTMLElement) {
  const focusableElements = getFocusableElements(dialog);

  if (focusableElements.length === 0) {
    event.preventDefault();
    dialog.focus({ preventScroll: true });
    return;
  }

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];
  if (!first || !last) return;
  const activeElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  if (!activeElement || !dialog.contains(activeElement)) {
    event.preventDefault();
    first.focus({ preventScroll: true });
    return;
  }

  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
    return;
  }

  if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.getClientRects().length > 0);
}
