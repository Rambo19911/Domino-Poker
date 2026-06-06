"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  defaultRoomNumberOfRounds,
  maxRoomNumberOfRounds,
  minRoomNumberOfRounds,
  type ChatMessage,
  type RoomSeatView,
  type RoomSummary,
  type RoomView,
  type RoomVisibility
} from "@domino-poker/shared";

import type { AppStrings } from "../lib/i18n";
import { toGameTableView } from "../lib/mp/gameTableView";
import { useMultiplayer } from "../lib/mp/useMultiplayer";
import type { AudioSettings } from "../lib/useAudioSettings";
import { VolumeIcon, VolumeOffIcon } from "./AudioControls";
import { Dialog } from "./Dialog";
import { ConnectionBanner } from "./mp/ConnectionBanner";
import { MpGameTable } from "./mp/MpGameTable";
import { HelpIcon } from "./RulesDialog";
import { getMpRulesDoc } from "../lib/mpRulesContent";

const CHAT_MAX_LENGTH = 200;
const ROOM_CODE_MAX_LENGTH = 12;

export function MultiplayerLobby({
  audio,
  labels: t,
  onExit
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onExit: () => void;
}) {
  const { view, actions } = useMultiplayer();
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinCodeOpen, setIsJoinCodeOpen] = useState(false);
  const [isRoomScreenHidden, setIsRoomScreenHidden] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const clickThenExit = () => {
    audio.play("uiClick");
    onExit();
  };

  const publicRooms = view.lobby.rooms.filter((room) => !room.isPrivate);
  const privateRooms = view.lobby.rooms.filter((room) => room.isPrivate);
  const activeRoom = view.room;
  const isSeatedInActiveRoom = Boolean(activeRoom && isDisplayIdSeated(activeRoom, view.identity?.displayId));
  const currentRoom = activeRoom && !isRoomScreenHidden ? activeRoom : undefined;
  const hasHiddenRoom = isSeatedInActiveRoom && isRoomScreenHidden;

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeRoom) {
      setIsRoomScreenHidden(false);
    }
  }, [activeRoom]);

  // Visas kļūdas ir IZGAISTOŠAS (transient), lai tās nekad nepaliek "iestrēgušas"
  // lobby (piem. spēles kļūda "does not own current turn" pēc spēles beigām).
  //   - Čata kļūdas (rate-limit/nederīga) → čata konteinerā (4 s).
  //   - Pārējās → augšējā lobby josla (6 s).
  // `view.lastError` atsauce mainās uz katru jaunu ERROR → efekts pārstartē taimeri.
  // Kad `lastError` tiek notīrīts (piem. ROOM_LEFT), abas joslas nodziest uzreiz.
  useEffect(() => {
    const error = view.lastError;
    if (!error) {
      setChatError(null);
      setLobbyError(null);
      return;
    }
    const chatText = chatErrorText(error.code, t);
    if (chatText !== undefined) {
      setChatError(chatText);
      const timeout = window.setTimeout(() => setChatError(null), 4000);
      return () => window.clearTimeout(timeout);
    }
    setLobbyError(error.message);
    const timeout = window.setTimeout(() => setLobbyError(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [view.lastError, t]);

  const submitChat = (event: React.FormEvent) => {
    event.preventDefault();
    const text = chatDraft.trim();
    if (text === "") return;
    audio.play("uiClick");
    actions.sendChat(text);
    setChatDraft("");
  };

  // 8.4 — Kad istaba ir IN_GAME un ir saņemts snapshot, rādām pilnekrāna MP galdu.
  // Galds tikai renderē servera snapshot un sūta nodomu (nav lokālas state izmaiņas).
  const gameTable = toGameTableView(view.game.snapshot, view.room, view.game.turnId, view.game.startsAt);
  if (activeRoom?.status === "IN_GAME" && gameTable) {
    return (
      <MpGameTable
        audio={audio}
        labels={t}
        table={gameTable}
        view={view}
        onSubmitBid={(bid) => actions.submitBid(bid)}
        onSubmitMove={(move) => actions.submitMove(move)}
        onExitToLobby={() => {
          audio.play("uiClick");
          actions.leaveRoom();
        }}
      />
    );
  }

  return (
    <main className="mpLobby">
      <header className="mpLobbyHeader">
        <h1 className="mpLobbyTitle">
          {t.mpLobbyTitle}
          <span className="mpLobbyTitleTag"> · {t.mpLobbyLabel}</span>
        </h1>
        <div className="mpLobbyHeaderActions">
          <ConnectionBanner status={view.connection} labels={t} />
          <button
            className="iconButton mpHeaderIconButton mpHelpButton"
            type="button"
            aria-label={t.rules}
            title={t.rules}
            onClick={() => {
              audio.play("uiClick");
              setIsRulesOpen(true);
            }}
          >
            <HelpIcon />
          </button>
          <button
            className="iconButton mpHeaderIconButton mpSoundButton"
            type="button"
            aria-label={audio.isMuted ? t.mutedSoundSettings : t.soundSettings}
            aria-pressed={audio.isMuted}
            title={audio.isMuted ? t.mutedSoundSettings : t.soundSettings}
            onClick={() => audio.toggleMute()}
          >
            {audio.isMuted ? <VolumeOffIcon /> : <VolumeIcon />}
          </button>
          <button
            className="iconButton mpHeaderIconButton mpExitButton"
            type="button"
            aria-label={t.exit}
            title={t.exit}
            onClick={clickThenExit}
          >
            <ReturnIcon />
          </button>
        </div>
      </header>

      {currentRoom ? (
        <WaitingRoom
          isConnected={view.connection === "connected"}
          labels={t}
          room={currentRoom}
          selfDisplayId={view.identity?.displayId}
          onBackToLobby={() => {
            audio.play("uiClick");
            setIsRoomScreenHidden(true);
          }}
          onChooseSeat={(seatIndex) => {
            audio.play("uiClick");
            actions.joinRoomSeat(currentRoom.id, seatIndex, currentRoom.isPrivate ? currentRoom.code : undefined);
          }}
          onFillBots={() => {
            audio.play("uiClick");
            actions.fillSeatsWithBots();
          }}
          onLeave={() => {
            audio.play("uiClick");
            actions.leaveRoom();
          }}
          onStart={() => {
            audio.play("uiClick");
            actions.startGame();
          }}
        />
      ) : (
        <>
          <div className="mpLobbyActionRow">
            <button
              className="mpPrimaryButton"
              type="button"
              disabled={hasHiddenRoom}
              onClick={() => {
                audio.play("uiClick");
                setIsCreateOpen(true);
              }}
            >
              + {t.mpCreateRoom}
            </button>
            <button
              className="mpRoomButton"
              type="button"
              disabled={view.connection !== "connected" || hasHiddenRoom}
              onClick={() => {
                audio.play("uiClick");
                setIsJoinCodeOpen(true);
              }}
            >
              {t.mpJoinWithCode}
            </button>
            {hasHiddenRoom ? (
              <button
                className="mpRoomButton"
                type="button"
                onClick={() => {
                  audio.play("uiClick");
                  setIsRoomScreenHidden(false);
                }}
              >
                {t.mpOpenRoom}
              </button>
            ) : null}
            <p className="mpPreviewNote" role="note">{t.mpPreviewNote}</p>
            {hasHiddenRoom ? (
              <p className="mpPreviewNote" role="note">{t.mpActiveRoomNote}</p>
            ) : null}
            {lobbyError ? (
              <p className="mpErrorNote" role="alert" key={lobbyError}>{lobbyError}</p>
            ) : null}
          </div>

          <div className="mpLobbyColumns">
            <section className="mpColumn" aria-labelledby="mp-public-heading">
              <header className="mpColumnHead">
                <h2 id="mp-public-heading">{t.mpPublicRooms}</h2>
                <span className="mpChip">{publicRooms.length} {t.mpCount}</span>
              </header>
              <div className="mpColumnBody">
                {publicRooms.length === 0 ? (
                  <p className="mpHint">{t.mpEmptyRooms}</p>
                ) : (
                  publicRooms.map((room) => (
                    <PublicRoomRow
                      key={room.id}
                      activeRoomId={activeRoom?.id}
                      isAlreadyInRoom={hasHiddenRoom}
                      isConnected={view.connection === "connected"}
                      selfDisplayId={view.identity?.displayId}
                      labels={t}
                      nowMs={nowMs}
                      room={room}
                      onJoin={() => {
                        audio.play("uiClick");
                        actions.viewRoom(room.id);
                      }}
                      onOpenRoom={() => {
                        audio.play("uiClick");
                        setIsRoomScreenHidden(false);
                      }}
                      onStart={() => {
                        audio.play("uiClick");
                        actions.startGame();
                      }}
                    />
                  ))
                )}
                <p className="mpHint">{t.mpPublicRoomsHint}</p>
              </div>
            </section>

            <section className="mpColumn" aria-labelledby="mp-private-heading">
              <header className="mpColumnHead">
                <h2 id="mp-private-heading">{t.mpPrivateRooms}</h2>
                <span className="mpChip">{privateRooms.length} {t.mpCount}</span>
              </header>
              <div className="mpColumnBody">
                {privateRooms.length === 0 ? (
                  <p className="mpHint">{t.mpEmptyRooms}</p>
                ) : (
                  privateRooms.map((room) => (
                    <PrivateRoomRow
                      key={room.id}
                      activeRoomId={activeRoom?.id}
                      isAlreadyInRoom={hasHiddenRoom}
                      isConnected={view.connection === "connected"}
                      selfDisplayId={view.identity?.displayId}
                      labels={t}
                      nowMs={nowMs}
                      room={room}
                      onJoinWithCode={() => {
                        audio.play("uiClick");
                        setIsJoinCodeOpen(true);
                      }}
                      onOpenRoom={() => {
                        audio.play("uiClick");
                        setIsRoomScreenHidden(false);
                      }}
                      onStart={() => {
                        audio.play("uiClick");
                        actions.startGame();
                      }}
                    />
                  ))
                )}
                <p className="mpHint">{t.mpPrivateRoomsHint}</p>
              </div>
            </section>

            <section className="mpColumn" aria-labelledby="mp-chat-heading">
              <header className="mpColumnHead">
                <h2 id="mp-chat-heading">{t.mpOnlineChat}</h2>
                <span className="mpChip mpChipOnline">
                  <span className="mpOnlineDot" aria-hidden="true" />
                  {view.lobby.onlineCount} {t.mpOnlineCount}
                </span>
              </header>
              <div className="mpColumnBody mpChatBody">
                <ChatFeed labels={t} messages={view.lobby.chat} />
                {chatError ? (
                  <p className="mpChatError" role="alert" key={chatError + String(view.lastError?.requestId ?? "")}>
                    {chatError}
                  </p>
                ) : null}
                <form className="mpChatFoot" onSubmit={submitChat}>
                  <input
                    className="mpChatInput"
                    type="text"
                    maxLength={CHAT_MAX_LENGTH}
                    placeholder={t.mpChatPlaceholder}
                    aria-label={t.mpOnlineChat}
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.currentTarget.value)}
                  />
                  <button className="mpPrimaryButton mpChatSend" type="submit">
                    {t.mpSend}
                  </button>
                </form>
                <p className="mpChatLimitHint" role="note">{t.mpChatLimitHint}</p>
              </div>
            </section>
          </div>
        </>
      )}

      {isCreateOpen ? (
        <CreateRoomDialog
          isConnected={view.connection === "connected"}
          labels={t}
          onCancel={() => setIsCreateOpen(false)}
          onCreate={(settings) => {
            audio.play("uiClick");
            actions.createRoom(settings);
            setIsCreateOpen(false);
          }}
        />
      ) : null}

      {isJoinCodeOpen ? (
        <JoinCodeDialog
          isConnected={view.connection === "connected"}
          labels={t}
          onCancel={() => setIsJoinCodeOpen(false)}
          onJoin={(code) => {
            audio.play("uiClick");
            actions.viewRoomByCode(code);
            setIsJoinCodeOpen(false);
          }}
        />
      ) : null}

      {isRulesOpen ? (
        <MultiplayerRulesDialog
          audio={audio}
          labels={t}
          onClose={() => setIsRulesOpen(false)}
        />
      ) : null}
    </main>
  );
}

function WaitingRoom({
  isConnected,
  labels: t,
  room,
  selfDisplayId,
  onBackToLobby,
  onChooseSeat,
  onFillBots,
  onLeave,
  onStart
}: {
  readonly isConnected: boolean;
  readonly labels: AppStrings;
  readonly room: RoomView;
  readonly selfDisplayId: string | undefined;
  readonly onBackToLobby: () => void;
  readonly onChooseSeat: (seatIndex: number) => void;
  readonly onFillBots: () => void;
  readonly onLeave: () => void;
  readonly onStart: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const copyTimerRef = useRef<number | undefined>(undefined);
  const isHost = room.seats.some((seat) => seat.isHost && seat.displayId === selfDisplayId);
  const isSeated = room.seats.some((seat) => seat.kind === "human" && seat.displayId === selfDisplayId);
  const emptySeats = room.seats.filter((seat) => seat.kind === "empty").length;
  const canManageWaitingRoom = isConnected && isHost && room.status === "WAITING";
  const canFillBots = canManageWaitingRoom && emptySeats > 0;
  // Serveris prasa visas 4 sēdvietas aizpildītas (ar ≥1 cilvēku); citādi NOT_ENOUGH_PLAYERS.
  const canStart = canManageWaitingRoom && emptySeats === 0;
  const exitLabel = isHost ? t.mpBackToLobby : t.mpLeaveRoom;
  const exitRoom = isHost ? onBackToLobby : onLeave;

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== undefined) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const copyRoomCode = async () => {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopyStatus("copied");
      if (copyTimerRef.current !== undefined) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => setCopyStatus("idle"), 1400);
    } catch {
      // Clipboard permission can be blocked by the browser; the visible code remains selectable.
    }
  };

  return (
    <section className="mpWaitingRoom" aria-labelledby="mp-waiting-room-heading">
      <div className="mpWaitingTop">
        <div>
          <p className="mpWaitingEyebrow">{room.isPrivate ? t.mpVisibilityPrivate : t.mpVisibilityPublic}</p>
          <h2 id="mp-waiting-room-heading">{t.mpWaitingRoomTitle}</h2>
          <div className="mpWaitingMeta">
            <span className="mpChip">{roomStatusLabel(room.status, t)}</span>
            <span className="mpChip">{t.roundCount}: {room.numberOfRounds}</span>
            <span className="mpChip">{t.mpSeats}: {room.seatsFilled}/{room.seatsTotal}</span>
          </div>
        </div>
        <div className="mpRoomCodePanel">
          <span className="mpRoomCodeLabel">{t.mpRoomCode}</span>
          <strong aria-label={t.mpRoomCodeAria.replace("{code}", spellRoomCode(room.code))}>
            {room.code}
          </strong>
          <button className="mpRoomButton" type="button" onClick={copyRoomCode}>
            {copyStatus === "copied" ? t.mpCopiedCode : t.mpCopyCode}
          </button>
        </div>
      </div>

      <div className="mpSeatGrid" aria-label={t.mpSeats}>
        {room.seats.map((seat) => (
          <SeatCard
            key={seat.index}
            canChoose={isConnected && !isSeated && room.status === "WAITING" && seat.kind === "empty"}
            labels={t}
            seat={seat}
            onChoose={() => onChooseSeat(seat.index)}
          />
        ))}
      </div>

      <div className="mpWaitingActions">
        <button className="mpRoomButton" type="button" onClick={onFillBots} disabled={!canFillBots}>
          {t.mpFillBots}
        </button>
        <button className="mpPrimaryButton" type="button" onClick={onStart} disabled={!canStart}>
          {t.mpStartRoom}
        </button>
        <button className="mpHeaderButton" type="button" onClick={onBackToLobby}>
          {t.mpBackToLobby}
        </button>
        {!isHost && isSeated ? (
          <button className="mpHeaderButton" type="button" onClick={exitRoom}>
            {exitLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SeatCard({
  canChoose,
  labels: t,
  seat,
  onChoose
}: {
  readonly canChoose: boolean;
  readonly labels: AppStrings;
  readonly seat: RoomSeatView;
  readonly onChoose: () => void;
}) {
  const displayName = seat.kind === "empty"
    ? t.mpSeatEmpty
    : seat.displayId ?? (seat.isAI ? t.mpBot : t.fallbackPlayerName);

  return (
    <article className={`mpSeatCard ${seat.kind === "empty" ? "isEmpty" : "isFilled"}`}>
      <span className="mpSeatIndex">{seat.index + 1}</span>
      <div className="mpSeatAvatar" aria-hidden="true">
        {seat.kind === "empty" ? "·" : displayName.slice(0, 1)}
      </div>
      <div className="mpSeatInfo">
        <strong>{displayName}</strong>
        <span>
          {seat.isHost ? <span className="mpHostMark" aria-label={t.mpHost}>★</span> : null}
          {seat.isAI ? t.mpBot : seat.kind === "empty" ? t.mpSeatEmpty : t.mpHuman}
        </span>
        {canChoose ? (
          <button className="mpRoomButton mpSeatChooseButton" type="button" onClick={onChoose}>
            {t.mpChooseSeat}
          </button>
        ) : null}
      </div>
    </article>
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
        <button
          className="iconButton settingsCloseButton"
          type="button"
          aria-label={t.close}
          onClick={close}
        >
          <CloseIcon />
        </button>
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

function ReturnIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h11a5 5 0 0 1 5 5v1" />
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

function spellRoomCode(code: string): string {
  return code.split("").join(" ");
}

function roomStatusLabel(status: RoomView["status"], labels: AppStrings): string {
  switch (status) {
    case "WAITING":
      return labels.mpStatusWaiting;
    case "STARTING":
      return labels.mpStatusStarting;
    case "IN_GAME":
      return labels.mpStatusPlaying;
    case "FINISHED":
      return labels.gameOver;
    case "DESTROYED":
      return labels.mpStatusClosed;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function isDisplayIdSeated(room: RoomView, displayId: string | undefined): boolean {
  return displayId !== undefined && room.seats.some((seat) => seat.kind === "human" && seat.displayId === displayId);
}

/**
 * Lokalizēts čata kļūdas teksts pēc servera koda, vai `undefined`, ja kļūda nav
 * čata kļūda (tad to rāda vispārējā augšējā joslā). Čata kļūdas (rate-limit /
 * nederīga ziņa) tiek rādītas izgaistoši TIKAI čata konteinerā.
 */
function chatErrorText(code: string, t: AppStrings): string | undefined {
  if (code === "RATE_LIMITED") return t.mpChatRateLimited;
  if (code === "INVALID_MESSAGE") return t.mpChatInvalid;
  return undefined;
}

function ChatFeed({
  labels: t,
  messages
}: {
  readonly labels: AppStrings;
  readonly messages: readonly ChatMessage[];
}) {
  const feedRef = useRef<HTMLUListElement>(null);
  const lastMessageId = messages.at(-1)?.id;

  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;

    const scrollToBottom = () => {
      feed.scrollTop = feed.scrollHeight;
    };

    scrollToBottom();
    const frameId = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frameId);
  }, [messages.length, lastMessageId]);

  if (messages.length === 0) {
    return <p className="mpHint">{t.mpEmptyChat}</p>;
  }

  return (
    <ul className="mpChatFeed" ref={feedRef}>
      {messages.map((message) => (
        <li key={message.id} className="mpChatMessage">
          <span className="mpChip mpChatId">{message.authorDisplayId}</span>
          {/* Renderē kā TEKSTU — React droši escapē; nekad dangerouslySetInnerHTML. */}
          <span className="mpChatText">{message.text}</span>
        </li>
      ))}
    </ul>
  );
}

function PublicRoomRow({
  activeRoomId,
  isAlreadyInRoom,
  isConnected,
  selfDisplayId,
  labels: t,
  nowMs,
  room,
  onJoin,
  onOpenRoom,
  onStart
}: {
  readonly activeRoomId: string | undefined;
  readonly isAlreadyInRoom: boolean;
  readonly isConnected: boolean;
  readonly selfDisplayId: string | undefined;
  readonly labels: AppStrings;
  readonly nowMs: number;
  readonly room: RoomSummary;
  readonly onJoin: () => void;
  readonly onOpenRoom: () => void;
  readonly onStart: () => void;
}) {
  const isPlaying = room.status === "IN_GAME";
  const isOwnActiveRoom = room.id === activeRoomId;
  const isJoinable =
    isConnected && !isAlreadyInRoom && !isPlaying && room.seatsFilled < room.seatsTotal;
  const buttonLabel = isOwnActiveRoom ? t.mpOpenRoom : t.mpJoin;
  const buttonDisabled = isOwnActiveRoom ? false : !isJoinable;
  const buttonAction = isOwnActiveRoom ? onOpenRoom : onJoin;
  // "Start" tieši no saraksta — TIKAI hostam, kad istaba gaida un visas 4 vietas
  // aizpildītas (serveris citādi dod NOT_ENOUGH_PLAYERS). Ļauj sākt bez istabas atvēršanas.
  const canStartFromList =
    canStartRoomFromList(room, selfDisplayId) && isConnected && !isPlaying;
  return (
    <div className={`mpRoomRow${isPlaying ? " isLocked" : ""}`}>
      <div className="mpRoomMeta">
        <span className="mpRoomName">{room.hostDisplayId ?? t.mpUnknownHost}</span>
        <span className="mpRoomSeats" aria-label={`${t.mpSeats}: ${room.seatsFilled}/${room.seatsTotal}`}>
          <span aria-hidden="true">👥 {room.seatsFilled}/{room.seatsTotal}</span>
        </span>
        <span className="mpRoomSeats">{t.roundCount}: {room.numberOfRounds}</span>
        <span className="mpRoomSeats">{t.mpExpiresIn}: {formatTtl(room.expiresAt, nowMs, t)}</span>
      </div>
      <div className="mpRoomRight">
        <span className={`mpChip${isPlaying ? " mpChipPlaying" : ""}`}>
          {isPlaying ? t.mpStatusPlaying : t.mpStatusWaiting}
        </span>
        {isPlaying ? (
          <span className="mpRoomLocked" aria-label={t.mpStatusPlaying}>🔒</span>
        ) : (
          <>
            <button className="mpRoomButton" type="button" disabled={buttonDisabled} onClick={buttonAction}>
              {buttonLabel}
            </button>
            {canStartFromList ? (
              <button className="mpRoomButton mpRoomStart" type="button" onClick={onStart}>
                {t.mpStartRoom}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Vai šī istaba ir startējama tieši no saraksta? Tikai HOSTAM (publiskais
 * `hostDisplayId` == skatītāja `displayId`), kad istaba gaida un visas vietas
 * aizpildītas. Serveris paliek autoritatīvs (START_GAME ir host-only + pilns galds).
 */
function canStartRoomFromList(room: RoomSummary, selfDisplayId: string | undefined): boolean {
  return (
    selfDisplayId !== undefined &&
    room.hostDisplayId === selfDisplayId &&
    room.status === "WAITING" &&
    room.seatsFilled === room.seatsTotal
  );
}

function PrivateRoomRow({
  activeRoomId,
  isAlreadyInRoom,
  isConnected,
  selfDisplayId,
  labels: t,
  nowMs,
  room,
  onJoinWithCode,
  onOpenRoom,
  onStart
}: {
  readonly activeRoomId: string | undefined;
  readonly isAlreadyInRoom: boolean;
  readonly isConnected: boolean;
  readonly selfDisplayId: string | undefined;
  readonly labels: AppStrings;
  readonly nowMs: number;
  readonly room: RoomSummary;
  readonly onJoinWithCode: () => void;
  readonly onOpenRoom: () => void;
  readonly onStart: () => void;
}) {
  const isPlaying = room.status === "IN_GAME";
  const isOwnActiveRoom = room.id === activeRoomId;
  const isJoinable =
    isConnected && !isAlreadyInRoom && !isPlaying && room.seatsFilled < room.seatsTotal;
  const buttonLabel = isOwnActiveRoom ? t.mpOpenRoom : t.mpJoinWithCode;
  const buttonDisabled = isOwnActiveRoom ? false : !isJoinable;
  const buttonAction = isOwnActiveRoom ? onOpenRoom : onJoinWithCode;
  const canStartFromList =
    canStartRoomFromList(room, selfDisplayId) && isConnected && !isPlaying;
  return (
    <div className={`mpRoomRow${isPlaying ? " isLocked" : ""}`}>
      <div className="mpRoomMeta">
        <span className="mpRoomName">
          <span className="mpRoomLockGlyph" aria-hidden="true">🔒</span>
          {room.hostDisplayId ?? t.mpUnknownHost}
        </span>
        <span className="mpRoomSeats" aria-label={`${t.mpSeats}: ${room.seatsFilled}/${room.seatsTotal}`}>
          <span aria-hidden="true">👥 {room.seatsFilled}/{room.seatsTotal}</span>
        </span>
        <span className="mpRoomSeats">{t.roundCount}: {room.numberOfRounds}</span>
        <span className="mpRoomSeats">{t.mpExpiresIn}: {formatTtl(room.expiresAt, nowMs, t)}</span>
      </div>
      <div className="mpRoomRight">
        {isPlaying ? (
          <span className="mpRoomLocked" aria-label={t.mpStatusPlaying}>🔒</span>
        ) : (
          <>
            <button className="mpRoomButton" type="button" disabled={buttonDisabled} onClick={buttonAction}>
              {buttonLabel}
            </button>
            {canStartFromList ? (
              <button className="mpRoomButton mpRoomStart" type="button" onClick={onStart}>
                {t.mpStartRoom}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function formatTtl(expiresAt: number, nowMs: number, labels: AppStrings): string {
  const remainingSeconds = Math.max(0, Math.ceil((expiresAt - nowMs) / 1000));
  if (remainingSeconds <= 0) return labels.mpExpired;
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${minutes}:${pad2(seconds)}`;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
