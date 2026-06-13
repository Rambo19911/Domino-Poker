"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

import { tileKey } from "@domino-poker/core";
import type { DominoTile } from "@domino-poker/core";
import type { AppStrings } from "../../lib/i18n";
import { avatarUrl } from "../../lib/auth/avatarUrl";
import { titleLabel } from "../../lib/auth/titleLabel";
import type { MpGameTableView, MpTableSeat, MpTrickPlay, VisualSeat } from "../../lib/mp/gameTableView";
import type { StageContainLayout } from "../../lib/mp/desktopStage";
import type { AudioSettings } from "../../lib/useAudioSettings";
import { AudioControls, VolumeIcon, VolumeOffIcon } from "../AudioControls";
import { DominoTileView, HiddenTile } from "../DominoTileView";
import { ExitIcon } from "../GameDialogs";
import { HelpIcon } from "../RulesDialog";
import { IconButton } from "../ui/IconButton";
import { formatTemplate, seatLabel } from "../../lib/mp/seatLabel";

const HAND_SIZE = 7;

/**
 * Sēdvietu koordinātas pārkopētas no SP `PlayerSeat.tsx` (atļauts kopēt SP→MP),
 * lai MP galds atkārtoti izmantotu **tieši to pašu izkārtojumu**. SP fails paliek
 * neskarts. Vizuālā vieta 0 = apakša (skatītājs), 1 = kreisā, 2 = augša, 3 = labā.
 */
const profileSize = 144;
const seatLayout = {
  player1ProfileLeft: 80,
  player1ProfileTop: 112,
  player1StatsLeft: 80,
  player1StatsTop: 272,
  player1TilesLeft: 80,
  player1TilesStartTop: 359,
  player1TileSpacing: 88,
  player2ProfileLeft: 965,
  player2ProfileTop: 119,
  player2StatsLeft: 867,
  player2StatsTop: 120,
  player2TilesStartLeft: 244,
  player2TilesTop: 119,
  player2TileSpacing: 89,
  player3ProfileLeft: 1121,
  player3ProfileTop: 824,
  player3StatsLeft: 1120,
  player3StatsTop: 736,
  player3TilesLeft: 1120,
  player3TilesStartTop: 120,
  player3TileSpacing: 88,
  player0ProfileLeft: 240,
  player0ProfileTop: 825,
  player0StatsLeft: 393,
  player0StatsTop: 823,
  player0TilesStartLeft: 493,
  player0TilesTop: 824,
  player0TileSpacing: 90
} as const;

/**
 * Desktop (ainavas) MP galds: fiksētā 1920×1080 skatuve + drošās vadīklas (skaņa,
 * noteikumi, iziešana). Atvasinātās vērtības (frozen/displayTrick/activeSeatIndex/
 * validTileKeys/laiki/errorToast) rēķina vecāks `MpGametable` VIENREIZ un padod
 * šeit — derivācija netiek dublēta starp desktop un telefona ceļiem.
 */
export function MpDesktopTable({
  audio,
  labels: t,
  table,
  stageLayout,
  trick,
  frozen,
  activeSeatIndex,
  isViewerTurn,
  validTileKeys,
  remainingSeconds,
  preGameSeconds,
  errorToast,
  onTileClick,
  onShowRules,
  onShowExit
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly table: MpGameTableView;
  readonly stageLayout: StageContainLayout;
  readonly trick: readonly MpTrickPlay[];
  readonly frozen: boolean;
  readonly activeSeatIndex: number | undefined;
  readonly isViewerTurn: boolean;
  readonly validTileKeys: ReadonlySet<string>;
  readonly remainingSeconds: number | undefined;
  readonly preGameSeconds: number | undefined;
  readonly errorToast: string | null;
  readonly onTileClick: (tile: DominoTile) => void;
  readonly onShowRules: () => void;
  readonly onShowExit: () => void;
}) {
  return (
    <>
      <div className="stageClip">
        <div
          className="fixedStage"
          style={{
            left: stageLayout.left,
            top: stageLayout.top,
            transform: `scale(${stageLayout.scale})`,
            transformOrigin: "top left"
          }}
          aria-label={t.gameTableLabel}
        >
          <MpTableCenter labels={t} table={table} trick={trick} frozen={frozen} />

          {table.seats.map((seat) => (
            <MpSeat
              key={seat.gameSeatIndex}
              labels={t}
              seat={seat}
              activeSeatIndex={activeSeatIndex}
              viewerHand={table.viewerHand}
              isViewerTurn={isViewerTurn}
              validTileKeys={validTileKeys}
              remainingSeconds={remainingSeconds}
              onTileClick={onTileClick}
            />
          ))}

          <MpInfoPanel labels={t} table={table} activeSeatIndex={activeSeatIndex} />

          {preGameSeconds !== undefined ? (
            <div className="mpPreGameOverlay" role="status" aria-live="polite">
              <div className="mpPreGameCard">
                <span className="mpPreGameLabel">{t.mpGameStartsIn}</span>
                <strong className="mpPreGameSeconds">{preGameSeconds}s</strong>
              </div>
            </div>
          ) : null}

          {errorToast ? (
            <div className="toast" role="status">{errorToast}</div>
          ) : null}
        </div>
      </div>

      <div className="safeControls">
        <MpSoundMenu audio={audio} labels={t} />
        <IconButton
          className="gameHelpButton"
          label={t.rules}
          title={t.rules}
          onClick={onShowRules}
        >
          <HelpIcon />
        </IconButton>
        <IconButton className="exitButton" label={t.exit} onClick={onShowExit}>
          <ExitIcon />
        </IconButton>
      </div>
    </>
  );
}

function MpTableCenter({
  labels: t,
  table,
  trick,
  frozen
}: {
  readonly labels: AppStrings;
  readonly table: MpGameTableView;
  readonly trick: readonly MpTrickPlay[];
  readonly frozen: boolean;
}) {
  const hasTrick = trick.length > 0;
  // Aiztures laikā rādām tikai pabeigtā trika kauliņus (lead-info attiecas uz jauno triku).
  const showLeadInfo = !frozen && table.leadTile !== undefined && table.phase === "playing";
  return (
    <section className="table" aria-label={t.currentTrickLabel}>
      <img className="tableLogo" src="/assets/images/domino_poker_logo.png" alt="" aria-hidden="true" />
      <div className="tableContent">
        {showLeadInfo ? <MpTrickInfo labels={t} table={table} /> : null}
        {hasTrick ? (
          <div className="playedWrap">
            {trick.map((play) => (
              <MpPlayedTile key={`${play.gameSeatIndex}-${play.tile.side1}-${play.tile.side2}`} labels={t} play={play} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function MpTrickInfo({ labels: t, table }: { readonly labels: AppStrings; readonly table: MpGameTableView }) {
  let label = "";
  let className = "trickInfo";
  if (table.isTrumpLead) {
    label = ` ${t.trump}`;
    className += " danger";
  } else if (table.isAceLead) {
    label = ` ${t.ace}`;
    className += " gold";
  } else if (table.requiredNumber !== undefined) {
    label = ` ${t.required}: ${table.requiredNumber}`;
    className += " green";
  }
  return label ? <div className={className}>{label}</div> : null;
}

function MpPlayedTile({ labels: t, play }: { readonly labels: AppStrings; readonly play: MpTrickPlay }) {
  return (
    <div className="playedTileWithLabel">
      <div className="playedName">{seatLabel(play.displayId, play.isAI, play.gameSeatIndex, t)}</div>
      <DominoTileView tile={play.tile} isPlayable />
      {play.declaredNumber !== undefined ? <div className="declaredNumber">{play.declaredNumber}</div> : null}
    </div>
  );
}

function MpSeat({
  labels: t,
  seat,
  activeSeatIndex,
  viewerHand,
  isViewerTurn,
  validTileKeys,
  remainingSeconds,
  onTileClick
}: {
  readonly labels: AppStrings;
  readonly seat: MpTableSeat;
  readonly activeSeatIndex: number | undefined;
  readonly viewerHand: readonly DominoTile[];
  readonly isViewerTurn: boolean;
  readonly validTileKeys: ReadonlySet<string>;
  readonly remainingSeconds: number | undefined;
  readonly onTileClick: (tile: DominoTile) => void;
}) {
  // Izgaismojam to, kurš tagad "domā" (atskaņošanas aktīvā sēdvieta), nevis
  // snapshot aktīvo (kas ir notikumu priekšā secīgās atskaņošanas laikā).
  const isActive = seat.gameSeatIndex === activeSeatIndex;
  return (
    <>
      <MpPlayerProfile labels={t} seat={seat} isActive={isActive} />
      {/* Atskaite saistīta ar REĀLO kārtu (seat.isActive = servera currentPlayer),
          nevis ar atskaņošanas izgaismojumu — lai visi redz pretinieka laiku reālā laikā. */}
      <MpPlayerStats labels={t} seat={seat} remainingSeconds={remainingSeconds} />
      {seat.isViewer ? (
        <>
          {isViewerTurn ? <MpYourTurnIndicator labels={t} /> : null}
          {viewerHand.map((tile, index) => {
            // Derīgs = skatītāja kārta + noteikumi atļauj (tikai attēlošanai; serveris validē).
            const isValid = isViewerTurn && validTileKeys.has(tileKey(tile));
            return (
              <button
                className={`humanTileButton ${isValid ? "valid" : ""}`}
                key={`${tile.side1}-${tile.side2}-${index}`}
                type="button"
                aria-label={formatTemplate(t.playTile, { tile: `${tile.side1}-${tile.side2}` })}
                disabled={!isValid}
                onClick={() => onTileClick(tile)}
                style={{
                  left: seatLayout.player0TilesStartLeft + index * seatLayout.player0TileSpacing,
                  top: seatLayout.player0TilesTop
                }}
              >
                <DominoTileView tile={tile} isPlayable={isValid} />
              </button>
            );
          })}
        </>
      ) : (
        renderHiddenHand(seat)
      )}
    </>
  );
}

function MpPlayerProfile({
  labels: t,
  seat,
  isActive
}: {
  readonly labels: AppStrings;
  readonly seat: MpTableSeat;
  readonly isActive: boolean;
}) {
  const isDisconnected = seat.connectionState === "disconnected" && !seat.isAI;
  // Reģistrēta spēlētāja avatars + tituls plūst no servera (RoomSeatView); botiem/
  // anonīmiem — undefined. Tituls (TitleId) lokalizēts klientā; Lūzers NETIEK rādīts
  // sēdvietās (paliek tikai main-lobby profilā).
  const avatarSrc = seat.avatar ? avatarUrl(seat.avatar) : null;
  return (
    <div
      className={`playerProfile ${avatarSrc ? "hasAvatar" : ""} ${isActive ? "active" : ""} ${seat.isDealer ? "dealer" : ""}`}
      style={{ ...getProfileStyle(seat.visualSeat), width: profileSize, height: profileSize }}
    >
      {avatarSrc ? (
        <img className="profileAvatarImage" src={avatarSrc} alt="" aria-hidden="true" />
      ) : null}
      <div className="profileBottom">
        <div className={`profileName ${isActive ? "activeName" : ""}`}>
          {seat.isHost ? <span className="mpHostMark" aria-label={t.mpHost}>★</span> : null}
          {seatLabel(seat.displayId, seat.isAI, seat.gameSeatIndex, t)}
        </div>
        {seat.title ? <div className="profileTitle">{titleLabel(t, seat.title)}</div> : null}
        {seat.isDealer ? <div className="dealerBadge">{t.dealer}</div> : null}
        {isDisconnected ? <div className="mpSeatStatus">{t.mpDisconnected}</div> : null}
      </div>
    </div>
  );
}

function MpPlayerStats({
  labels: t,
  seat,
  remainingSeconds
}: {
  readonly labels: AppStrings;
  readonly seat: MpTableSeat;
  readonly remainingSeconds: number | undefined;
}) {
  // Kārtas atskaiti rāda pie tās sēdvietas, kuras kārta patiešām ir (servera
  // `currentPlayerIndex` = seat.isActive) — visiem klientiem reālā laikā. Pēc 0
  // serveris veic automātisko gājienu (timeout politika).
  const showTimer = seat.isActive && remainingSeconds !== undefined;
  return (
    <div className="playerStats" style={getStatsStyle(seat.visualSeat)}>
      <div>{t.tricksBid}: {seat.bid < 0 ? "?" : seat.bid}</div>
      <div>{t.tricksWon}: {seat.tricksWon}</div>
      {showTimer ? <div className="mpSeatTimer" aria-label={`${remainingSeconds}s`}>{remainingSeconds}s</div> : null}
    </div>
  );
}

function MpYourTurnIndicator({ labels: t }: { readonly labels: AppStrings }) {
  return (
    <div className="yourTurnIndicator">
      <span>{t.yourTurn}</span>
    </div>
  );
}

function MpInfoPanel({
  labels: t,
  table,
  activeSeatIndex
}: {
  readonly labels: AppStrings;
  readonly table: MpGameTableView;
  readonly activeSeatIndex: number | undefined;
}) {
  // Sēdvietas info panelī rāda spēles secībā (gameSeatIndex), nevis vizuāli pagrieztas.
  const ordered = [...table.seats].sort((a, b) => a.gameSeatIndex - b.gameSeatIndex);
  return (
    <aside className="infoPanel" aria-label={t.gameStatus}>
      <div className="infoPanelHeader">
        <div className="roundTitle">{t.roundLabel} {table.currentRound}/{table.totalRounds}</div>
        {table.phase === "playing" ? (
          <div className="trickCount">{table.completedTrickCount} {t.tricksLabel} / {HAND_SIZE}</div>
        ) : null}
      </div>
      <div className="infoDivider" />
      <div className="scoreRows">
        {ordered.map((seat) => {
          const isActive = seat.gameSeatIndex === activeSeatIndex;
          const bidText = seat.bid >= 0 ? `${seat.tricksWon}/${seat.bid}` : `${seat.tricksWon}`;
          return (
            <div className="scoreRow" key={seat.gameSeatIndex}>
              <span className={`turnMarker ${isActive ? "active" : ""}`} aria-hidden="true" />
              <div className={`scorePlayerName ${isActive ? "current" : ""}`}>
                <span>{seatLabel(seat.displayId, seat.isAI, seat.gameSeatIndex, t)}</span>
              </div>
              <div className="tricksBidCell">{bidText}</div>
              <div className="scoreCell">{seat.totalScore}</div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function MpSoundMenu({ audio, labels: t }: { readonly audio: AudioSettings; readonly labels: AppStrings }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="soundMenu">
      <IconButton
        className="soundButton"
        label={audio.isMuted ? t.mutedSoundSettings : t.soundSettings}
        onClick={() => {
          audio.play("uiClick");
          setOpen((value) => !value);
        }}
      >
        {audio.isMuted ? <VolumeOffIcon /> : <VolumeIcon />}
      </IconButton>
      {open ? (
        <div className="soundPanel">
          <AudioControls audio={audio} labels={t} />
        </div>
      ) : null}
    </div>
  );
}

function renderHiddenHand(seat: MpTableSeat) {
  const count = Math.min(seat.handCount, HAND_SIZE);
  if (seat.visualSeat === 1) {
    return Array.from({ length: count }).map((_, index) => (
      <HiddenTile
        key={index}
        orientation="horizontal"
        style={{
          left: seatLayout.player1TilesLeft,
          top: seatLayout.player1TilesStartTop + index * seatLayout.player1TileSpacing
        }}
      />
    ));
  }
  if (seat.visualSeat === 2) {
    return Array.from({ length: count }).map((_, index) => {
      const rightMostIndex = HAND_SIZE - 1;
      const firstVisibleIndex = rightMostIndex - (count - 1);
      const visualIndex = firstVisibleIndex + index;
      return (
        <HiddenTile
          key={index}
          orientation="vertical"
          style={{
            left: seatLayout.player2TilesStartLeft + visualIndex * seatLayout.player2TileSpacing,
            top: seatLayout.player2TilesTop
          }}
        />
      );
    });
  }
  return Array.from({ length: count }).map((_, index) => {
    const bottomIndex = HAND_SIZE - 1;
    const firstVisibleIndex = bottomIndex - (count - 1);
    const visualIndex = firstVisibleIndex + index;
    return (
      <HiddenTile
        key={index}
        orientation="horizontal"
        style={{
          left: seatLayout.player3TilesLeft,
          top: seatLayout.player3TilesStartTop + visualIndex * seatLayout.player3TileSpacing
        }}
      />
    );
  });
}

function getProfileStyle(visualSeat: VisualSeat): CSSProperties {
  switch (visualSeat) {
    case 0:
      return { left: seatLayout.player0ProfileLeft, top: seatLayout.player0ProfileTop };
    case 1:
      return { left: seatLayout.player1ProfileLeft, top: seatLayout.player1ProfileTop };
    case 2:
      return { left: seatLayout.player2ProfileLeft, top: seatLayout.player2ProfileTop };
    case 3:
      return { left: seatLayout.player3ProfileLeft, top: seatLayout.player3ProfileTop };
  }
}

function getStatsStyle(visualSeat: VisualSeat): CSSProperties {
  switch (visualSeat) {
    case 0:
      return { left: seatLayout.player0StatsLeft, top: seatLayout.player0StatsTop };
    case 1:
      return { left: seatLayout.player1StatsLeft, top: seatLayout.player1StatsTop };
    case 2:
      return { left: seatLayout.player2StatsLeft, top: seatLayout.player2StatsTop };
    case 3:
      return { left: seatLayout.player3StatsLeft, top: seatLayout.player3StatsTop };
  }
}
