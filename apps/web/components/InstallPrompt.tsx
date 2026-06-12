"use client";

import { useEffect, useState } from "react";

import type { AppStrings } from "../lib/i18n";
import { readLocalStorage, writeLocalStorage } from "../lib/safeStorage";

/**
 * Chromium `beforeinstallprompt` events — TS standarta lib to neiekļauj
 * (nestandartizēts API), tāpēc minimāls lokāls tips.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    /** Agrīni notvertais install events (sk. `app/layout.tsx` beforeInteractive skriptu). */
    __dominoInstallPromptEvent?: BeforeInstallPromptEvent | undefined;
  }
  interface Navigator {
    /** iOS Safari: `true`, kad lapa palaista no sākuma ekrāna (standalone). */
    readonly standalone?: boolean;
  }
}

/** Pēc noraidīšanas piedāvājumu neatkārto šo periodu (nav uzbāzīgs). */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 dienas
const SNOOZE_STORAGE_KEY = "domino-poker-install-snooze";

type InstallMode = "android" | "ios";

/**
 * PWA instalēšanas piedāvājums (tikai galvenajā lobby — nekad spēles laikā).
 *
 * Android/Chromium: `beforeinstallprompt` NEizšaujas, ja aplikācija jau
 * instalēta, tāpēc instalējušie lietotāji banneri neredz nekad; pārējiem tas
 * parādās katrā apmeklējumā, līdz instalē vai noraida (tad 14 dienu snooze —
 * arī tad, ja noraidīts pats pārlūka dialogs, ne tikai mūsu poga).
 *
 * iOS Safari: programmatiska piedāvājuma nav (Apple ierobežojums) — rādām
 * instrukciju ("Kopīgot → Pievienot sākuma ekrānam") ar to pašu snooze.
 * Standalone režīmā (atvērts kā aplikācija) nerādām neko; pārlūkā Safari
 * NEVAR uzzināt, vai aplikācija jau ir sākuma ekrānā, tāpēc tur vienīgais
 * ierobežotājs ir snooze.
 */
export function InstallPrompt({ labels: t }: { readonly labels: AppStrings }) {
  const [mode, setMode] = useState<InstallMode | null>(null);

  useEffect(() => {
    if (isStandalone() || isSnoozed(Date.now())) return;

    if (window.__dominoInstallPromptEvent) {
      setMode("android");
    } else if (isIosSafari()) {
      setMode("ios");
    }

    // Events var pienākt arī PĒC mount (Chromium instalējamību izlemj asinhroni).
    const onPromptCaptured = () => setMode("android");
    // Pēc veiksmīgas instalēšanas banneri paslēpjam uzreiz.
    const onInstalled = () => {
      window.__dominoInstallPromptEvent = undefined;
      setMode(null);
    };
    window.addEventListener("domino:installprompt", onPromptCaptured);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("domino:installprompt", onPromptCaptured);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === null) return null;

  const snoozeAndHide = () => {
    writeLocalStorage(SNOOZE_STORAGE_KEY, String(Date.now()));
    setMode(null);
  };

  const install = async (): Promise<void> => {
    const event = window.__dominoInstallPromptEvent;
    if (!event) {
      setMode(null);
      return;
    }
    // `prompt()` drīkst izsaukt tikai vienreiz uz eventu — patērējam to.
    window.__dominoInstallPromptEvent = undefined;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "dismissed") {
      // Noraidīja pārlūka dialogu → tas pats snooze (citādi justos uzbāzīgi).
      writeLocalStorage(SNOOZE_STORAGE_KEY, String(Date.now()));
    }
    setMode(null); // pieņemšanas gadījumā `appinstalled` tāpat notīra
  };

  return (
    <div className="installBanner" role="region" aria-label={t.installPromptTitle}>
      <p className="installBannerText">
        {mode === "ios" ? t.installPromptIosHint : t.installPromptText}
      </p>
      <div className="installBannerActions">
        {mode === "android" ? (
          <button className="primaryButton installBannerInstall" type="button" onClick={() => void install()}>
            {t.installPromptInstall}
          </button>
        ) : null}
        <button className="installBannerDismiss" type="button" onClick={snoozeAndHide}>
          {t.installPromptDismiss}
        </button>
      </div>
    </div>
  );
}

/** Vai lapa jau darbojas kā instalēta aplikācija (Android standalone / iOS home-screen). */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/** Vai piedāvājums ir atlikts (lietotājs nesen noraidīja). */
function isSnoozed(now: number): boolean {
  const raw = readLocalStorage(SNOOZE_STORAGE_KEY);
  if (raw === null || raw === "") return false;
  const snoozedAt = Number(raw);
  return Number.isFinite(snoozedAt) && now < snoozedAt + SNOOZE_MS;
}

/**
 * Tikai ĪSTAIS iOS Safari: vienīgais pārlūks, kurā "Pievienot sākuma ekrānam"
 * instalē PWA. Citi iOS pārlūki (CriOS/FxiOS/EdgiOS/OPiOS) instalēt nevar —
 * tiem instrukcija būtu maldinoša. iPadOS ar desktop UA atpazīst pēc
 * MacIntel + skārienpunktiem.
 */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIosDevice =
    /iPad|iPhone|iPod/u.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIosDevice) return false;
  return /Safari/u.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/u.test(ua);
}
