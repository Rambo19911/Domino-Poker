"use client";

import { useEffect, useState } from "react";

import { defaultLocale, getAppStrings, isLocale } from "../lib/i18n";
import { decideReloadAction, isReloadSafe } from "../lib/pwa/reloadGate";
import { readLocalStorage } from "../lib/safeStorage";

const localeStorageKey = "domino-poker-locale";

/**
 * Reģistrē service worker (tikai produkcijā) UN pārvalda jaunas versijas pieņemšanu:
 *  - `updateViaCache: "none"` + `registration.update()` (mount un atgriežoties cilnē) →
 *    pārlūks ātri ievēro jaunu sw.js, nevis ņem to no HTTP keša.
 *  - kad jaunais SW pārņem kontroli (`controllerchange`): droši (lobby) → klusa
 *    vienreizēja pārlāde svaigiem chunk-iem; aktīvas spēles laikā → soft-prompts
 *    (poga), lai nezaudētu atmiņā glabāto partijas stāvokli.
 *
 * sw.js jau dara `skipWaiting` + `clients.claim`, tāpēc `controllerchange` izšaujas
 * atjauninājumā bez papildu ziņojumiem. Pirmā instalācija (lapa vēl nebija kontrolēta)
 * pārlādi NEIZRAISA (sk. `decideReloadAction`).
 */
export function PwaRegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const sw = navigator.serviceWorker;
    // Vai lapa JAU bija SW kontrolē mountējoties: tikai tad nākamais
    // `controllerchange` nozīmē atjauninājumu (nevis pirmo instalāciju).
    const hadController = sw.controller !== null;
    let reloaded = false;

    const onControllerChange = () => {
      if (reloaded) return;
      const action = decideReloadAction({ hadController, reloadSafe: isReloadSafe() });
      if (action === "reload") {
        reloaded = true;
        window.location.reload();
      } else if (action === "prompt") {
        setUpdateReady(true);
      }
    };

    sw.addEventListener("controllerchange", onControllerChange);

    // Non-fatāls (m12): update kļūme (piem. bezsaiste) nedrīkst lauzt lapu, bet to
    // izvadām debug paritātei ar reģistrācijas kļūdu.
    const warnUpdate = (error: unknown) =>
      console.warn("[pwa] service worker update check failed", error);

    let registration: ServiceWorkerRegistration | null = null;
    sw.register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        // Aktīvi pārbauda jaunu versiju uzreiz (ne tikai pie navigācijas).
        void reg.update().catch(warnUpdate);
      })
      .catch((error) => {
        // Non-fatāls (m12): reģistrācijas kļūme nedrīkst lauzt lapu.
        console.warn("[pwa] service worker registration failed", error);
      });

    // Atgriežoties cilnē, pārbauda jaunu versiju (PWA bieži paliek atvērta ilgi).
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void registration?.update().catch(warnUpdate);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!updateReady) return null;

  const storedLocale = readLocalStorage(localeStorageKey);
  const locale = storedLocale && isLocale(storedLocale) ? storedLocale : defaultLocale;
  const t = getAppStrings(locale);

  return (
    <button
      type="button"
      className="pwaUpdateBanner"
      onClick={() => window.location.reload()}
    >
      {t.pwaUpdateReady}
    </button>
  );
}
