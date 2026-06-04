"use client";

import { useEffect } from "react";

/**
 * Reģistrē service worker (tikai produkcijā, lai dev HMR netraucē kešs).
 * Atgriež null — nav vizuāla. Instalēšana strādā HTTPS/localhost vidē.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
