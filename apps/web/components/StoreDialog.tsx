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
 * Veikala dialogs — VIENA prece: "supportHuman" bota palīgs kā flip-card. Priekšpuse:
 * bota attēls (`/assets/store/the_sage_front.webp` — bots + "THE SAGE" iebūvēts) ar diviem
 * transparent React overlay: (1) naudas summa = pirkšanas poga (nav ielogojies → login;
 * ielogots → darījums + skaņa), (2) vertikāls "FLIP" uz apraksta pusi. Otra puse: apraksts
 * uz bronzas paneļa (`the_sage_back.webp`). Kartes palete ir FIKSĒTA (nesekojam tēmām —
 * īpašnieka lēmums); teksti no i18n (21 valoda). Serveris ir autoritatīvs: cena no kataloga,
 * debets+īpašums atomiski (`/store/buy`).
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
            {/* Priekšpuse — bota attēls (assets webp, bots + "THE SAGE" iebūvēts) + klikšķināma
                naudas summa (= pirkšana: anon → login; ielogots → darījums + skaņa) + vertikāls
                "flip" saite uz apraksta pusi. Nav atsevišķas Buy pogas. */}
            <div className="storeCardFace storeCardFront" aria-hidden={flipped}>
              <img
                className="storeFrontArt"
                src="/assets/store/the_sage_front.webp"
                alt={SUPPORT_HUMAN_NAME}
                draggable={false}
              />
              {owned ? (
                <span className="storePricePill storeOwnedPill">{t.storeOwned}</span>
              ) : (
                <button
                  type="button"
                  className="storePricePill storePriceButton"
                  tabIndex={frontTab}
                  disabled={buying || balanceLoading}
                  onClick={() => void buy()}
                  aria-label={`${isAuthed ? t.themeBuy : t.storeLoginRequired}: ${SUPPORT_HUMAN_NAME}, ${BOT_ASSISTANT_PRICE.toLocaleString()}`}
                >
                  <CoinGif className="storePriceCoin" />
                  <span className="storePriceValue">{BOT_ASSISTANT_PRICE.toLocaleString()}</span>
                </button>
              )}
              <button
                type="button"
                className="storeFlipTab"
                tabIndex={frontTab}
                onClick={toggleFlip}
                aria-label={t.storeDetails}
              >
                FLIP
              </button>
              {buyError ? (
                <p className="storeBuyError storeCardError" role="alert">
                  {buyError}
                </p>
              ) : null}
            </div>

            {/* Otra puse — apraksts uz bronzas paneļa (assets webp) + vertikāls "flip" atpakaļ. */}
            <div className="storeCardFace storeCardBack" aria-hidden={!flipped}>
              <img
                className="storeBackArt"
                src="/assets/store/the_sage_back.webp"
                alt=""
                aria-hidden="true"
                draggable={false}
              />
              <div className="storeBackContent">
                <div className="storeCardName">{SUPPORT_HUMAN_NAME}</div>
                <p className="storeCardDesc">{t.storeSupportHumanDesc}</p>
              </div>
              <button
                type="button"
                className="storeFlipTab"
                tabIndex={backTab}
                onClick={toggleFlip}
                aria-label={t.storeFlipBack}
              >
                FLIP
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
