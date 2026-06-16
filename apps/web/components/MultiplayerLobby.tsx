"use client";

import { useEffect, useState } from "react";

import { type RoomView } from "@domino-poker/shared";

import type { AppStrings } from "../lib/i18n";
import { toGameTableView } from "../lib/mp/gameTableView";
import { useLobbyTransientErrors } from "../lib/mp/useLobbyTransientErrors";
import { useMultiplayer } from "../lib/mp/useMultiplayer";
import type { AudioSettings } from "../lib/useAudioSettings";
import { MpDesktopLobby } from "./mp/MpDesktopLobby";
import { MpGameTable } from "./mp/MpGameTable";
import { MpLobbyDialogs } from "./mp/MpLobbyDialogs";
import { MpMobileLobby } from "./mp/MpMobileLobby";
import { useIsPhonePortrait } from "../lib/mobileStage";

export function MultiplayerLobby({
  audio,
  labels: t,
  onExit,
  authToken,
  getAuthToken
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onExit: () => void;
  /** Auth tokens (vai `null`); maiņa → WS reconnect ar svaigu HELLO. */
  readonly authToken?: string | null;
  readonly getAuthToken?: () => string | undefined;
}) {
  const { view, actions } = useMultiplayer({
    authToken: authToken ?? null,
    ...(getAuthToken ? { getAuthToken } : {})
  });
  const isPhonePortrait = useIsPhonePortrait();
  const [chatDraft, setChatDraft] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinCodeOpen, setIsJoinCodeOpen] = useState(false);
  const [isRoomScreenHidden, setIsRoomScreenHidden] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isDeleteRoomOpen, setIsDeleteRoomOpen] = useState(false);
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
      setIsDeleteRoomOpen(false);
    }
  }, [activeRoom]);

  // Izgaistošās (transient) lobby kļūdas — sk. useLobbyTransientErrors.
  const { chatError, lobbyError } = useLobbyTransientErrors(view.lastError, t);

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
        onLeaveFinishedGame={() => {
          audio.play("uiClick");
          actions.returnToLobby();
        }}
      />
    );
  }

  return (
    <main className="mpLobby">
      {isPhonePortrait && !currentRoom ? (
        <MpMobileLobby
          labels={t}
          connection={view.connection}
          onlineCount={view.lobby.onlineCount}
          chatMessages={view.lobby.chat}
          publicRooms={publicRooms}
          privateRooms={privateRooms}
          selfDisplayId={view.identity?.displayId}
          activeRoomId={activeRoom?.id}
          hasHiddenRoom={hasHiddenRoom}
          isConnected={view.connection === "connected"}
          nowMs={nowMs}
          lobbyError={lobbyError}
          chatError={chatError}
          isMuted={audio.isMuted}
          onCreateRoom={() => {
            audio.play("uiClick");
            setIsCreateOpen(true);
          }}
          onJoinWithCode={() => {
            audio.play("uiClick");
            setIsJoinCodeOpen(true);
          }}
          onOpenHiddenRoom={() => {
            audio.play("uiClick");
            setIsRoomScreenHidden(false);
          }}
          onViewRoom={(roomId) => {
            audio.play("uiClick");
            actions.viewRoom(roomId);
          }}
          onStartGame={() => {
            audio.play("uiClick");
            actions.startGame();
          }}
          onSendChat={(text) => {
            audio.play("uiClick");
            actions.sendChat(text);
          }}
          onOpenRules={() => {
            audio.play("uiClick");
            setIsRulesOpen(true);
          }}
          onToggleMute={() => audio.toggleMute()}
          onExit={clickThenExit}
        />
      ) : (
        <MpDesktopLobby
          labels={t}
          connection={view.connection}
          onlineCount={view.lobby.onlineCount}
          chatMessages={view.lobby.chat}
          publicRooms={publicRooms}
          privateRooms={privateRooms}
          selfDisplayId={view.identity?.displayId}
          activeRoomId={activeRoom?.id}
          currentRoom={currentRoom}
          hasHiddenRoom={hasHiddenRoom}
          isConnected={view.connection === "connected"}
          nowMs={nowMs}
          lobbyError={lobbyError}
          chatError={chatError}
          lastErrorRequestId={view.lastError?.requestId}
          chatDraft={chatDraft}
          isMuted={audio.isMuted}
          onOpenRules={() => {
            audio.play("uiClick");
            setIsRulesOpen(true);
          }}
          onToggleMute={() => audio.toggleMute()}
          onExit={clickThenExit}
          onCreateRoom={() => {
            audio.play("uiClick");
            setIsCreateOpen(true);
          }}
          onJoinWithCode={() => {
            audio.play("uiClick");
            setIsJoinCodeOpen(true);
          }}
          onOpenHiddenRoom={() => {
            audio.play("uiClick");
            setIsRoomScreenHidden(false);
          }}
          onViewRoom={(roomId) => {
            audio.play("uiClick");
            actions.viewRoom(roomId);
          }}
          onStartGame={() => {
            audio.play("uiClick");
            actions.startGame();
          }}
          onChatDraftChange={setChatDraft}
          onSubmitChat={submitChat}
          onBackToLobby={() => {
            audio.play("uiClick");
            setIsRoomScreenHidden(true);
          }}
          onChooseSeat={(seatIndex) => {
            if (!currentRoom) return;
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
          onRequestDeleteRoom={() => {
            audio.play("uiClick");
            setIsDeleteRoomOpen(true);
          }}
        />
      )}

      <MpLobbyDialogs
        isCreateOpen={isCreateOpen}
        isJoinCodeOpen={isJoinCodeOpen}
        isRulesOpen={isRulesOpen}
        isDeleteRoomOpen={isDeleteRoomOpen}
        isConnected={view.connection === "connected"}
        audio={audio}
        labels={t}
        onCreate={(settings) => {
          audio.play("uiClick");
          actions.createRoom(settings);
          setIsCreateOpen(false);
        }}
        onCancelCreate={() => setIsCreateOpen(false)}
        onJoin={(code) => {
          audio.play("uiClick");
          actions.viewRoomByCode(code);
          setIsJoinCodeOpen(false);
        }}
        onCancelJoin={() => setIsJoinCodeOpen(false)}
        onCloseRules={() => setIsRulesOpen(false)}
        onConfirmDeleteRoom={() => {
          audio.play("uiClick");
          actions.deleteRoom();
          setIsDeleteRoomOpen(false);
        }}
        onCancelDeleteRoom={() => setIsDeleteRoomOpen(false)}
      />
    </main>
  );
}

function isDisplayIdSeated(room: RoomView, displayId: string | undefined): boolean {
  return displayId !== undefined && room.seats.some((seat) => seat.kind === "human" && seat.displayId === displayId);
}
