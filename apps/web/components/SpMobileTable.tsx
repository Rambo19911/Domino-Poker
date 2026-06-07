"use client";

import { calculateRoundScore, tileKey } from "@domino-poker/core";
import type { DominoTile, GameState } from "@domino-poker/core";

import type { AppStrings } from "../lib/i18n";
import type { VisualSeat } from "../lib/mp/gameTableView";
import {
  MP_MOBILE_POS,
  MP_MOBILE_SIZE,
  TRICK_SLOT_BY_VISUAL_SEAT,
  centerBox,
  centerPoint
} from "../lib/mp/mobileLayout";
import { formatTemplate } from "../lib/mp/seatLabel";
import { useMobileStageLayout } from "../lib/mobileStage";
import { DominoTileView } from "./DominoTileView";
import { ExitIcon } from "./GameDialogs";
import { MobileRoundCount } from "./MobileRoundCount";

type SpPlayer = GameState["players"][number];

/**
 * Portrēta (telefonu) izkārtojums vienam spēlētājam (SP) — spoguļo MP `MpMobileTable`,
 * bet lasa lokālo `GameState` un IZLAIŽ visus laika elementus (nav 10s gājiena
 * taimera, nav pirmsspēles atskaites). Ģeometrija (`lib/mp/mobileLayout.ts`) un CSS
 * (`.mpm*`) ir koplietoti ar MP — cilvēks = vizuālā vieta 0 (apakša), AI = 1/2/3.
 */
export function SpMobileTable({
  labels: t,
  gameState,
  humanProfile,
  validTileKeys,
  isViewerTurn,
  onTileClick,
  onLeave
}: {
  readonly labels: AppStrings;
  readonly gameState: GameState;
  readonly humanProfile: {
    readonly avatarUrl: string | null;
    readonly title: string | null;
  };
  readonly validTileKeys: ReadonlySet<string>;
  readonly isViewerTurn: boolean;
  readonly onTileClick: (tile: DominoTile) => void;
  readonly onLeave: () => void;
}) {
  const stage = useMobileStageLayout();
  const showLeadInfo = gameState.leadTile !== undefined && gameState.phase === "playing";
  const viewerHand = gameState.players[0]?.hand ?? [];

  return (
    <div className="mpmStageClip">
      <div
        className="mpmStage"
        aria-label={t.gameTableLabel}
        style={{ left: stage.left, top: stage.top, transform: `scale(${stage.scale})`, transformOrigin: "top left" }}
      >
        <button
          className="mpmLeaveButton"
          type="button"
          aria-label={t.exit}
          style={centerBox(MP_MOBILE_POS.leave, MP_MOBILE_SIZE.leavePx, MP_MOBILE_SIZE.leaveAspect)}
          onClick={onLeave}
        >
          <ExitIcon />
        </button>

        <SpmSummaryTable labels={t} players={gameState.players} activeIndex={gameState.currentPlayerIndex} />

        <MobileRoundCount labels={t} currentRound={gameState.currentRound} totalRounds={gameState.totalRounds} />

        <section
          className="mpmTable"
          aria-label={t.currentTrickLabel}
          style={centerBox(MP_MOBILE_POS.table, MP_MOBILE_SIZE.tablePx, MP_MOBILE_SIZE.tableAspect)}
        >
          <img className="mpmTableLogo" src="/assets/images/domino_poker_logo.png" alt="" aria-hidden="true" />
        </section>

        {showLeadInfo && (gameState.isTrumpLead || gameState.isAceLead) ? (
          <div
            className={`mpmTableTopLabel ${gameState.isTrumpLead ? "danger" : "gold"}`}
            style={centerPoint(MP_MOBILE_POS.trumpLabel)}
          >
            {gameState.isTrumpLead ? t.trump : t.ace}
          </div>
        ) : null}

        {gameState.currentTrick.map((play) => {
          const slot = TRICK_SLOT_BY_VISUAL_SEAT[play.playerIndex as VisualSeat];
          return (
            <div
              key={`${play.playerIndex}-${play.tile.side1}-${play.tile.side2}`}
              className="mpmTrickTile"
              style={centerPoint(MP_MOBILE_POS.trick[slot])}
            >
              <DominoTileView tile={play.tile} isPlayable />
              {play.declaredNumber !== undefined ? <span className="mpmDeclared">{play.declaredNumber}</span> : null}
            </div>
          );
        })}

        {gameState.players.map((player, index) => (
          <SpmSeat
            key={player.id}
            labels={t}
            player={player}
            seatIndex={index as VisualSeat}
            isActive={gameState.currentPlayerIndex === index}
            isDealer={gameState.dealerIndex === index}
            avatarUrl={index === 0 ? humanProfile.avatarUrl : null}
            title={index === 0 ? humanProfile.title : null}
          />
        ))}

        {viewerHand.map((tile, index) => {
          const pos = MP_MOBILE_POS.hand[index];
          if (!pos) return null;
          const isValid = isViewerTurn && validTileKeys.has(tileKey(tile));
          return (
            <button
              className={`mpmTile mpmHandTile ${isValid ? "valid" : ""}`}
              key={`${tile.side1}-${tile.side2}-${index}`}
              type="button"
              aria-label={formatTemplate(t.playTile, { tile: `${tile.side1}-${tile.side2}` })}
              disabled={!isValid}
              style={centerPoint(pos)}
              onClick={() => onTileClick(tile)}
            >
              <DominoTileView tile={tile} isPlayable={isValid} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpmSeat({
  labels: t,
  player,
  seatIndex,
  isActive,
  isDealer,
  avatarUrl,
  title
}: {
  readonly labels: AppStrings;
  readonly player: SpPlayer;
  readonly seatIndex: VisualSeat;
  readonly isActive: boolean;
  readonly isDealer: boolean;
  readonly avatarUrl: string | null;
  readonly title: string | null;
}) {
  const pos = MP_MOBILE_POS.seats[seatIndex];
  const hasBid = player.bid >= 0;
  // Tekošā raunda punkti (kopsumma ir augšējā tabulā). Pirms solījuma — "–".
  const roundScore = hasBid ? calculateRoundScore({ bid: player.bid, tricksWon: player.tricksWon }) : null;
  // Cipari: zaļi, ja paņemts tieši solītais; sarkani, ja pārņemts; citādi neitrāli.
  const bidWonState = !hasBid
    ? ""
    : player.tricksWon === player.bid
      ? "matched"
      : player.tricksWon > player.bid
        ? "over"
        : "";

  return (
    <>
      <div
        className={`mpmProfile ${avatarUrl ? "hasAvatar" : ""} ${isActive ? "active" : ""} ${isDealer ? "dealer" : ""}`}
        style={centerBox(pos.profile, MP_MOBILE_SIZE.profilePx, 1)}
        aria-label={player.name}
      >
        {avatarUrl ? <img className="mpmProfileAvatar" src={avatarUrl} alt="" aria-hidden="true" /> : null}
        {title ? <span className="mpmProfileTitle">{title}</span> : null}
      </div>

      <div
        className={`mpmBadge mpmBidWon ${bidWonState}`}
        style={centerBox(pos.bidWon, MP_MOBILE_SIZE.badgePx, 1)}
        aria-label={`${t.tricksBid} / ${t.tricksWon}: ${hasBid ? player.bid : "?"}/${player.tricksWon}`}
      >
        {hasBid ? player.bid : "?"}/{player.tricksWon}
      </div>

      <div
        className="mpmBadge mpmPoints"
        style={centerBox(pos.points, MP_MOBILE_SIZE.badgePx, 1)}
        aria-label={`${t.pointsLabel}: ${roundScore ?? "-"}`}
      >
        {roundScore ?? "–"}
      </div>

      {pos.tileCount ? (
        <div
          className="mpmBadge mpmTileCount"
          style={centerBox(pos.tileCount, MP_MOBILE_SIZE.badgePx, 1)}
          aria-label={`${player.hand.length}`}
        >
          {player.hand.length}
        </div>
      ) : null}
    </>
  );
}

/**
 * Kopējo punktu tabula augšējā zonā (vairāku raundu spēlēm): spēlētāja vārds +
 * kopsumma. Aktīvajam spēlētājam izceļas gan profila aplis, gan rinda šeit.
 */
function SpmSummaryTable({
  labels: t,
  players,
  activeIndex
}: {
  readonly labels: AppStrings;
  readonly players: GameState["players"];
  readonly activeIndex: number;
}) {
  return (
    <div
      className="mpmSummary"
      aria-label={t.gameStatus}
      style={{
        left: `${MP_MOBILE_POS.summary.cx * 100}%`,
        top: `${MP_MOBILE_POS.summary.cy * 100}%`,
        width: `${MP_MOBILE_SIZE.summaryPx}px`,
        transform: "translate(-50%, -50%)"
      }}
    >
      {players.map((player, index) => (
        <div className={`mpmSummaryRow ${index === activeIndex ? "active" : ""}`} key={player.id}>
          <span className="mpmSummaryName">{player.name}</span>
          <span className="mpmSummaryScore">{player.totalScore}</span>
        </div>
      ))}
    </div>
  );
}
