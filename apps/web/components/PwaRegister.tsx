"use client";

import { useEffect, useState } from "react";

import { decideReloadAction, isReloadSafe } from "../lib/pwa/reloadGate";
import { readLocalStorage } from "../lib/safeStorage";

const localeStorageKey = "domino-poker-locale";

/**
 * Rezerves teksts, ja `lib/i18n` chunk-u neizdodas ielādēt.
 *
 * Šis gadījums ir reāls tieši šeit: uzvedne parādās PĒC service worker nomaiņas, un tieši
 * tad iepriekšējā laidiena chunk-i uz servera var vairs neeksistēt. Bez rezerves lietotājs
 * paliktu uz novecojušas versijas BEZ pogas, ar ko to nomainīt — sliktāk nekā redzēt
 * netulkotu tekstu. Angļu valoda tāpēc, ka tā ir `defaultLocale`.
 */
const updateLabelFallback = "New version available — tap to update";

/**
 * Ielādē uzvednes tekstu TIKAI tad, kad tas tiešām vajadzīgs.
 *
 * `lib/i18n` statiski importē visas 21 valodas (~395 KB neapstrādāti / 114,7 KiB gzip).
 * Kamēr imports bija statisks, KATRA lapa — arī publiskās SEO lapas, kur šī poga
 * neparādās nekad — to ievilka sākotnējā ielādē. PageSpeed to nepamanīja, jo Chrome
 * coverage visu valodu tabulu skaita par "izmantotu": tā ir viens augšlīmeņa objekta
 * piešķīrums, kas izpildās pilnībā.
 *
 * Valoda joprojām nāk no `localStorage`, nevis no servera prop: spēlē lietotājs valodu
 * maina izpildlaikā, tāpēc SSR laika vērtība būtu nepareiza.
 */
async function loadUpdateLabel(): Promise<string> {
  const { defaultLocale, getAppStrings, isLocale } = await import("../lib/i18n");
  const stored = readLocalStorage(localeStorageKey);
  const locale = stored && isLocale(stored) ? stored : defaultLocale;
  return getAppStrings(locale).pwaUpdateReady;
}

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
  // Teksts UN redzamība vienā stāvoklī: poga parādās tieši tad, kad teksts ir zināms.
  // Atsevišķs `updateReady` karogs ļautu renderēt pogu bez uzraksta, kamēr chunks ielādējas.
  const [updateLabel, setUpdateLabel] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const sw = navigator.serviceWorker;
    // Vai lapa JAU bija SW kontrolē mountējoties: tikai tad nākamais
    // `controllerchange` nozīmē atjauninājumu (nevis pirmo instalāciju).
    const hadController = sw.controller !== null;
    let reloaded = false;
    let cancelled = false;

    const onControllerChange = () => {
      if (reloaded) return;
      const action = decideReloadAction({ hadController, reloadSafe: isReloadSafe() });
      if (action === "reload") {
        reloaded = true;
        window.location.reload();
      } else if (action === "prompt") {
        void loadUpdateLabel()
          .catch((error: unknown) => {
            // Non-fatāls, tāpat kā reģistrācijas un update kļūmes zemāk: netulkots uzraksts
            // ir noderīgāks nekā pazudusi poga, jo bez tās lietotājs paliek uz vecās versijas.
            console.warn("[pwa] update label load failed", error);
            return updateLabelFallback;
          })
          .then((label) => {
            if (!cancelled) setUpdateLabel(label);
          });
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
      cancelled = true;
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (updateLabel === null) return null;

  return (
    <button
      type="button"
      className="pwaUpdateBanner"
      onClick={() => window.location.reload()}
    >
      {updateLabel}
    </button>
  );
}
