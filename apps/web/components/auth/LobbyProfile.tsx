"use client";

import { avatarFilePath, isLoser, titleForWins } from "@domino-poker/shared";

import type { AuthUser } from "../../lib/auth/authApi";
import { titleLabel } from "../../lib/auth/titleLabel";
import type { AuthStatus } from "../../lib/auth/useAuthUser";
import type { AppStrings } from "../../lib/i18n";

/** Ieskaitītā statistika (Fāze 3 padod reālus skaitļus; pagaidām noklusējums 0). */
export interface ProfileStats {
  readonly wins: number;
  readonly losses: number;
}

/**
 * Publiskais profila bloks main-lobby. Redzams TIKAI pēc ielogošanās (anonīmam —
 * nekas; ielogošanās notiek caur topbar login ikonu). Pats bloks ir klikšķināms
 * ieejas punkts uz profila rediģēšanu. Izkārtojumu (desktop: avatars augšā +
 * stats taisnstūris zem; mobilā: kreisie stats | avatars | labie stats) nosaka CSS
 * (`grid-template-areas`), sinhroni ar wheel↔compact pārslēgu.
 */
export function LobbyProfile({
  labels: t,
  status,
  user,
  stats,
  onOpen
}: {
  readonly labels: AppStrings;
  readonly status: AuthStatus;
  readonly user: AuthUser | null;
  readonly stats?: ProfileStats;
  readonly onOpen: () => void;
}) {
  // Anonīmam / ielādes laikā NEKĀDA profila apzīmējuma (sk. lietotāja prasību).
  if (status !== "authenticated" || user === null) {
    return null;
  }

  const wins = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const games = wins + losses;
  const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
  const title = titleLabel(t, titleForWins(wins));
  const loser = isLoser(wins, losses);

  return (
    <button
      type="button"
      className="lobbyProfile lobbyProfileAuthed"
      onClick={onOpen}
      aria-label={t.profile}
    >
      <span className="lobbyProfileStats lobbyProfileStatsLeft">
        <ProfileStat label={t.statsWins} value={String(wins)} />
        <ProfileStat label={t.statsWinRate} value={`${winRate}%`} />
      </span>
      <span className="lobbyProfileAvatarBlock">
        <span className="lobbyProfileAvatar">
          <img src={avatarFilePath(user.avatar)} alt="" />
        </span>
        <span className="lobbyProfileName">{user.username}</span>
        <span className="lobbyProfileTitle">{title}</span>
        {loser ? <span className="lobbyProfileLoser">{t.titleLoser}</span> : null}
      </span>
      <span className="lobbyProfileStats lobbyProfileStatsRight">
        <ProfileStat label={t.statsLosses} value={String(losses)} />
        <ProfileStat label={t.statsGames} value={String(games)} />
      </span>
    </button>
  );
}

function ProfileStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <span className="lobbyProfileStat">
      <span className="lobbyProfileStatValue">{value}</span>
      <span className="lobbyProfileStatLabel">{label}</span>
    </span>
  );
}
