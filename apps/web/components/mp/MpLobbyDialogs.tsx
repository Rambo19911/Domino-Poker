"use client";

import { useState } from "react";

import {
  defaultRoomNumberOfRounds,
  maxRoomNumberOfRounds,
  minRoomNumberOfRounds,
  type RoomVisibility
} from "@domino-poker/shared";

import type { AppStrings } from "../../lib/i18n";
import { getMpRulesDoc } from "../../lib/mpRulesContent";
import type { AudioSettings } from "../../lib/useAudioSettings";
import { Dialog } from "../Dialog";
import { HelpIcon } from "../RulesDialog";
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
  isConnected,
  audio,
  labels: t,
  onCreate,
  onCancelCreate,
  onJoin,
  onCancelJoin,
  onCloseRules
}: {
  readonly isCreateOpen: boolean;
  readonly isJoinCodeOpen: boolean;
  readonly isRulesOpen: boolean;
  readonly isConnected: boolean;
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onCreate: (settings: {
    readonly visibility: RoomVisibility;
    readonly numberOfRounds: number;
    readonly fillWithBots: boolean;
  }) => void;
  readonly onCancelCreate: () => void;
  readonly onJoin: (code: string) => void;
  readonly onCancelJoin: () => void;
  readonly onCloseRules: () => void;
}) {
  return (
    <>
      {isCreateOpen ? (
        <CreateRoomDialog
          isConnected={isConnected}
          labels={t}
          onCancel={onCancelCreate}
          onCreate={onCreate}
        />
      ) : null}

      {isJoinCodeOpen ? (
        <JoinCodeDialog
          isConnected={isConnected}
          labels={t}
          onCancel={onCancelJoin}
          onJoin={onJoin}
        />
      ) : null}

      {isRulesOpen ? (
        <MultiplayerRulesDialog audio={audio} labels={t} onClose={onCloseRules} />
      ) : null}
    </>
  );
}

function CreateRoomDialog({
  isConnected,
  labels: t,
  onCancel,
  onCreate
}: {
  readonly isConnected: boolean;
  readonly labels: AppStrings;
  readonly onCancel: () => void;
  readonly onCreate: (settings: {
    readonly visibility: RoomVisibility;
    readonly numberOfRounds: number;
    readonly fillWithBots: boolean;
  }) => void;
}) {
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [numberOfRounds, setNumberOfRounds] = useState(defaultRoomNumberOfRounds);
  const [fillWithBots, setFillWithBots] = useState(false);

  const submitCreate = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isConnected) return;
    const clampedRounds = clampRoundCount(numberOfRounds);
    onCreate({ visibility, numberOfRounds: clampedRounds, fillWithBots });
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

        <label className="mpNumberField">
          <span>{t.roundCount}</span>
          <input
            type="number"
            min={minRoomNumberOfRounds}
            max={maxRoomNumberOfRounds}
            value={numberOfRounds}
            onChange={(event) => setNumberOfRounds(clampRoundCount(event.currentTarget.valueAsNumber))}
          />
        </label>

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
          <button className="primaryButton" type="submit" disabled={!isConnected}>
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

function CloseIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function clampRoundCount(value: number): number {
  if (!Number.isFinite(value)) return defaultRoomNumberOfRounds;
  return Math.min(maxRoomNumberOfRounds, Math.max(minRoomNumberOfRounds, Math.round(value)));
}

function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}
