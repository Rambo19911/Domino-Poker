"use client";

import { Dialog } from "./Dialog";
import { CloseIcon } from "./ui/CloseIcon";
import { IconButton } from "./ui/IconButton";
import type { AppStrings } from "../lib/i18n";
import type { AudioSettings } from "../lib/useAudioSettings";

/**
 * Veikala dialogs — pagaidām tukšs sagatavots karkass (nākamā fāze pievieno saturu).
 * Struktūra un mobilā mērogošana identiska pārējiem lobby dialogiem (`Dialog` →
 * `modalScale`). Biznesa loģikas šeit nav; ikona/tulkojumi seko tēmu pakām un i18n.
 */
export function StoreDialog({
  audio,
  labels: t,
  onClose
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onClose: () => void;
}) {
  const handleClose = () => {
    audio.play("uiClick");
    onClose();
  };

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

      <div className="storeEmpty">
        <span className="storeEmptyIcon" aria-hidden="true" />
        <p className="storeEmptyText">{t.storeComingSoon}</p>
      </div>
    </Dialog>
  );
}

/** Veikala ikona (CSS maska + `currentColor` → token-krāsojas ar tēmu, kā settings/login ikonas). */
export function StoreIcon() {
  return <span className="storeAssetIcon" aria-hidden="true" />;
}
