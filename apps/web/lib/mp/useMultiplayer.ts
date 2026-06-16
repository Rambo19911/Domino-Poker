"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { readLocalStorage, writeLocalStorage } from "../safeStorage";
import { getOrCreateClientId } from "./clientId";
import { initialClientView, type ClientView } from "./clientView";
import { MultiplayerClient, type CreateRoomOptions, type MoveIntent } from "./MultiplayerClient";
import { resolveServerUrl } from "./serverUrl";
import { createBrowserSocket } from "./webSocketAdapter";

const RECONNECT_TOKEN_KEY = "domino-poker-reconnect-token";

export interface MultiplayerActions {
  readonly createRoom: (options?: CreateRoomOptions) => void;
  readonly viewRoom: (roomId: string, code?: string) => void;
  readonly viewRoomByCode: (code: string) => void;
  readonly joinRoomSeat: (roomId: string, seatIndex: number, code?: string) => void;
  readonly leaveRoom: () => void;
  /** Lokāla atgriešanās lobby pēc partijas beigām (serveris istabu jau iznīcinājis). */
  readonly returnToLobby: () => void;
  readonly deleteRoom: () => void;
  readonly fillSeatsWithBots: () => void;
  readonly startGame: () => void;
  readonly sendChat: (text: string) => void;
  readonly submitBid: (bid: number) => void;
  readonly submitMove: (move: MoveIntent) => void;
  readonly listRooms: () => void;
}

export interface MultiplayerApi {
  readonly view: ClientView;
  readonly actions: MultiplayerActions;
}

/**
 * React tilts uz `MultiplayerClient`. Pārvalda savienojuma dzīves ciklu (connect
 * uz mount, close uz unmount), `clientId` (safeStorage) un `reconnectToken`
 * (safeStorage), un atklāj `ClientView` + stabilas darbības komponentiem.
 * Visa protokola loģika paliek `MultiplayerClient` (jau testēta).
 */
export interface UseMultiplayerOptions {
  /** Pašreizējais auth tokens (vai `null`). Maiņa (login/logout) → reconnect. */
  readonly authToken?: string | null;
  /** Stabils tokena lasītājs HELLO vajadzībām (lasa jaunāko vērtību). */
  readonly getAuthToken?: () => string | undefined;
}

export function useMultiplayer(options: UseMultiplayerOptions = {}): MultiplayerApi {
  const { authToken = null, getAuthToken } = options;
  const [view, setView] = useState<ClientView>(initialClientView);
  const clientRef = useRef<MultiplayerClient | undefined>(undefined);
  // Ref, lai HELLO vienmēr lasa jaunāko tokenu bez efekta atkārtotas palaišanas.
  const getAuthTokenRef = useRef(getAuthToken);
  getAuthTokenRef.current = getAuthToken;

  // `authToken` atkarībā: login/logout maiņa pārveido savienojumu ar svaigu HELLO.
  useEffect(() => {
    const client = new MultiplayerClient({
      url: resolveServerUrl({ envUrl: process.env.NEXT_PUBLIC_MP_WS_URL }),
      clientId: getOrCreateClientId(),
      clientBuild: "web",
      socketFactory: createBrowserSocket,
      onView: setView,
      getReconnectToken: () => readLocalStorage(RECONNECT_TOKEN_KEY) ?? undefined,
      onReconnectToken: (token) => {
        writeLocalStorage(RECONNECT_TOKEN_KEY, token);
      },
      getAuthToken: () => getAuthTokenRef.current?.()
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      clientRef.current = undefined;
    };
  }, [authToken]);

  // Stabilas darbības, kas vienmēr deleģē uz pašreizējo klientu.
  const actions = useMemo<MultiplayerActions>(
    () => ({
      createRoom: (options) => clientRef.current?.createRoom(options),
      viewRoom: (roomId, code) => clientRef.current?.viewRoom(roomId, code),
      viewRoomByCode: (code) => clientRef.current?.viewRoom(undefined, code),
      joinRoomSeat: (roomId, seatIndex, code) => clientRef.current?.joinRoom(roomId, code, seatIndex),
      leaveRoom: () => clientRef.current?.leaveRoom(),
      returnToLobby: () => clientRef.current?.returnToLobby(),
      deleteRoom: () => clientRef.current?.deleteRoom(),
      fillSeatsWithBots: () => clientRef.current?.fillSeatsWithBots(),
      startGame: () => clientRef.current?.startGame(),
      sendChat: (text) => clientRef.current?.sendChat(text),
      submitBid: (bid) => clientRef.current?.submitBid(bid),
      submitMove: (move) => clientRef.current?.submitMove(move),
      listRooms: () => clientRef.current?.listRooms()
    }),
    []
  );

  return { view, actions };
}
