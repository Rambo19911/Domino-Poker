"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

import { isTrump, tileKey } from "@domino-poker/core";
import type { DominoTile } from "@domino-poker/core";

import type { AppStrings } from "../../lib/i18n";
import type { ClientView } from "../../lib/mp/clientView";
import type {
  MpGameTableView,
  MpTableSeat,
  MpTrickPlay,
  VisualSeat
} from "../../lib/mp/gameTableView";
import type { MoveIntent } from "../../lib/mp/MultiplayerClient";
import type { AudioSettings } from "../../lib/useAudioSettings";
import { AudioControls, VolumeIcon, VolumeOffIcon } from "../AudioControls";
import { DominoTileView, HiddenTile } from "../DominoTileView";
import { BidDialog, ExitDialog, ExitIcon, NumberDialog } from "../GameDialogs";
import { Dialog } from "../Dialog";
import { HelpIcon, RulesDialog } from "../RulesDialog";
import { ConnectionBanner } from "./ConnectionBanner";
import { MpMobileTable } from "./MpMobileTable";
import { formatTemplate, seatLabel } from "../../lib/mp/seatLabel";
import { useIsPhonePortrait } from "../../lib/mobileStage";

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const HAND_SIZE = 7;
const ERROR_TOAST_MS = 2400;
/** Cik ilgi klients aiztur pabeigto triku (≤ servera `trickPauseMs`, lai nelēkā). */
const TRICK_FREEZE_MS = 1500;

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

type StageContainLayout = { readonly scale: number; readonly left: number; readonly top: number };

export function MpGameTable({
  audio,
  labels: t,
  table,
  view,
  onSubmitBid,
  onSubmitMove,
  onExitToLobby
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly table: MpGameTableView;
  readonly view: ClientView;
  readonly onSubmitBid: (bid: number) => void;
  readonly onSubmitMove: (move: MoveIntent) => void;
  readonly onExitToLobby: () => void;
}) {
  const stageLayout = useStageContainLayout();
  const isPhonePortrait = useIsPhonePortrait();
  const [pendingNumberTile, setPendingNumberTile] = useState<DominoTile | null>(null);
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const lastErrorRef = useRef<ClientView["lastError"]>(undefined);
  const errorTimerRef = useRef<number | undefined>(undefined);
  const nowMs = useNowMs(table.deadlineAt !== undefined || table.preGameStartsAt !== undefined);

  // Triku-pabeigšanas aizture: serveris pacē gājienus pa vienam, bet pabeidzot
  // triku snapshot uzreiz notīra galdu (core `completeTrick`). Tāpēc klients
  // īslaicīgi aiztur pēdējo pabeigto triku, lai paspēj redzēt visus 4 kauliņus
  // (servera `trickPauseMs` ≥ šai aizturei, lai nākamais gājiens neielaužas).
  const [frozenTrick, setFrozenTrick] = useState<readonly MpTrickPlay[] | null>(null);
  const prevCompletedRef = useRef(table.completedTrickCount);
  const freezeTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (table.completedTrickCount > prevCompletedRef.current && table.lastCompletedTrick) {
      setFrozenTrick(table.lastCompletedTrick);
      if (freezeTimerRef.current !== undefined) window.clearTimeout(freezeTimerRef.current);
      freezeTimerRef.current = window.setTimeout(() => setFrozenTrick(null), TRICK_FREEZE_MS);
    }
    prevCompletedRef.current = table.completedTrickCount;
  }, [table.completedTrickCount, table.lastCompletedTrick]);

  useEffect(() => {
    return () => {
      if (freezeTimerRef.current !== undefined) window.clearTimeout(freezeTimerRef.current);
    };
  }, []);

  const frozen = frozenTrick !== null;
  const interactive = !frozen;
  // Izgaismojums = servera aktīvā sēdvieta (currentPlayerIndex). Pēc pabeigta trika
  // tas ir uzvarētājs (viņš vada nākamo) — tāpēc aizturē izgaismojas uzvarētājs.
  const activeSeatIndex = table.seats.find((seat) => seat.isActive)?.gameSeatIndex;
  const validTileKeys = new Set(table.viewerValidTileKeys);

  // Servera noraidīts gājiens/solījums → īslaicīgs toasts (state nemainās lokāli).
  useEffect(() => {
    const error = view.lastError;
    if (error && error !== lastErrorRef.current) {
      lastErrorRef.current = error;
      setErrorToast(error.message);
      if (errorTimerRef.current !== undefined) window.clearTimeout(errorTimerRef.current);
      errorTimerRef.current = window.setTimeout(() => setErrorToast(null), ERROR_TOAST_MS);
    }
  }, [view.lastError]);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current !== undefined) window.clearTimeout(errorTimerRef.current);
    };
  }, []);

  // Aizver kauliņa-skaitļa dialogu, tiklīdz vairs nav skatītāja gājiena kārta
  // (`turnAction === "move"` ir tikai tad, kad skatītājs drīkst likt). Tas notiek,
  // ja turns beidzās ar servera 10s timeout auto-play, kamēr dialogs bija atvērts —
  // citādi tas paliktu atvērts un vēla izvēle radītu "does not own the current turn".
  useEffect(() => {
    if (pendingNumberTile !== null && table.turnAction !== "move") {
      setPendingNumberTile(null);
    }
  }, [table.turnAction, pendingNumberTile]);

  const handleTileClick = (tile: DominoTile) => {
    if (!interactive) return; // triku-aiztures laikā nepieņemam klikšķus
    if (table.turnAction !== "move") return; // bloķēts, ja nav skatītāja gājiena kārta
    if (!validTileKeys.has(tileKey(tile))) return; // nederīgs kauliņš (serveris arī validē)
    // Vadošais ne-trumpis, ne-dublis → jādeklarē skaitlis (tāpat kā SP).
    if (table.trick.length === 0 && !isTrump(tile) && tile.side1 !== tile.side2) {
      setPendingNumberTile(tile);
      return;
    }
    audio.play("tilePlaced");
    onSubmitMove({ tile });
  };

  const remainingSeconds =
    table.deadlineAt === undefined ? undefined : Math.max(0, Math.ceil((table.deadlineAt - nowMs) / 1000));
  const preGameSeconds =
    table.preGameStartsAt === undefined
      ? undefined
      : Math.max(0, Math.ceil((table.preGameStartsAt - nowMs) / 1000));

  const displayTrick = frozen && frozenTrick ? frozenTrick : table.trick;

  return (
    <main className="gameShell">
      {isPhonePortrait ? (
        <MpMobileTable
          labels={t}
          table={table}
          trick={displayTrick}
          frozen={frozen}
          activeSeatIndex={activeSeatIndex}
          viewerHand={table.viewerHand}
          isViewerTurn={table.isViewerTurn && interactive}
          validTileKeys={validTileKeys}
          remainingSeconds={remainingSeconds}
          preGameSeconds={preGameSeconds}
          errorToast={errorToast}
          onTileClick={handleTileClick}
          onLeave={() => {
            audio.play("uiClick");
            setShowExitDialog(true);
          }}
        />
      ) : (
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
              <MpTableCenter
                labels={t}
                table={table}
                trick={displayTrick}
                frozen={frozen}
              />

              {table.seats.map((seat) => (
                <MpSeat
                  key={seat.gameSeatIndex}
                  labels={t}
                  seat={seat}
                  activeSeatIndex={activeSeatIndex}
                  viewerHand={table.viewerHand}
                  isViewerTurn={table.isViewerTurn && interactive}
                  validTileKeys={validTileKeys}
                  remainingSeconds={remainingSeconds}
                  onTileClick={handleTileClick}
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
            <button
              className="iconButton gameHelpButton"
              type="button"
              aria-label={t.rules}
              title={t.rules}
              onClick={() => {
                audio.play("uiClick");
                setShowRulesDialog(true);
              }}
            >
              <HelpIcon />
            </button>
            <button
              className="iconButton exitButton"
              type="button"
              aria-label={t.exit}
              onClick={() => {
                audio.play("uiClick");
                setShowExitDialog(true);
              }}
            >
              <ExitIcon />
            </button>
          </div>
        </>
      )}

      <div className="mpGameConnection">
        <ConnectionBanner status={view.connection} labels={t} />
      </div>

      {table.turnAction === "bid" && interactive ? (
        <BidDialog
          labels={t}
          onBid={(bid) => {
            audio.play("bidClick");
            onSubmitBid(bid);
          }}
        />
      ) : null}

      {pendingNumberTile ? (
        <NumberDialog
          tile={pendingNumberTile}
          audio={audio}
          labels={t}
          onCancel={() => setPendingNumberTile(null)}
          onChoose={(declaredNumber) => {
            const tile = pendingNumberTile;
            setPendingNumberTile(null);
            audio.play("tilePlaced");
            onSubmitMove({ tile, declaredNumber });
          }}
        />
      ) : null}

      {table.phase === "gameEnd" ? (
        <MpGameEndDialog audio={audio} labels={t} table={table} onClose={onExitToLobby} />
      ) : null}

      {showRulesDialog ? (
        <RulesDialog audio={audio} labels={t} onClose={() => setShowRulesDialog(false)} />
      ) : null}

      {showExitDialog ? (
        <ExitDialog
          audio={audio}
          labels={t}
          onCancel={() => setShowExitDialog(false)}
          onExit={onExitToLobby}
        />
      ) : null}
    </main>
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
  return (
    <div
      className={`playerProfile ${isActive ? "active" : ""} ${seat.isDealer ? "dealer" : ""}`}
      style={{ ...getProfileStyle(seat.visualSeat), width: profileSize, height: profileSize }}
    >
      <div className="profileBottom">
        <div className={`profileName ${isActive ? "activeName" : ""}`}>
          {seat.isHost ? <span className="mpHostMark" aria-label={t.mpHost}>★</span> : null}
          {seatLabel(seat.displayId, seat.isAI, seat.gameSeatIndex, t)}
        </div>
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

function MpGameEndDialog({
  audio,
  labels: t,
  table,
  onClose
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly table: MpGameTableView;
  readonly onClose: () => void;
}) {
  const ranked = [...table.seats].sort((a, b) => b.totalScore - a.totalScore);
  const winner = table.seats.find((seat) => seat.gameSeatIndex === table.winnerSeatIndex);
  return (
    <Dialog ariaLabelledBy="mp-game-end-title" className="alertDialog summaryDialog" onEscape={onClose}>
      <h2 id="mp-game-end-title">{t.gameOver}</h2>
      <div className="winnerBanner">
        {t.winner}: {winner ? seatLabel(winner.displayId, winner.isAI, winner.gameSeatIndex, t) : ""}
      </div>
      <dl className="finalScores">
        {ranked.map((seat) => (
          <div className={seat.gameSeatIndex === table.winnerSeatIndex ? "winnerRow" : ""} key={seat.gameSeatIndex}>
            <dt>{seatLabel(seat.displayId, seat.isAI, seat.gameSeatIndex, t)}</dt>
            <dd>{seat.totalScore} {t.pointsLabel}</dd>
          </div>
        ))}
      </dl>
      <button
        className="primaryButton"
        type="button"
        onClick={() => {
          audio.play("uiClick");
          onClose();
        }}
      >
        {t.ok}
      </button>
    </Dialog>
  );
}

function MpSoundMenu({ audio, labels: t }: { readonly audio: AudioSettings; readonly labels: AppStrings }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="soundMenu">
      <button
        className="iconButton soundButton"
        type="button"
        aria-label={audio.isMuted ? t.mutedSoundSettings : t.soundSettings}
        onClick={() => {
          audio.play("uiClick");
          setOpen((value) => !value);
        }}
      >
        {audio.isMuted ? <VolumeOffIcon /> : <VolumeIcon />}
      </button>
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

/** Countdown takts: tikšķ tikai kamēr ir aktīvs deadline (citādi nevajadzīgi renderi). */
function useNowMs(active: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [active]);
  return nowMs;
}

/**
 * Stage mērogošana (contain). Pārkopēts no SP `DominoPokerGame.tsx`, lai MP galds
 * izmantotu to pašu 1920×1080 fiksēto skatuvi; SP fails paliek neskarts.
 */
function useStageContainLayout(): StageContainLayout {
  const [layout, setLayout] = useState<StageContainLayout>(() => getStageContainLayout());
  useEffect(() => {
    const update = () => setLayout(getStageContainLayout());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    // visualViewport `resize` noķer iOS Safari joslas sabrukumu (mainās augstums);
    // NEklausāmies `scroll`, kas uzbāztos nepārtraukti un radītu jank (sk. m5).
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return layout;
}

function getStageContainLayout(): StageContainLayout {
  if (typeof window === "undefined") return { scale: 1, left: 0, top: 0 };
  // visualViewport seko iOS Safari joslu rādīšanai/slēpšanai, tāpēc skatuve
  // neielien zem pārlūka joslas mobilajā ainavā; fallback uz innerWidth/Height.
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const scale = Math.min(vw / CANVAS_WIDTH, vh / CANVAS_HEIGHT);
  return {
    scale,
    left: (vw - CANVAS_WIDTH * scale) / 2,
    top: (vh - CANVAS_HEIGHT * scale) / 2
  };
}

