"use client";

import { useEffect, useState } from "react";

import { BOT_ASSISTANT_PRICE, SUPPORT_HUMAN_ITEM_ID, ownsSupportHuman } from "@domino-poker/shared";

import { Dialog } from "./Dialog";
import { CoinGif } from "./CoinGif";
import { CloseIcon } from "./ui/CloseIcon";
import { IconButton } from "./ui/IconButton";
import { apiBuyItem, apiFetchOwned } from "../lib/store/storeApi";
import type { AppStrings } from "../lib/i18n";
import type { AudioSettings } from "../lib/useAudioSettings";

/**
 * Veikala dialogs (Fāze A2) — pagaidām VIENA prece: "supportHuman" bota palīgs kā
 * flip-card. Priekšpuse: SVG māksla + nosaukums + cena + Pirkt/Pieder. Otra puse: blīvs
 * apraksts. TIKAI tokeni (bez krāsu literāļiem) → seko tēmām; teksti no i18n (21 valoda).
 * Serveris ir autoritatīvs: cena no kataloga, debets+īpašums atomiski (`/store/buy`).
 */

/** Zīmola nosaukums (EN literāls, kā tēmu nosaukumi — netiek lokalizēts). */
const SUPPORT_HUMAN_NAME = "The Sage";

export function StoreDialog({
  audio,
  labels: t,
  onClose,
  getToken,
  balance,
  isAuthed,
  onBalanceChange,
  onRequireLogin
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onClose: () => void;
  readonly getToken: () => string | undefined;
  readonly balance: number | null;
  readonly isAuthed: boolean;
  readonly onBalanceChange: (next: number) => void;
  readonly onRequireLogin: () => void;
}) {
  const [owned, setOwned] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  // Īpašumtiesības (ledger-atvasinātas, account-bound) — nosaka Pirkt vs Pieder.
  useEffect(() => {
    if (!isAuthed) {
      setOwned(false);
      return;
    }
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    void apiFetchOwned(token).then((result) => {
      if (cancelled || !result.ok) return;
      setOwned(ownsSupportHuman(result.data.owned));
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthed, getToken]);

  const handleClose = () => {
    audio.play("uiClick");
    onClose();
  };

  const toggleFlip = () => {
    audio.play("uiClick");
    setFlipped((prev) => !prev);
  };

  const buy = async (): Promise<void> => {
    if (!isAuthed) {
      onRequireLogin();
      return;
    }
    const token = getToken();
    if (!token || buying || owned) return;
    audio.play("uiClick");
    setBuyError(null);
    setBuying(true);
    const result = await apiBuyItem(token, SUPPORT_HUMAN_ITEM_ID);
    setBuying(false);
    if (!result.ok) {
      setBuyError(result.error === "insufficient_coins" ? t.themeInsufficientCoins : t.authErrorGeneric);
      return;
    }
    // Skaņa TIKAI pie reāla pirkuma (debets notika) — nevis idempotentā "jau piederēja" no-op.
    if (!result.data.alreadyOwned) {
      audio.play("coinClaim");
    }
    onBalanceChange(result.data.balance);
    setOwned(true);
  };

  const balanceLoading = isAuthed && balance === null;
  // Neaktīvās puses vadīklas izņem no tab-secības + a11y koka (flip saglabā abas DOM-ā).
  const frontTab = flipped ? -1 : 0;
  const backTab = flipped ? 0 : -1;

  return (
    <Dialog
      ariaLabelledBy="store-title"
      className="alertDialog storeDialog"
      onEscape={handleClose}
      resetScrollOnMount
    >
      <div className="settingsHeader">
        <h2 id="store-title">
          <StoreIcon /> {t.store}
        </h2>
        <IconButton className="settingsCloseButton" label={t.close} onClick={handleClose}>
          <CloseIcon />
        </IconButton>
      </div>

      <div className="storeGrid">
        <div className={`storeCard ${flipped ? "flipped" : ""}`}>
          <div className="storeCardInner">
            {/* Priekšpuse */}
            <div className="storeCardFace storeCardFront" aria-hidden={flipped}>
              <BotArt />
              <div className="storeCardName">{SUPPORT_HUMAN_NAME}</div>
              <div className="storeCardTagline">{t.storeSupportHumanTagline}</div>
              <div className="storeCardFooter">
                <span className="storeCardPrice">
                  <CoinGif className="storeCardPriceCoin" />
                  {BOT_ASSISTANT_PRICE.toLocaleString()}
                </span>
                {owned ? (
                  <span className="storeOwnedBadge">{t.storeOwned}</span>
                ) : (
                  <button
                    type="button"
                    className="storeBuyButton"
                    tabIndex={frontTab}
                    disabled={buying || balanceLoading}
                    onClick={() => void buy()}
                  >
                    {isAuthed ? t.themeBuy : t.storeLoginRequired}
                  </button>
                )}
              </div>
              {buyError ? (
                <p className="storeBuyError" role="alert">
                  {buyError}
                </p>
              ) : null}
              <button
                type="button"
                className="storeFlipButton"
                tabIndex={frontTab}
                onClick={toggleFlip}
              >
                {t.storeDetails}
              </button>
            </div>

            {/* Otra puse — blīvs apraksts */}
            <div className="storeCardFace storeCardBack" aria-hidden={!flipped}>
              <div className="storeCardName">{SUPPORT_HUMAN_NAME}</div>
              <p className="storeCardDesc">{t.storeSupportHumanDesc}</p>
              <button
                type="button"
                className="storeFlipButton"
                tabIndex={backTab}
                onClick={toggleFlip}
              >
                {t.storeFlipBack}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** Veikala ikona (CSS maska + `currentColor` → token-krāsojas ar tēmu, kā settings/login ikonas). */
export function StoreIcon() {
  return <span className="storeAssetIcon" aria-hidden="true" />;
}

/**
 * Bota māksla — inline SVG ar `fill="currentColor"` (opacity slāņi = īsts aizpildījums),
 * tonēts ar `.storeBotArt { color: var(--primary) }` → seko tēmai. Stilizēts "gudrinieks-
 * robots", kas rāda domino kauliņu.
 */
function BotArt() {
  return (
    <svg className="storeBotArt" viewBox="0 0 200 200" fill="currentColor" aria-hidden="true">
      <circle cx="100" cy="100" r="82" opacity="0.08" />
      <circle cx="100" cy="100" r="66" opacity="0.06" />
      <rect x="96.5" y="24" width="7" height="20" rx="3.5" opacity="0.85" />
      <circle cx="100" cy="22" r="7" opacity="0.95" />
      <rect x="52" y="44" width="96" height="80" rx="24" opacity="0.9" />
      <rect x="64" y="58" width="72" height="46" rx="16" opacity="0.18" />
      <circle cx="84" cy="80" r="9" />
      <circle cx="116" cy="80" r="9" />
      <path d="M80 95 q20 16 40 0" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.75" />
      <rect x="42" y="72" width="10" height="26" rx="5" opacity="0.8" />
      <rect x="148" y="72" width="10" height="26" rx="5" opacity="0.8" />
      <rect x="60" y="128" width="80" height="44" rx="18" opacity="0.85" />
      <rect x="82" y="132" width="36" height="52" rx="8" opacity="0.16" />
      <rect x="82" y="132" width="36" height="52" rx="8" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.55" />
      <line x1="84" y1="158" x2="116" y2="158" stroke="currentColor" strokeWidth="3" opacity="0.55" />
      <circle cx="92" cy="141" r="3.4" />
      <circle cx="100" cy="145" r="3.4" />
      <circle cx="108" cy="149" r="3.4" />
      <circle cx="93" cy="167" r="3.4" />
      <circle cx="107" cy="177" r="3.4" />
    </svg>
  );
}
