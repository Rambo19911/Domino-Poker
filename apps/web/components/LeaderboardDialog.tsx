"use client";

import { useEffect, useState } from "react";

import { rankToBadge, type LeaderboardEntry, type LeaderboardResponse } from "@domino-poker/shared";

import { apiLeaderboard } from "../lib/auth/authApi";
import { avatarUrl } from "../lib/auth/avatarUrl";
import type { AppStrings } from "../lib/i18n";
import { badgeAssetPath } from "../lib/leaderboard/badgeAsset";
import type { AudioSettings } from "../lib/useAudioSettings";
import { Dialog } from "./Dialog";
import { IconButton } from "./ui/IconButton";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly data: LeaderboardResponse };

/**
 * Globālais tops (Leaderboard fāze). Ielādē `GET /auth/leaderboard` uz atvēršanos
 * (token opcionāls → `me`). Fiksētu kolonnu grid (rinda nepārbīdās gara nickname dēļ);
 * apakšā "mana vieta" panelis (anonīms / vēl-nav-ranžēts / ārpus top N).
 */
export function LeaderboardDialog({
  audio,
  labels: t,
  getToken,
  onClose
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly getToken: () => string | undefined;
  readonly onClose: () => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void apiLeaderboard(getToken()).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: "ready", data: result.data } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [getToken, reloadKey]);

  // "?" info pats pazūd pēc 5s (atkārtots klikšķis atiestata taimeri; manuāla aizvēršana to notīra).
  useEffect(() => {
    if (!infoOpen) {
      return undefined;
    }
    const timer = window.setTimeout(() => setInfoOpen(false), 5000);
    return () => window.clearTimeout(timer);
  }, [infoOpen]);

  const handleClose = () => {
    audio.play("uiClick");
    onClose();
  };

  return (
    <Dialog
      ariaLabelledBy="leaderboard-title"
      className="alertDialog leaderboardDialog"
      onEscape={handleClose}
      resetScrollOnMount
    >
      <div className="settingsHeader">
        <div>
          <h2 id="leaderboard-title">
            <TrophyIcon /> {t.leaderboard}
            <button
              className="leaderboardInfoButton"
              type="button"
              aria-label={t.leaderboardInfoLabel}
              aria-expanded={infoOpen}
              onClick={() => {
                audio.play("uiClick");
                setInfoOpen((open) => !open);
              }}
            >
              ?
            </button>
          </h2>
          <p>{t.leaderboardDescription}</p>
        </div>
        <IconButton className="settingsCloseButton" label={t.close} onClick={handleClose}>
          <CloseIcon />
        </IconButton>
      </div>

      {infoOpen && state.status === "ready" ? (
        <p className="leaderboardInfo" role="note">
          {t.leaderboardMinGamesInfo.replace("{min}", String(state.data.minGames))}
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p className="leaderboardStatus">{t.leaderboardLoading}</p>
      ) : state.status === "error" ? (
        <div className="leaderboardStatus">
          <p>{t.leaderboardError}</p>
          <button
            className="leaderboardRetry"
            type="button"
            onClick={() => {
              audio.play("uiClick");
              setReloadKey((key) => key + 1);
            }}
          >
            {t.leaderboardRetry}
          </button>
        </div>
      ) : (
        <LeaderboardTable data={state.data} labels={t} />
      )}
    </Dialog>
  );
}

function LeaderboardTable({
  data,
  labels: t
}: {
  readonly data: LeaderboardResponse;
  readonly labels: AppStrings;
}) {
  const selfRank = data.me.status === "ranked" ? data.me.entry.rank : null;
  // "Mana vieta" panelis tikai kad spēlētājs NAV redzamajā sarakstā (ārpus top N) vai
  // nav ranžēts/anonīms; ja redzams sarakstā — viņa rinda tiek izcelta (self klase).
  const rankedVisible =
    data.me.status === "ranked" && data.me.entry.rank <= data.entries.length;

  return (
    <>
      {data.entries.length === 0 ? (
        <p className="leaderboardStatus">{t.leaderboardEmpty}</p>
      ) : (
        <div className="leaderboardTable" role="table" aria-label={t.leaderboard}>
          {/* Galvene: īsie saīsinājumi (W/L/G/%) lai tabula ietilpst mobilajā bez
              horizontālā scroll; pilnais nosaukums paliek aria-label/title (a11y). */}
          <div className="leaderboardRow leaderboardHead" role="row">
            <span className="lbRank" role="columnheader">#</span>
            <span className="lbAvatar" role="columnheader" aria-hidden="true" />
            <span className="lbName" role="columnheader">{t.leaderboardColPlayer}</span>
            <span className="lbBadge" role="columnheader" aria-hidden="true" />
            <span className="lbNum" role="columnheader" aria-label={t.leaderboardColWins} title={t.leaderboardColWins}>W</span>
            <span className="lbNum" role="columnheader" aria-label={t.leaderboardColLosses} title={t.leaderboardColLosses}>L</span>
            <span className="lbNum" role="columnheader" aria-label={t.leaderboardColGames} title={t.leaderboardColGames}>G</span>
            <span className="lbNum" role="columnheader" aria-label={t.leaderboardColWinRate} title={t.leaderboardColWinRate}>%</span>
            <span className="lbLang" role="columnheader" aria-label={t.leaderboardColLanguage} title={t.leaderboardColLanguage} />
          </div>
          {data.entries.map((entry) => (
            <LeaderboardRow key={entry.rank} entry={entry} self={entry.rank === selfRank} />
          ))}
        </div>
      )}

      {data.me.status === "anonymous" ? (
        <div className="leaderboardSelf" role="note">
          {t.leaderboardAnonymous}
        </div>
      ) : data.me.status === "unranked" ? (
        <div className="leaderboardSelf">
          <strong>{t.leaderboardNotRanked}</strong>{" "}
          {t.leaderboardNotRankedInfo
            .replace("{min}", String(data.minGames))
            .replace("{games}", String(data.me.gamesPlayed))}
        </div>
      ) : !rankedVisible ? (
        <div className="leaderboardSelf">
          <span className="leaderboardSelfLabel">{t.leaderboardYourPosition}</span>
          <div className="leaderboardTable leaderboardSelfTable" role="table" aria-label={t.leaderboardYourPosition}>
            <LeaderboardRow entry={data.me.entry} self />
          </div>
        </div>
      ) : null}
    </>
  );
}

function LeaderboardRow({
  entry,
  self = false
}: {
  readonly entry: LeaderboardEntry;
  readonly self?: boolean;
}) {
  const badge = rankToBadge(entry.rank);
  const winPct = Math.round(entry.winRate * 100);
  return (
    <div className={`leaderboardRow ${self ? "self" : ""}`} role="row">
      <span className="lbRank" role="cell">{entry.rank}</span>
      <span className="lbAvatar" role="cell">
        <img className="lbAvatarImg" src={avatarUrl(entry.avatar)} alt="" aria-hidden="true" />
      </span>
      <span className="lbName" role="cell" title={entry.username}>
        {entry.username}
      </span>
      <span className="lbBadge" role="cell">
        {badge ? (
          <img
            className={`lbBadgeImg ${entry.rank === 1 ? "top1" : entry.rank <= 3 ? "top3" : ""}`}
            src={badgeAssetPath(badge)}
            alt=""
            aria-hidden="true"
          />
        ) : null}
      </span>
      <span className="lbNum" role="cell">{entry.wins}</span>
      <span className="lbNum" role="cell">{entry.losses}</span>
      <span className="lbNum" role="cell">{entry.gamesPlayed}</span>
      <span className="lbNum" role="cell">{winPct}%</span>
      <span className="lbLang" role="cell">{entry.language.toUpperCase()}</span>
    </div>
  );
}

/** Animēta trofeja — main-lobby pogai un dialoga galvenei (saglabā krāsas, bez invert). */
export function TrophyIcon() {
  return (
    <span className="trophyAssetIcon" aria-hidden="true">
      <img className="trophyAssetImg" src="/assets/icons/animated_trophy.gif" alt="" />
    </span>
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
