"use client";

import { calculateRoundScore, tileKey } from "@domino-poker/core";
import type { DominoTile } from "@domino-poker/core";
import type { AppStrings } from "../../lib/i18n";
import { avatarUrl } from "../../lib/auth/avatarUrl";
import { titleLabel } from "../../lib/auth/titleLabel";
import type { MpGameTableView, MpTableSeat, MpTrickPlay } from "../../lib/mp/gameTableView";
import {
  MP_MOBILE_POS,
  MP_MOBILE_SIZE,
  TRICK_SLOT_BY_VISUAL_SEAT,
  centerBox,
  centerPoint
} from "../../lib/mp/mobileLayout";
import { formatTemplate, seatLabel } from "../../lib/mp/seatLabel";
import { useMobileStageLayout } from "../../lib/mobileStage";
import { DominoTileView } from "../DominoTileView";
import { ExitIcon } from "../GameDialogs";
import { MobileRoundCount } from "../MobileRoundCount";

/**
 * Portrēta (telefonu) izkārtojums MP galdam. Atsevišķs renderēšanas ceļš no
 * desktop `MpGameTable` fiksētās 1920×1080 skatuves; SP zona netiek skarta.
 * Ģeometrija nāk no `mobileLayout.ts` (atvasināta no Photoshop zīmējuma).
 */
export function MpMobileTable({
  labels: t,
  table,
  trick,
  frozen,
  activeSeatIndex,
  viewerHand,
  isViewerTurn,
  validTileKeys,
  remainingSeconds,
  preGameSeconds,
  errorToast,
  onTileClick,
  onLeave
}: {
  readonly labels: AppStrings;
  readonly table: MpGameTableView;
  readonly trick: readonly MpTrickPlay[];
  readonly frozen: boolean;
  readonly activeSeatIndex: number | undefined;
  readonly viewerHand: readonly DominoTile[];
  readonly isViewerTurn: boolean;
  readonly validTileKeys: ReadonlySet<string>;
  readonly remainingSeconds: number | undefined;
  readonly preGameSeconds: number | undefined;
  readonly errorToast: string | null;
  readonly onTileClick: (tile: DominoTile) => void;
  readonly onLeave: () => void;
}) {
  const showLeadInfo = !frozen && table.leadTile !== undefined && table.phase === "playing";
  const stage = useMobileStageLayout();

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

      <MpmSummaryTable labels={t} seats={table.seats} activeSeatIndex={activeSeatIndex} />

      <MobileRoundCount labels={t} currentRound={table.currentRound} totalRounds={table.totalRounds} />

      <section
        className="mpmTable"
        aria-label={t.currentTrickLabel}
        style={centerBox(MP_MOBILE_POS.table, MP_MOBILE_SIZE.tablePx, MP_MOBILE_SIZE.tableAspect)}
      >
        <img className="mpmTableLogo" src="/assets/images/domino_poker_logo.png" alt="" aria-hidden="true" />
      </section>

      {showLeadInfo && (table.isTrumpLead || table.isAceLead) ? (
        <div
          className={`mpmTableTopLabel ${table.isTrumpLead ? "danger" : "gold"}`}
          style={centerPoint(MP_MOBILE_POS.trumpLabel)}
        >
          {table.isTrumpLead ? t.trump : t.ace}
        </div>
      ) : null}

      {trick.map((play) => (
        <div
          key={`${play.gameSeatIndex}-${play.tile.side1}-${play.tile.side2}`}
          className="mpmTrickTile"
          style={centerPoint(MP_MOBILE_POS.trick[TRICK_SLOT_BY_VISUAL_SEAT[play.visualSeat]])}
        >
          <DominoTileView tile={play.tile} isPlayable />
          {play.declaredNumber !== undefined ? <span className="mpmDeclared">{play.declaredNumber}</span> : null}
        </div>
      ))}

      {table.seats.map((seat) => (
        <MpmSeat
          key={seat.gameSeatIndex}
          labels={t}
          seat={seat}
          activeSeatIndex={activeSeatIndex}
          remainingSeconds={remainingSeconds}
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

      {preGameSeconds !== undefined ? (
        <div className="mpPreGameOverlay" role="status" aria-live="polite">
          <div className="mpPreGameCard">
            <span className="mpPreGameLabel">{t.mpGameStartsIn}</span>
            <strong className="mpPreGameSeconds">{preGameSeconds}s</strong>
          </div>
        </div>
      ) : null}

      {errorToast ? <div className="toast" role="status">{errorToast}</div> : null}
    </div>
    </div>
  );
}

function MpmSeat({
  labels: t,
  seat,
  activeSeatIndex,
  remainingSeconds
}: {
  readonly labels: AppStrings;
  readonly seat: MpTableSeat;
  readonly activeSeatIndex: number | undefined;
  readonly remainingSeconds: number | undefined;
}) {
  const pos = MP_MOBILE_POS.seats[seat.visualSeat];
  const isActive = seat.gameSeatIndex === activeSeatIndex;
  const isDisconnected = seat.connectionState === "disconnected" && !seat.isAI;
  const showTimer = seat.isActive && remainingSeconds !== undefined;
  const label = seatLabel(seat.displayId, seat.isAI, seat.gameSeatIndex, t);
  const avatarSrc = seat.avatar ? avatarUrl(seat.avatar) : null;
  const hasBid = seat.bid >= 0;
  // Tekošā raunda punkti (kopsumma ir augšējā tabulā). Pirms solījuma — "–".
  const roundScore = hasBid ? calculateRoundScore({ bid: seat.bid, tricksWon: seat.tricksWon }) : null;
  // Cipari: zaļi, ja paņemts tieši solītais; sarkani, ja pārņemts; citādi neitrāli.
  const bidWonState = !hasBid ? "" : seat.tricksWon === seat.bid ? "matched" : seat.tricksWon > seat.bid ? "over" : "";

  return (
    <>
      {/* Aplis: reģistrēta spēlētāja avatars + tituls (overlay apakšā); citādi tukšs.
          Identitāte (vārds + kopsumma) ir arī augšējā tabulā. */}
      <div
        className={`mpmProfile ${avatarSrc ? "hasAvatar" : ""} ${isActive ? "active" : ""} ${seat.isDealer ? "dealer" : ""} ${isDisconnected ? "disconnected" : ""}`}
        style={centerBox(pos.profile, MP_MOBILE_SIZE.profilePx, 1)}
        aria-label={label}
      >
        {avatarSrc ? <img className="mpmProfileAvatar" src={avatarSrc} alt="" aria-hidden="true" /> : null}
        {seat.title ? <span className="mpmProfileTitle">{titleLabel(t, seat.title)}</span> : null}
      </div>

      {/* Pieteiktie/paņemtie stiķi (bid/won). Aplis neitrāls; cipari maina krāsu. */}
      <div
        className={`mpmBadge mpmBidWon ${bidWonState}`}
        style={centerBox(pos.bidWon, MP_MOBILE_SIZE.badgePx, 1)}
        aria-label={`${t.tricksBid} / ${t.tricksWon}: ${hasBid ? seat.bid : "?"}/${seat.tricksWon}`}
      >
        {hasBid ? seat.bid : "?"}/{seat.tricksWon}
      </div>

      {/* Tekošā raunda punkti. */}
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
          aria-label={`${seat.handCount}`}
        >
          {seat.handCount}
        </div>
      ) : null}

      {showTimer ? (
        <div
          className="mpmBadge mpmCountdown"
          style={centerBox(pos.countdown, MP_MOBILE_SIZE.badgePx, 1)}
          aria-label={`${remainingSeconds}s`}
        >
          {remainingSeconds}
        </div>
      ) : null}
    </>
  );
}

/**
 * Kopējo punktu tabula augšējā zonā (vairāku raundu spēlēm): spēlētāju vārds +
 * kopsumma. Aktīvajam spēlētājam izceļas gan profila aplis, gan rinda šeit.
 * Secība = spēles secībā. (Tekošā raunda punkti ir pie profila.)
 */
function MpmSummaryTable({
  labels: t,
  seats,
  activeSeatIndex
}: {
  readonly labels: AppStrings;
  readonly seats: readonly MpTableSeat[];
  readonly activeSeatIndex: number | undefined;
}) {
  const ordered = [...seats].sort((a, b) => a.gameSeatIndex - b.gameSeatIndex);
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
      {ordered.map((seat) => {
        const isActive = seat.gameSeatIndex === activeSeatIndex;
        const isDisconnected = seat.connectionState === "disconnected" && !seat.isAI;
        return (
          <div
            className={`mpmSummaryRow ${isActive ? "active" : ""} ${isDisconnected ? "disconnected" : ""}`}
            key={seat.gameSeatIndex}
          >
            <span className="mpmSummaryName">
              {seat.isHost ? <span className="mpHostMark" aria-label={t.mpHost}>★</span> : null}
              {seat.isDealer ? <span className="mpmDealerMark" role="img" aria-label={t.dealer}>D</span> : null}
              <span className="mpmSummaryNameText">
                {seatLabel(seat.displayId, seat.isAI, seat.gameSeatIndex, t)}
              </span>
            </span>
            {/* Pieteiktie/paņemtie stiķi (bid/won) — dublēts no sēdvietas, jo stiķa
                dialogs pārklāj sānu profilus; formāts saskan ar `.mpmBidWon` badge. */}
            <span
              className="mpmSummaryBid"
              aria-label={`${t.tricksBid}/${t.tricksWon}: ${seat.bid >= 0 ? seat.bid : "?"}/${seat.tricksWon}`}
            >
              {seat.bid >= 0 ? seat.bid : "?"}/{seat.tricksWon}
            </span>
            <span className="mpmSummaryScore">{seat.totalScore}</span>
          </div>
        );
      })}
    </div>
  );
}
