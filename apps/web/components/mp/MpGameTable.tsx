"use client";

import { useEffect, useRef, useState } from "react";

import { isTrump, tileKey } from "@domino-poker/core";
import type { DominoTile } from "@domino-poker/core";
import type { AppStrings } from "../../lib/i18n";
import type { ClientView } from "../../lib/mp/clientView";
import type { MpGameTableView, MpTableSeat } from "../../lib/mp/gameTableView";
import type { MoveIntent } from "../../lib/mp/MultiplayerClient";
import type { AudioSettings } from "../../lib/useAudioSettings";
import { CoinGif } from "../CoinGif";
import { BidDialog, ExitDialog, NumberDialog } from "../GameDialogs";
import { Dialog } from "../Dialog";
import { Presence } from "../usePresence";
import { WinnerGif } from "../WinnerGif";
import { RulesDialog } from "../RulesDialog";
import { ConnectionBanner } from "./ConnectionBanner";
import { MpMobileTable } from "./MpMobileTable";
import { MpDesktopTable } from "./MpDesktopTable";
import { seatLabel } from "../../lib/mp/seatLabel";
import { useIsPhonePortrait } from "../../lib/mobileStage";
import { useStageContainLayout } from "../../lib/mp/desktopStage";
import { useTrickFreeze } from "../../lib/mp/useTrickFreeze";
import { useTurnErrorToast } from "../../lib/mp/useTurnErrorToast";

export function MpGameTable({
  audio,
  labels: t,
  table,
  view,
  onSubmitBid,
  onSubmitMove,
  onExitToLobby,
  onLeaveFinishedGame
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly table: MpGameTableView;
  readonly view: ClientView;
  readonly onSubmitBid: (bid: number) => void;
  readonly onSubmitMove: (move: MoveIntent) => void;
  /** Mid-game iziešana (forfeit) — sūta LEAVE_ROOM serverim. */
  readonly onExitToLobby: () => void;
  /** Spēles-beigu "OK" — lokāla atgriešanās lobby (istaba serverī jau iznīcināta). */
  readonly onLeaveFinishedGame: () => void;
}) {
  // Desktop skatuves ģeometriju rēķina BEZNOSACĪJUMA (tāpat kā iepriekš), lai resize
  // klausītāju dzīves cikls nemainās, kad pārslēdzas mobile/desktop ceļš.
  const stageLayout = useStageContainLayout();
  const isPhonePortrait = useIsPhonePortrait();
  const [pendingNumberTile, setPendingNumberTile] = useState<DominoTile | null>(null);
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const nowMs = useNowMs(table.deadlineAt !== undefined || table.preGameStartsAt !== undefined);
  const { frozen, displayTrick } = useTrickFreeze(table);
  // Servera noraidīts gājiens/solījums → īslaicīgs toasts (state nemainās lokāli).
  const errorToast = useTurnErrorToast(view.lastError);

  // Kauliņa skaņa VISIEM gājieniem (boti + attālie cilvēki), nevis tikai lokālajam.
  // Skaita šajā raundā izspēlētos kauliņus: completedTrickCount*4 + trick garums —
  // pieaug par 1 katram kauliņam, t.sk. triku-pabeidzošajam 4., kad serveris uzreiz
  // notīra `trick`. Atskaņo, kad skaitlis pieaug; raunda maiņā tas krītas → klusums.
  const tilesPlayedThisRound = table.completedTrickCount * 4 + table.trick.length;
  const prevTilesPlayedRef = useRef(tilesPlayedThisRound);
  useEffect(() => {
    if (tilesPlayedThisRound > prevTilesPlayedRef.current) {
      audio.play("tilePlaced");
    }
    prevTilesPlayedRef.current = tilesPlayedThisRound;
  }, [tilesPlayedThisRound, audio]);

  const interactive = !frozen;
  // Izgaismojums = servera aktīvā sēdvieta (currentPlayerIndex). Pēc pabeigta trika
  // tas ir uzvarētājs (viņš vada nākamo) — tāpēc aizturē izgaismojas uzvarētājs.
  const activeSeatIndex = table.seats.find((seat) => seat.isActive)?.gameSeatIndex;
  const validTileKeys = new Set(table.viewerValidTileKeys);

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
    onSubmitMove({ tile });
  };

  const remainingSeconds =
    table.deadlineAt === undefined ? undefined : Math.max(0, Math.ceil((table.deadlineAt - nowMs) / 1000));
  const preGameSeconds =
    table.preGameStartsAt === undefined
      ? undefined
      : Math.max(0, Math.ceil((table.preGameStartsAt - nowMs) / 1000));

  // Skaņa + dialoga atvēršana dalīta starp mobile (onLeave) un desktop vadīklām.
  const openRules = () => {
    audio.play("uiClick");
    setShowRulesDialog(true);
  };
  const openExit = () => {
    audio.play("uiClick");
    setShowExitDialog(true);
  };

  return (
    <main className="gameShell mpRoomBg">
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
          onLeave={openExit}
        />
      ) : (
        <MpDesktopTable
          audio={audio}
          labels={t}
          table={table}
          stageLayout={stageLayout}
          trick={displayTrick}
          frozen={frozen}
          activeSeatIndex={activeSeatIndex}
          isViewerTurn={table.isViewerTurn && interactive}
          validTileKeys={validTileKeys}
          remainingSeconds={remainingSeconds}
          preGameSeconds={preGameSeconds}
          errorToast={errorToast}
          onTileClick={handleTileClick}
          onShowRules={openRules}
          onShowExit={openExit}
        />
      )}

      <div className="mpGameConnection">
        <ConnectionBanner status={view.connection} labels={t} />
      </div>

      <Presence open={table.turnAction === "bid" && interactive}>
        <BidDialog
          labels={t}
          onBid={(bid) => {
            audio.play("bidClick");
            onSubmitBid(bid);
          }}
        />
      </Presence>

      <Presence open={!!pendingNumberTile}>
        <NumberDialog
          tile={pendingNumberTile!}
          audio={audio}
          labels={t}
          onCancel={() => setPendingNumberTile(null)}
          onChoose={(declaredNumber) => {
            const tile = pendingNumberTile;
            setPendingNumberTile(null);
            if (tile) onSubmitMove({ tile, declaredNumber });
          }}
        />
      </Presence>

      <Presence open={table.phase === "gameEnd"}>
        <MpGameEndDialog
          audio={audio}
          labels={t}
          table={table}
          coinsWon={view.coinsWon}
          onClose={onLeaveFinishedGame}
        />
      </Presence>

      <Presence open={showRulesDialog}>
        <RulesDialog audio={audio} labels={t} onClose={() => setShowRulesDialog(false)} />
      </Presence>

      <Presence open={showExitDialog}>
        <ExitDialog
          audio={audio}
          labels={t}
          onCancel={() => setShowExitDialog(false)}
          onExit={onExitToLobby}
        />
      </Presence>
    </main>
  );
}

function MpGameEndDialog({
  audio,
  labels: t,
  table,
  coinsWon,
  onClose
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly table: MpGameTableView;
  /** Fāze 6: skatītāja šajā spēlē nopelnītās monētas (poda izmaksa); rāda "+N", ja > 0. */
  readonly coinsWon: number | undefined;
  readonly onClose: () => void;
}) {
  // Rangs no AUTORITATĪVĀ `standingsSeatOrder` (core getStandings: totalScore → bid →
  // tricksWon → dīleris) — tas pats avots, ko `winnerSeatIndex` (= order[0]), tāpēc
  // 1. vietas GIF nekad nav pretrunā ar izcelto uzvarētāju, arī neizšķirtā. Fallback uz
  // sēdvietu secību, ja saraksts tukšs (praksē šis dialogs rādās tikai `gameEnd`).
  const ranked =
    table.standingsSeatOrder.length > 0
      ? table.standingsSeatOrder
          .map((seatIndex) => table.seats.find((seat) => seat.gameSeatIndex === seatIndex))
          .filter((seat): seat is MpTableSeat => seat !== undefined)
      : [...table.seats];
  const winner = table.seats.find((seat) => seat.gameSeatIndex === table.winnerSeatIndex);
  return (
    <Dialog ariaLabelledBy="mp-game-end-title" className="alertDialog summaryDialog" onEscape={onClose}>
      <h2 id="mp-game-end-title">{t.gameOver}</h2>
      <div className="winnerBanner">
        {t.winner}: {winner ? seatLabel(winner.displayId, winner.isAI, winner.gameSeatIndex, t) : ""}
      </div>
      {typeof coinsWon === "number" && coinsWon > 0 ? (
        <div className="gameEndReward" aria-label={`${t.coinsEarned}: ${coinsWon}`}>
          <CoinGif className="gameEndRewardIcon" />
          <span className="gameEndRewardValue">+{coinsWon.toLocaleString()}</span>
        </div>
      ) : null}
      <dl className="finalScores">
        {ranked.map((seat, index) => (
          <div className={seat.gameSeatIndex === table.winnerSeatIndex ? "winnerRow" : ""} key={seat.gameSeatIndex}>
            <WinnerGif place={index + 1} className="finalScorePlace" />
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
