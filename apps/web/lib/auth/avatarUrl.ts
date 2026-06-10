import { avatarFilePath, DEFAULT_AVATAR_ID } from "@domino-poker/shared";

import { httpBase } from "./authApi";

/**
 * Atrisina avatar vērtību uz attēla URL (Fāze 5 — custom avatari):
 *   - preset id (`avatar-NN`) → Next.js `public/` SVG;
 *   - `'custom'` (paša lietotāja) → serve URL ar zināmu `ownUserId` + versiju;
 *   - `'custom:<userId>:<version>'` (serveris iekodē MP sēdvietām) → serve URL.
 *
 * `'custom'` bez `ownUserId` (nav konteksta) → noklusējuma preset (drošs fallback,
 * nekad nesalūzis attēls).
 */
export function avatarUrl(avatar: string, ownUserId?: string, ownVersion?: number): string {
  if (avatar.startsWith("custom:")) {
    const parts = avatar.split(":");
    const userId = parts[1] ?? "";
    const version = parts[2] ?? "";
    return `${httpBase()}/auth/avatar/${encodeURIComponent(userId)}?v=${encodeURIComponent(version)}`;
  }
  if (avatar === "custom") {
    if (ownUserId !== undefined && ownUserId !== "") {
      return `${httpBase()}/auth/avatar/${encodeURIComponent(ownUserId)}?v=${ownVersion ?? ""}`;
    }
    return avatarFilePath(DEFAULT_AVATAR_ID);
  }
  return avatarFilePath(avatar);
}
