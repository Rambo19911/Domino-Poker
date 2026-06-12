"use client";

import { useEffect, useState } from "react";

import type { AppStrings } from "../i18n";
import type { ClientError } from "./clientView";

export interface LobbyTransientErrors {
  /** Izgaistoša čata kļūda (rate-limit/nederīga ziņa) — TIKAI čata konteinerā (4 s). */
  readonly chatError: string | null;
  /** Izgaistoša vispārēja kļūda — augšējā lobby joslā (6 s). */
  readonly lobbyError: string | null;
}

/**
 * Visas MP lobby kļūdas ir IZGAISTOŠAS (transient), lai tās nekad nepaliek "iestrēgušas"
 * lobby (piem. spēles kļūda "does not own current turn" pēc spēles beigām).
 *   - Čata kļūdas (rate-limit/nederīga) → čata konteinerā (4 s).
 *   - Pārējās → augšējā lobby josla (6 s).
 * `lastError` atsauce mainās uz katru jaunu ERROR → efekts pārstartē taimeri.
 * Kad `lastError` tiek notīrīts (piem. ROOM_LEFT), abas joslas nodziest uzreiz.
 *
 * Uzvedība ir identiska iepriekšējam inline efektam `MultiplayerLobby` (pretējais
 * grozs NETIEK tīrīts uz jaunu kļūdu; cleanup notīra tikai šī tipa taimeri).
 */
export function useLobbyTransientErrors(
  lastError: ClientError | undefined,
  t: AppStrings
): LobbyTransientErrors {
  const [chatError, setChatError] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  useEffect(() => {
    if (!lastError) {
      setChatError(null);
      setLobbyError(null);
      return;
    }
    const chatText = chatErrorText(lastError.code, t);
    if (chatText !== undefined) {
      setChatError(chatText);
      const timeout = window.setTimeout(() => setChatError(null), 4000);
      return () => window.clearTimeout(timeout);
    }
    setLobbyError(lastError.message);
    const timeout = window.setTimeout(() => setLobbyError(null), 6000);
    return () => window.clearTimeout(timeout);
  }, [lastError, t]);

  return { chatError, lobbyError };
}

/**
 * Lokalizēts čata kļūdas teksts pēc servera koda, vai `undefined`, ja kļūda nav
 * čata kļūda (tad to rāda vispārējā augšējā joslā). Čata kļūdas (rate-limit /
 * nederīga ziņa) tiek rādītas izgaistoši TIKAI čata konteinerā. Eksportēts unit
 * testēšanai (izšķir, vai kļūda iet čata vai lobby grozā).
 */
export function chatErrorText(code: string, t: AppStrings): string | undefined {
  if (code === "RATE_LIMITED") return t.mpChatRateLimited;
  if (code === "INVALID_MESSAGE") return t.mpChatInvalid;
  return undefined;
}
