"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatMessage, RoomSummary } from "@domino-poker/shared";

import type { AppStrings } from "../../lib/i18n";
import type { ConnectionStatus } from "../../lib/mp/clientView";
import { VolumeIcon, VolumeOffIcon } from "../AudioControls";
import { HelpIcon } from "../RulesDialog";
import { IconButton } from "../ui/IconButton";
import {
  type ChatTranslationState,
  MpChatTranslationButton,
  MpChatTranslationText
} from "./MpChatTranslation";
import { ConnectionBanner } from "./ConnectionBanner";
import { MpEmojiPicker } from "./MpEmojiPicker";
import { RoomFeeChip } from "./RoomFeeChip";

const CHAT_MAX_LENGTH = 200;

type SectionKey = "public" | "private";

/**
 * Portrēta (telefonu) izkārtojums MP LOBBY istabu sarakstam — PARASTS responsīvs
 * CSS ekrāns (NE mērogota dizaina skatuve; skatuve der tikai imersīvajam galdam).
 * Atkārtoti lieto `IconButton` primitīvu un lietotnes pogu klases (mpHeaderIconButton/
 * mpPrimaryButton/mpRoomButton), lai izmēri sakrīt ar pārējiem ekrāniem.
 * NEAPTVER waiting-room ekrānu (atsevišķs darbs). PSD (MP-lobby-layout.json) ir
 * tikai proporciju atsauce.
 */
export function MpMobileLobby({
  labels: t,
  connection,
  onlineCount,
  chatMessages,
  publicRooms,
  privateRooms,
  selfDisplayId,
  activeRoomId,
  hasHiddenRoom,
  isConnected,
  nowMs,
  lobbyError,
  chatError,
  isMuted,
  onCreateRoom,
  onJoinWithCode,
  onOpenHiddenRoom,
  onViewRoom,
  onStartGame,
  onSendChat,
  onOpenRules,
  onToggleMute,
  onExit
}: {
  readonly labels: AppStrings;
  readonly connection: ConnectionStatus;
  readonly onlineCount: number;
  readonly chatMessages: readonly ChatMessage[];
  readonly publicRooms: readonly RoomSummary[];
  readonly privateRooms: readonly RoomSummary[];
  readonly selfDisplayId: string | undefined;
  readonly activeRoomId: string | undefined;
  readonly hasHiddenRoom: boolean;
  readonly isConnected: boolean;
  readonly nowMs: number;
  readonly lobbyError: string | null;
  readonly chatError: string | null;
  readonly isMuted: boolean;
  readonly onCreateRoom: () => void;
  readonly onJoinWithCode: () => void;
  readonly onOpenHiddenRoom: () => void;
  readonly onViewRoom: (roomId: string) => void;
  readonly onStartGame: () => void;
  readonly onSendChat: (text: string) => void;
  readonly onOpenRules: () => void;
  readonly onToggleMute: () => void;
  readonly onExit: () => void;
}) {
  const [openSection, setOpenSection] = useState<SectionKey | null>("public");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [seenCount, setSeenCount] = useState(chatMessages.length);

  // Akordeons: atverot vienu, otrs sakļaujas (viena vērtība); atkārtots klikšķis aizver.
  const toggleSection = (key: SectionKey) => setOpenSection((prev) => (prev === key ? null : key));

  // Nelasīto ziņu indikators: kamēr čats aizvērts, skaitām jaunās ziņas.
  useEffect(() => {
    if (chatOpen) setSeenCount(chatMessages.length);
  }, [chatOpen, chatMessages.length]);
  const hasUnread = !chatOpen && chatMessages.length > seenCount;

  const submitChat = (event: React.FormEvent) => {
    event.preventDefault();
    const text = chatDraft.trim();
    if (text === "") return;
    onSendChat(text);
    setChatDraft("");
  };

  return (
    <div className="mplShell">
      <header className="mplHeader">
        <ConnectionBanner status={connection} labels={t} />
        <div className="mplHeaderButtons">
          <IconButton
            className="mpHeaderIconButton mpHelpButton"
            label={t.rules}
            title={t.rules}
            onClick={onOpenRules}
          >
            <HelpIcon />
          </IconButton>
          <IconButton
            className="mpHeaderIconButton mpSoundButton"
            label={isMuted ? t.mutedSoundSettings : t.soundSettings}
            aria-pressed={isMuted}
            title={isMuted ? t.mutedSoundSettings : t.soundSettings}
            onClick={onToggleMute}
          >
            {isMuted ? <VolumeOffIcon /> : <VolumeIcon />}
          </IconButton>
          <IconButton
            className="mpHeaderIconButton mpExitButton"
            label={t.exit}
            title={t.exit}
            onClick={onExit}
          >
            <ReturnIcon />
          </IconButton>
        </div>
      </header>

      <div className="mplActions">
        <button className="mpPrimaryButton" type="button" disabled={hasHiddenRoom} onClick={onCreateRoom}>
          + {t.mpCreateRoom}
        </button>
        <button
          className="mpRoomButton"
          type="button"
          disabled={!isConnected || hasHiddenRoom}
          onClick={onJoinWithCode}
        >
          {t.mpJoinWithCode}
        </button>
        {hasHiddenRoom ? (
          <button className="mpRoomButton" type="button" onClick={onOpenHiddenRoom}>
            {t.mpOpenRoom}
          </button>
        ) : null}
      </div>

      <div className="mplSections">
        <RoomListSection
          title={t.mpPublicRooms}
          countLabel={t.mpCount}
          rooms={publicRooms}
          isOpen={openSection === "public"}
          isPrivate={false}
          emptyText={t.mpEmptyRooms}
          labels={t}
          nowMs={nowMs}
          isConnected={isConnected}
          hasHiddenRoom={hasHiddenRoom}
          activeRoomId={activeRoomId}
          selfDisplayId={selfDisplayId}
          onToggle={() => toggleSection("public")}
          onJoinRoom={(room) => (room.id === activeRoomId ? onOpenHiddenRoom() : onViewRoom(room.id))}
          onStartGame={onStartGame}
        />
        <RoomListSection
          title={t.mpPrivateRooms}
          countLabel={t.mpCount}
          rooms={privateRooms}
          isOpen={openSection === "private"}
          isPrivate
          emptyText={t.mpEmptyRooms}
          labels={t}
          nowMs={nowMs}
          isConnected={isConnected}
          hasHiddenRoom={hasHiddenRoom}
          activeRoomId={activeRoomId}
          selfDisplayId={selfDisplayId}
          onToggle={() => toggleSection("private")}
          onJoinRoom={(room) => (room.id === activeRoomId ? onOpenHiddenRoom() : onJoinWithCode())}
          onStartGame={onStartGame}
        />
      </div>

      <button
        className="mplChatFab glass"
        type="button"
        aria-label={t.mpOnlineChat}
        onClick={() => setChatOpen(true)}
      >
        <ChatIcon />
        {hasUnread ? <span className="mplChatUnread" aria-hidden="true" /> : null}
      </button>

      {chatOpen ? (
        <ChatOverlay
          labels={t}
          messages={chatMessages}
          onlineCount={onlineCount}
          chatError={chatError}
          chatDraft={chatDraft}
          onDraftChange={setChatDraft}
          onSubmit={submitChat}
          onClose={() => setChatOpen(false)}
        />
      ) : null}

      {lobbyError ? (
        <div className="mplErrorToast" role="alert" key={lobbyError}>{lobbyError}</div>
      ) : null}
    </div>
  );
}

function RoomListSection({
  title,
  countLabel,
  rooms,
  isOpen,
  isPrivate,
  emptyText,
  labels: t,
  nowMs,
  isConnected,
  hasHiddenRoom,
  activeRoomId,
  selfDisplayId,
  onToggle,
  onJoinRoom,
  onStartGame
}: {
  readonly title: string;
  readonly countLabel: string;
  readonly rooms: readonly RoomSummary[];
  readonly isOpen: boolean;
  readonly isPrivate: boolean;
  readonly emptyText: string;
  readonly labels: AppStrings;
  readonly nowMs: number;
  readonly isConnected: boolean;
  readonly hasHiddenRoom: boolean;
  readonly activeRoomId: string | undefined;
  readonly selfDisplayId: string | undefined;
  readonly onToggle: () => void;
  readonly onJoinRoom: (room: RoomSummary) => void;
  readonly onStartGame: () => void;
}) {
  return (
    <section className={`mplSection ${isOpen ? "isOpen" : ""}`}>
      <button className="mplSectionHeader" type="button" aria-expanded={isOpen} onClick={onToggle}>
        <span className="mplSectionTitle">{title}</span>
        <span className="mplSectionCount">{rooms.length} {countLabel}</span>
        <span className={`mplSectionToggle ${isOpen ? "open" : ""}`} aria-hidden="true">▾</span>
      </button>
      {isOpen ? (
        <div className="mplSectionBody">
          {rooms.length === 0 ? (
            <p className="mplEmpty">{emptyText}</p>
          ) : (
            rooms.map((room) => (
              <RoomRow
                key={room.id}
                room={room}
                isPrivate={isPrivate}
                labels={t}
                nowMs={nowMs}
                isConnected={isConnected}
                hasHiddenRoom={hasHiddenRoom}
                activeRoomId={activeRoomId}
                selfDisplayId={selfDisplayId}
                onJoin={() => onJoinRoom(room)}
                onStart={onStartGame}
              />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}

function RoomRow({
  room,
  isPrivate,
  labels: t,
  nowMs,
  isConnected,
  hasHiddenRoom,
  activeRoomId,
  selfDisplayId,
  onJoin,
  onStart
}: {
  readonly room: RoomSummary;
  readonly isPrivate: boolean;
  readonly labels: AppStrings;
  readonly nowMs: number;
  readonly isConnected: boolean;
  readonly hasHiddenRoom: boolean;
  readonly activeRoomId: string | undefined;
  readonly selfDisplayId: string | undefined;
  readonly onJoin: () => void;
  readonly onStart: () => void;
}) {
  const isPlaying = room.status === "IN_GAME";
  const isOwnActive = room.id === activeRoomId;
  const isJoinable = isConnected && !hasHiddenRoom && !isPlaying && room.seatsFilled < room.seatsTotal;
  const joinLabel = isOwnActive ? t.mpOpenRoom : isPrivate ? t.mpJoinWithCode : t.mpJoin;
  const joinDisabled = isOwnActive ? false : !isJoinable;
  const canStart =
    selfDisplayId !== undefined &&
    room.hostDisplayId === selfDisplayId &&
    room.status === "WAITING" &&
    room.seatsFilled === room.seatsTotal &&
    isConnected;

  return (
    <div className={`mplRow ${isPlaying ? "isLocked" : ""}`}>
      <div className="mplRowMeta">
        <span className="mplRowId">
          {isPrivate ? <span className="mplLock" aria-hidden="true">🔒</span> : null}
          #{shortRoomId(room.id)}
        </span>
        <span className="mplRowSub">👥 {room.seatsFilled}/{room.seatsTotal} · {t.roundCount}: {room.numberOfRounds}</span>
        <span className="mplRowSub">
          {t.mpExpiresIn}: {formatTtlShort(room.expiresAt, nowMs, t)}
          <RoomFeeChip entryFee={room.entryFee} labels={t} className="mplRowFee" />
        </span>
      </div>
      <div className="mplRowRight">
        <span className={`mplStatus ${isPlaying ? "playing" : ""}`}>
          {isPlaying ? t.mpStatusPlaying : t.mpStatusWaiting}
        </span>
        {isPlaying ? (
          <span className="mplRowLocked" aria-label={t.mpStatusPlaying}>🔒</span>
        ) : (
          <>
            <button className="mplRowBtn" type="button" disabled={joinDisabled} onClick={onJoin}>
              {joinLabel}
            </button>
            {canStart ? (
              <button className="mplRowBtn start" type="button" onClick={onStart}>
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
 * Pilnekrāna čats kā VIEWPORT-līmeņa slānis (NE skatuves bērns), lai ievades lauks
 * vienmēr ir redzams. Augstums seko visualViewport (mobilā klaviatūra saīsina to),
 * tāpēc ievade paliek virs klaviatūras; feed auto-ritina uz apakšu.
 */
function ChatOverlay({
  labels: t,
  messages,
  onlineCount,
  chatError,
  chatDraft,
  onDraftChange,
  onSubmit,
  onClose
}: {
  readonly labels: AppStrings;
  readonly messages: readonly ChatMessage[];
  readonly onlineCount: number;
  readonly chatError: string | null;
  readonly chatDraft: string;
  readonly onDraftChange: (value: string) => void;
  readonly onSubmit: (event: React.FormEvent) => void;
  readonly onClose: () => void;
}) {
  const viewportHeight = useVisualViewportHeight();
  const feedRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastMessageId = messages.at(-1)?.id;
  const [translations, setTranslations] = useState<Record<string, ChatTranslationState>>({});

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messages.length, lastMessageId, viewportHeight]);

  return (
    <div
      className="mplChatOverlay"
      role="dialog"
      aria-label={t.mpOnlineChat}
      style={viewportHeight !== undefined ? { height: viewportHeight } : undefined}
    >
      <div className="mplChatHead">
        <span className="mplChatOnline">
          <span className="mplChatOnlineDot" aria-hidden="true" />
          {onlineCount} {t.mpOnlineCount}
        </span>
        <button className="mplChatClose" type="button" aria-label={t.close} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      {messages.length === 0 ? (
        <p className="mplChatEmpty">{t.mpEmptyChat}</p>
      ) : (
        <ul className="mplChatFeed" ref={feedRef}>
          {messages.map((message) => (
            <li key={message.id} className="mplChatMessage">
              <span className="mplChatAuthor">{message.authorDisplayId}</span>
              <span className="mpChatBodyText">
                <span className="mplChatText">{message.text}</span>
                <MpChatTranslationText labels={t} state={translations[message.id]} />
              </span>
              <MpChatTranslationButton
                labels={t}
                message={message}
                state={translations[message.id]}
                onStateChange={(nextState) =>
                  setTranslations((current) => ({ ...current, [message.id]: nextState }))
                }
              />
            </li>
          ))}
        </ul>
      )}
      {chatError ? <p className="mplChatError" role="alert">{chatError}</p> : null}
      <form className="mplChatFoot" onSubmit={onSubmit}>
        <MpEmojiPicker
          inputRef={inputRef}
          value={chatDraft}
          maxLength={CHAT_MAX_LENGTH}
          label={t.mpEmojiPicker}
          insertLabel={t.mpEmojiInsert}
          onChange={onDraftChange}
        />
        <input
          ref={inputRef}
          className="mplChatInput"
          type="text"
          maxLength={CHAT_MAX_LENGTH}
          placeholder={t.mpChatPlaceholder}
          aria-label={t.mpOnlineChat}
          value={chatDraft}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
        />
        <button className="mplChatSend" type="submit">{t.mpSend}</button>
      </form>
    </div>
  );
}

/** Redzamā skatloga augstums (seko mobilās klaviatūras atvēršanai). */
function useVisualViewportHeight(): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return height;
}

/** Īsa istabas atsauce no UUID (vizuāla; pilns join notiek ar klikšķi/kodu). */
function shortRoomId(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

/** Kompakts TTL (h:mm:ss vai m:ss). */
function formatTtlShort(expiresAt: number, nowMs: number, t: AppStrings): string {
  const total = Math.max(0, Math.ceil((expiresAt - nowMs) / 1000));
  if (total <= 0) return t.mpExpired;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v: number) => v.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function ReturnIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h11a5 5 0 0 1 5 5v1" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5Z" />
    </svg>
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
