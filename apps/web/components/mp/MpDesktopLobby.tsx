"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type {
  ChatMessage,
  RoomSeatView,
  RoomSummary,
  RoomView
} from "@domino-poker/shared";

import { avatarUrl } from "../../lib/auth/avatarUrl";
import type { AppStrings } from "../../lib/i18n";
import type { ConnectionStatus } from "../../lib/mp/clientView";
import { VolumeIcon, VolumeOffIcon } from "../AudioControls";
import { HelpIcon } from "../RulesDialog";
import { ConnectionBanner } from "./ConnectionBanner";

const CHAT_MAX_LENGTH = 200;

/**
 * Desktop (un planšešu) MP LOBBY izkārtojums — header + (gaidīšanas istaba VAI istabu
 * saraksti + čats). Blakus `MpMobileLobby` portrēta variantam. Visu stāvokli un darbības
 * tur īpašnieks (router `MultiplayerLobby`); šis ir tīrs prezentācijas komponents —
 * uzvedība nemainās. `chatDraft` ir router-owned (saglabājas pāri lobby/waiting maiņām).
 */
export function MpDesktopLobby({
  labels: t,
  connection,
  onlineCount,
  chatMessages,
  publicRooms,
  privateRooms,
  selfDisplayId,
  activeRoomId,
  currentRoom,
  hasHiddenRoom,
  isConnected,
  nowMs,
  lobbyError,
  chatError,
  lastErrorRequestId,
  chatDraft,
  isMuted,
  onOpenRules,
  onToggleMute,
  onExit,
  onCreateRoom,
  onJoinWithCode,
  onOpenHiddenRoom,
  onViewRoom,
  onStartGame,
  onChatDraftChange,
  onSubmitChat,
  onBackToLobby,
  onChooseSeat,
  onFillBots,
  onLeave,
  onStart
}: {
  readonly labels: AppStrings;
  readonly connection: ConnectionStatus;
  readonly onlineCount: number;
  readonly chatMessages: readonly ChatMessage[];
  readonly publicRooms: readonly RoomSummary[];
  readonly privateRooms: readonly RoomSummary[];
  readonly selfDisplayId: string | undefined;
  readonly activeRoomId: string | undefined;
  readonly currentRoom: RoomView | undefined;
  readonly hasHiddenRoom: boolean;
  readonly isConnected: boolean;
  readonly nowMs: number;
  readonly lobbyError: string | null;
  readonly chatError: string | null;
  readonly lastErrorRequestId: string | undefined;
  readonly chatDraft: string;
  readonly isMuted: boolean;
  readonly onOpenRules: () => void;
  readonly onToggleMute: () => void;
  readonly onExit: () => void;
  readonly onCreateRoom: () => void;
  readonly onJoinWithCode: () => void;
  readonly onOpenHiddenRoom: () => void;
  readonly onViewRoom: (roomId: string) => void;
  readonly onStartGame: () => void;
  readonly onChatDraftChange: (value: string) => void;
  readonly onSubmitChat: (event: React.FormEvent) => void;
  readonly onBackToLobby: () => void;
  readonly onChooseSeat: (seatIndex: number) => void;
  readonly onFillBots: () => void;
  readonly onLeave: () => void;
  readonly onStart: () => void;
}) {
  return (
    <>
      <header className="mpLobbyHeader">
        <h1 className="mpLobbyTitle">
          {t.mpLobbyTitle}
          <span className="mpLobbyTitleTag"> {t.mpLobbyLabel}</span>
        </h1>
        <div className="mpLobbyHeaderActions">
          <ConnectionBanner status={connection} labels={t} />
          <button
            className="iconButton mpHeaderIconButton mpHelpButton"
            type="button"
            aria-label={t.rules}
            title={t.rules}
            onClick={onOpenRules}
          >
            <HelpIcon />
          </button>
          <button
            className="iconButton mpHeaderIconButton mpSoundButton"
            type="button"
            aria-label={isMuted ? t.mutedSoundSettings : t.soundSettings}
            aria-pressed={isMuted}
            title={isMuted ? t.mutedSoundSettings : t.soundSettings}
            onClick={onToggleMute}
          >
            {isMuted ? <VolumeOffIcon /> : <VolumeIcon />}
          </button>
          <button
            className="iconButton mpHeaderIconButton mpExitButton"
            type="button"
            aria-label={t.exit}
            title={t.exit}
            onClick={onExit}
          >
            <ReturnIcon />
          </button>
        </div>
      </header>

      {currentRoom ? (
        <WaitingRoom
          isConnected={isConnected}
          labels={t}
          room={currentRoom}
          selfDisplayId={selfDisplayId}
          onBackToLobby={onBackToLobby}
          onChooseSeat={onChooseSeat}
          onFillBots={onFillBots}
          onLeave={onLeave}
          onStart={onStart}
        />
      ) : (
        <>
          <div className="mpLobbyActionRow">
            <button
              className="mpPrimaryButton"
              type="button"
              disabled={hasHiddenRoom}
              onClick={onCreateRoom}
            >
              + {t.mpCreateRoom}
            </button>
            <button
              className="mpRoomButton"
              type="button"
              disabled={connection !== "connected" || hasHiddenRoom}
              onClick={onJoinWithCode}
            >
              {t.mpJoinWithCode}
            </button>
            {hasHiddenRoom ? (
              <button className="mpRoomButton" type="button" onClick={onOpenHiddenRoom}>
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
                      activeRoomId={activeRoomId}
                      isAlreadyInRoom={hasHiddenRoom}
                      isConnected={isConnected}
                      selfDisplayId={selfDisplayId}
                      labels={t}
                      nowMs={nowMs}
                      room={room}
                      onJoin={() => onViewRoom(room.id)}
                      onOpenRoom={onOpenHiddenRoom}
                      onStart={onStartGame}
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
                      activeRoomId={activeRoomId}
                      isAlreadyInRoom={hasHiddenRoom}
                      isConnected={isConnected}
                      selfDisplayId={selfDisplayId}
                      labels={t}
                      nowMs={nowMs}
                      room={room}
                      onJoinWithCode={onJoinWithCode}
                      onOpenRoom={onOpenHiddenRoom}
                      onStart={onStartGame}
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
                  {onlineCount} {t.mpOnlineCount}
                </span>
              </header>
              <div className="mpColumnBody mpChatBody">
                <ChatFeed labels={t} messages={chatMessages} />
                {chatError ? (
                  <p className="mpChatError" role="alert" key={chatError + String(lastErrorRequestId ?? "")}>
                    {chatError}
                  </p>
                ) : null}
                <form className="mpChatFoot" onSubmit={onSubmitChat}>
                  <input
                    className="mpChatInput"
                    type="text"
                    maxLength={CHAT_MAX_LENGTH}
                    placeholder={t.mpChatPlaceholder}
                    aria-label={t.mpOnlineChat}
                    value={chatDraft}
                    onChange={(event) => onChatDraftChange(event.currentTarget.value)}
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
    </>
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
        {seat.kind === "empty" ? (
          "·"
        ) : seat.avatar !== undefined ? (
          <img src={avatarUrl(seat.avatar)} alt="" />
        ) : (
          displayName.slice(0, 1)
        )}
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

function ReturnIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h11a5 5 0 0 1 5 5v1" />
    </svg>
  );
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
