"use client";

import { useState } from "react";

import {
  defaultRoomNumberOfRounds,
  MAX_ENTRY_FEE,
  maxRoomNumberOfRounds,
  MIN_ENTRY_FEE,
  minRoomNumberOfRounds,
  type RoomVisibility
} from "@domino-poker/shared";

import type { AppStrings } from "../../lib/i18n";
import { getMpRulesDoc } from "../../lib/mpRulesContent";
import type { AudioSettings } from "../../lib/useAudioSettings";
import { CoinGif } from "../CoinGif";
import { Dialog } from "../Dialog";
import { Presence } from "../usePresence";
import { HelpIcon } from "../RulesDialog";
import { CloseIcon } from "../ui/CloseIcon";
import { IconButton } from "../ui/IconButton";

const ROOM_CODE_MAX_LENGTH = 12;

/**
 * MP lobby modālie dialogi (izveidot istabu / pievienoties ar kodu / noteikumi).
 * Atvēršanas stāvokli (`is*Open`) un darbības tur īpašnieks (router `MultiplayerLobby`);
 * šeit dzīvo tikai dialogu JSX un to lokālā formas state — uzvedība nemainās.
 */
export function MpLobbyDialogs({
  isCreateOpen,
  isJoinCodeOpen,
  isRulesOpen,
  isDeleteRoomOpen,
  isConnected,
  hostBalance,
  audio,
  labels: t,
  onCreate,
  onCancelCreate,
  onJoin,
  onCancelJoin,
  onCloseRules,
  onConfirmDeleteRoom,
  onCancelDeleteRoom
}: {
  readonly isCreateOpen: boolean;
  readonly isJoinCodeOpen: boolean;
  readonly isRulesOpen: boolean;
  readonly isDeleteRoomOpen: boolean;
  readonly isConnected: boolean;
  /** Zelta bilance (Fāze 4); `undefined` = anonīms (maksas istabas slēptas). */
  readonly hostBalance: number | undefined;
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onCreate: (settings: {
    readonly visibility: RoomVisibility;
    readonly numberOfRounds: number;
    readonly fillWithBots: boolean;
    readonly entryFee: number;
  }) => void;
  readonly onCancelCreate: () => void;
  readonly onJoin: (code: string) => void;
  readonly onCancelJoin: () => void;
  readonly onCloseRules: () => void;
  readonly onConfirmDeleteRoom: () => void;
  readonly onCancelDeleteRoom: () => void;
}) {
  return (
    <>
      <Presence open={isDeleteRoomOpen}>
        <DeleteRoomDialog
          isConnected={isConnected}
          labels={t}
          onCancel={onCancelDeleteRoom}
          onConfirm={onConfirmDeleteRoom}
        />
      </Presence>

      <Presence open={isCreateOpen}>
        <CreateRoomDialog
          isConnected={isConnected}
          hostBalance={hostBalance}
          labels={t}
          onCancel={onCancelCreate}
          onCreate={onCreate}
        />
      </Presence>

      <Presence open={isJoinCodeOpen}>
        <JoinCodeDialog
          isConnected={isConnected}
          labels={t}
          onCancel={onCancelJoin}
          onJoin={onJoin}
        />
      </Presence>

      <Presence open={isRulesOpen}>
        <MultiplayerRulesDialog audio={audio} labels={t} onClose={onCloseRules} />
      </Presence>
    </>
  );
}

function DeleteRoomDialog({
  isConnected,
  labels: t,
  onCancel,
  onConfirm
}: {
  readonly isConnected: boolean;
  readonly labels: AppStrings;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Dialog
      ariaLabelledBy="mp-delete-room-title"
      className="alertDialog mpDeleteRoomDialog"
      onEscape={onCancel}
    >
      <h2 id="mp-delete-room-title">{t.mpDeleteRoomTitle}</h2>
      <p className="mpDialogWarning">{t.mpDeleteRoomWarning}</p>

      <div className="dialogActions">
        <button className="textButton" type="button" onClick={onCancel}>
          {t.cancel}
        </button>
        <button className="dangerButton" type="button" disabled={!isConnected} onClick={onConfirm}>
          {t.mpDeleteRoomConfirm}
        </button>
      </div>
    </Dialog>
  );
}

function CreateRoomDialog({
  isConnected,
  hostBalance,
  labels: t,
  onCancel,
  onCreate
}: {
  readonly isConnected: boolean;
  readonly hostBalance: number | undefined;
  readonly labels: AppStrings;
  readonly onCancel: () => void;
  readonly onCreate: (settings: {
    readonly visibility: RoomVisibility;
    readonly numberOfRounds: number;
    readonly fillWithBots: boolean;
    readonly entryFee: number;
  }) => void;
}) {
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  // Raundu lauku turam kā JĒLU virkni rediģēšanas laikā, lai lietotājs var notīrīt
  // (tukšs) un ierakstīt jebkuru 1..50 vērtību. Saspraudums NOTIEK TIKAI pie blur/submit
  // (citādi tukšs/NaN starpstāvoklis uzreiz lēktu atpakaļ uz noklusējumu → nevar ierakstīt 1).
  const [roundsInput, setRoundsInput] = useState(String(defaultRoomNumberOfRounds));
  const [fillWithBots, setFillWithBots] = useState(false);
  // Maksas lauku (tāpat kā raundus) turam kā JĒLU virkni rediģēšanas laikā, lai lietotājs
  // var notīrīt noklusējuma "0" un ierakstīt jebkuru summu. Saspraudums TIKAI pie blur/submit
  // (citādi tukšs/NaN starpstāvoklis uzreiz lēktu atpakaļ uz 0 → nevar ierakstīt "500").
  const [feeInput, setFeeInput] = useState("0");
  const entryFee = sanitizeFeeInput(Number.parseInt(feeInput, 10));

  // Maksas istabas drīkst veidot tikai ielogots lietotājs (anonīmam nav maka).
  const canSetFee = hostBalance !== undefined;
  // Klienta validācija (serveris paliek autoritāte): vesels skaitlis 0..bilance.
  const feeExceedsBalance = canSetFee && entryFee > (hostBalance ?? 0);
  const feeInvalid = feeExceedsBalance;

  const submitCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isConnected || feeInvalid) return;
    const clampedRounds = clampRoundCount(Number.parseInt(roundsInput, 10));
    onCreate({
      visibility,
      numberOfRounds: clampedRounds,
      fillWithBots,
      entryFee: canSetFee ? clampEntryFee(entryFee) : 0
    });
  };

  return (
    <Dialog
      ariaLabelledBy="mp-create-room-title"
      className="alertDialog mpCreateRoomDialog"
      onEscape={onCancel}
    >
      <form onSubmit={submitCreate}>
        <h2 id="mp-create-room-title">{t.mpCreateRoom}</h2>

        <fieldset className="mpFormSection">
          <legend>{t.mpRoomVisibility}</legend>
          <label className="mpRadioOption">
            <input
              type="radio"
              name="roomVisibility"
              value="public"
              checked={visibility === "public"}
              onChange={() => setVisibility("public")}
            />
            <span>
              <strong>{t.mpVisibilityPublic}</strong>
              <small>{t.mpVisibilityPublicHint}</small>
            </span>
          </label>
          <label className="mpRadioOption">
            <input
              type="radio"
              name="roomVisibility"
              value="private"
              checked={visibility === "private"}
              onChange={() => setVisibility("private")}
            />
            <span>
              <strong>{t.mpVisibilityPrivate}</strong>
              <small>{t.mpVisibilityPrivateHint}</small>
            </span>
          </label>
        </fieldset>

        <div className="mpFieldRow">
          <label className="mpNumberField">
            <span>{t.roundCount}</span>
            <input
              type="number"
              min={minRoomNumberOfRounds}
              max={maxRoomNumberOfRounds}
              value={roundsInput}
              onChange={(event) => setRoundsInput(event.currentTarget.value)}
              onBlur={(event) =>
                setRoundsInput(String(clampRoundCount(Number.parseInt(event.currentTarget.value, 10))))
              }
            />
          </label>

          {canSetFee ? (
            <label className="mpNumberField mpEntryFeeField">
            <span className="mpEntryFeeLabel">
              <CoinGif className="mpEntryFeeIcon" />
              {t.mpEntryFee}
            </span>
            <input
              type="number"
              min={0}
              max={Math.min(MAX_ENTRY_FEE, hostBalance ?? 0)}
              step={1}
              value={feeInput}
              onChange={(event) => setFeeInput(event.currentTarget.value)}
              onBlur={(event) =>
                setFeeInput(String(clampEntryFee(Number.parseInt(event.currentTarget.value, 10))))
              }
            />
            <small className="mpEntryFeeHint">
              {entryFee > 0 ? t.mpEntryFeeHint : t.mpEntryFeeFree} · {t.balanceLabel}: {hostBalance ?? 0}
            </small>
            {feeExceedsBalance ? (
                <small className="mpDialogWarning">{t.mpEntryFeeTooHigh}</small>
              ) : null}
            </label>
          ) : null}
        </div>

        <label className="mpCheckboxOption">
          <input
            type="checkbox"
            checked={fillWithBots}
            onChange={(event) => setFillWithBots(event.currentTarget.checked)}
          />
          <span>
            <strong>{t.mpFillWithBots}</strong>
            <small>{t.mpFillWithBotsHint}</small>
          </span>
        </label>

        {!isConnected ? <p className="mpDialogWarning">{t.mpCreateRequiresConnection}</p> : null}

        <div className="dialogActions">
          <button className="textButton" type="button" onClick={onCancel}>
            {t.cancel}
          </button>
          <button className="primaryButton" type="submit" disabled={!isConnected || feeInvalid}>
            {t.mpCreateRoom}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function JoinCodeDialog({
  isConnected,
  labels: t,
  onCancel,
  onJoin
}: {
  readonly isConnected: boolean;
  readonly labels: AppStrings;
  readonly onCancel: () => void;
  readonly onJoin: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const normalizedCode = normalizeRoomCode(code);

  const submitJoin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isConnected || normalizedCode === "") return;
    onJoin(normalizedCode);
  };

  return (
    <Dialog
      ariaLabelledBy="mp-join-code-title"
      className="alertDialog mpCreateRoomDialog"
      onEscape={onCancel}
    >
      <form onSubmit={submitJoin}>
        <h2 id="mp-join-code-title">{t.mpJoinByCodeTitle}</h2>
        <p className="mpDialogHint">{t.mpJoinByCodeHint}</p>

        <label className="mpNumberField mpCodeField">
          <span>{t.mpRoomCode}</span>
          <input
            type="text"
            inputMode="text"
            maxLength={ROOM_CODE_MAX_LENGTH}
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.currentTarget.value.toUpperCase())}
            placeholder={t.mpRoomCodePlaceholder}
          />
        </label>

        {!isConnected ? <p className="mpDialogWarning">{t.mpJoinRequiresConnection}</p> : null}

        <div className="dialogActions">
          <button className="textButton" type="button" onClick={onCancel}>
            {t.cancel}
          </button>
          <button className="primaryButton" type="submit" disabled={!isConnected || normalizedCode === ""}>
            {t.mpJoin}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function MultiplayerRulesDialog({
  audio,
  labels: t,
  onClose
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onClose: () => void;
}) {
  const close = () => {
    audio.play("uiClick");
    onClose();
  };

  const doc = getMpRulesDoc(t.localeCode);

  return (
    <Dialog
      ariaLabelledBy="mp-rules-title"
      className="alertDialog rulesDialog mpRulesDialog"
      onEscape={close}
      resetScrollOnMount
    >
      <div className="settingsHeader">
        <div>
          <h2 id="mp-rules-title"><HelpIcon /> {t.rules}</h2>
        </div>
        <IconButton
          className="settingsCloseButton"
          label={t.close}
          onClick={close}
        >
          <CloseIcon />
        </IconButton>
      </div>

      <div className="rulesContent">
        {doc.intro.length > 0 ? (
          <section className="rulesSection">
            {doc.intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ) : null}
        {doc.sections.map((section) => (
          <section className="rulesSection" key={section.title}>
            <h3>{section.title}</h3>
            {section.blocks.map((block) =>
              typeof block === "string" ? (
                <p key={block}>{block}</p>
              ) : (
                <ul key={block.list.join("|")}>
                  {block.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )
            )}
          </section>
        ))}
      </div>
    </Dialog>
  );
}

function clampRoundCount(value: number): number {
  if (!Number.isFinite(value)) return defaultRoomNumberOfRounds;
  return Math.min(maxRoomNumberOfRounds, Math.max(minRoomNumberOfRounds, Math.round(value)));
}

/** Tīra dalības maksas ievadi: vesels skaitlis ≥ 0 (tukšs/NaN → 0). */
function sanitizeFeeInput(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Galīgais maksas saspraudums pirms sūtīšanas (0 vai MIN..MAX); serveris pārbauda bilanci. */
function clampEntryFee(value: number): number {
  const fee = sanitizeFeeInput(value);
  if (fee === 0) return 0;
  return Math.min(MAX_ENTRY_FEE, Math.max(MIN_ENTRY_FEE, fee));
}

function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}
