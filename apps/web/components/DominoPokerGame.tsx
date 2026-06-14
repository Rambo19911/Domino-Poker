"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  completeTrick,
  createNewGame,
  getInvalidMoveReason as getCoreInvalidMoveReason,
  getValidTiles,
  highestTrumpPriorityInTrick,
  isTrump,
  makeBid,
  playTile,
  startNextRound,
  tileKey
} from "@domino-poker/core";
import type { DominoTile, GameState, InvalidMoveReason } from "@domino-poker/core";
import { decideBid as botDecideBid, decideMove as botDecideMove } from "../lib/bot/botBridge";
import type { BotDifficulty } from "../lib/bot/difficulty";
import { resolveAiMove, tryAdvance, type SimpleMove } from "../lib/bot/liveness";
import { AudioControls, VolumeIcon, VolumeOffIcon } from "./AudioControls";
import { DominoTileView } from "./DominoTileView";
import {
  BidDialog,
  ExitDialog,
  ExitIcon,
  GameEndDialog,
  NumberDialog,
  RoundSummaryDialog
} from "./GameDialogs";
import { InfoPanel } from "./InfoPanel";
import { PlayerSeat } from "./PlayerSeat";
import { HelpIcon, RulesDialog } from "./RulesDialog";
import { SpMobileTable } from "./SpMobileTable";
import { IconButton } from "./ui/IconButton";
import type { AppStrings } from "../lib/i18n";
import { useIsPhonePortrait } from "../lib/mobileStage";
import type { AudioSettings } from "../lib/useAudioSettings";

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

type StageContainLayout = {
  readonly scale: number;
  readonly left: number;
  readonly top: number;
};

export function DominoPokerGame({
  audio,
  difficulty,
  humanProfile,
  labels,
  numberOfRounds,
  onExitToLobby
}: {
  readonly audio: AudioSettings;
  /** Botu grūtība (Medium/Hard/Epic) — vada ISMCTS iterāciju/solījumu budžetu. */
  readonly difficulty: BotDifficulty;
  readonly humanProfile: {
    readonly avatarUrl: string | null;
    readonly displayName: string;
    /** Lokalizēts win-tier tituls (ielogotam); `null` anonīmam. */
    readonly title: string | null;
  };
  readonly labels: AppStrings;
  readonly numberOfRounds: number;
  readonly onExitToLobby: () => void;
}) {
  const humanPlayerName = humanProfile.displayName.trim() || labels.you;
  const [gameState, setGameState] = useState<GameState>(() =>
    createNewGame({ numberOfRounds, playerName: humanPlayerName })
  );
  const [isProcessingTrick, setIsProcessingTrick] = useState(false);
  const [pendingNumberTile, setPendingNumberTile] = useState<DominoTile | null>(null);
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [showRulesDialog, setShowRulesDialog] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [lastTrickWinner, setLastTrickWinner] = useState<number | null>(null);
  const [showWinnerGlow, setShowWinnerGlow] = useState(false);
  const [showParticleBurst, setShowParticleBurst] = useState(false);
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [showGameEnd, setShowGameEnd] = useState(false);
  const completionTimerRef = useRef<number | null>(null);
  const glowTimerRef = useRef<number | null>(null);
  const burstTimerRef = useRef<number | null>(null);
  const phaseDialogTimerRef = useRef<number | null>(null);
  const gameStateRef = useRef(gameState);
  const didInitializeGameRef = useRef(false);
  const lastTileSoundSignatureRef = useRef("");
  // Grūtību lasām async AI efektā caur ref, lai (a) tā nav efekta atkarība un (b) iespējama
  // izmaiņa nesatricina jau-darbā esošu bota lēmumu. UI to maina tikai lobby, ne spēles laikā.
  const difficultyRef = useRef(difficulty);
  const stageLayout = useStageContainLayout();

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  useEffect(() => {
    if (!didInitializeGameRef.current) {
      didInitializeGameRef.current = true;
      return;
    }

    setGameState(createNewGame({ numberOfRounds, playerName: humanPlayerName }));
  }, [humanPlayerName, numberOfRounds]);

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const validHumanTiles = useMemo(() => {
    if (gameState.phase !== "playing" || isProcessingTrick || !currentPlayer || currentPlayer.isAI) {
      return [];
    }
    return getValidTiles(currentPlayer, gameState).map(tileKey);
  }, [currentPlayer, gameState, isProcessingTrick]);

  // Mobilais (portrēta telefons) renderē atsevišķu SpMobileTable izkārtojumu (kā MP).
  const isPhonePortrait = useIsPhonePortrait();
  const isViewerTurn =
    gameState.phase === "playing" && !!currentPlayer && !currentPlayer.isAI && !isProcessingTrick;
  const validTileKeySet = useMemo<ReadonlySet<string>>(
    () => new Set(validHumanTiles),
    [validHumanTiles]
  );
  const openExitDialog = useCallback(() => {
    audio.play("uiClick");
    setShowExitDialog(true);
  }, [audio]);

  const clearTimer = (timerRef: React.MutableRefObject<number | null>) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearCompletionTimer = useCallback(() => clearTimer(completionTimerRef), []);
  const clearGlowTimer = useCallback(() => clearTimer(glowTimerRef), []);
  const clearBurstTimer = useCallback(() => clearTimer(burstTimerRef), []);

  useEffect(() => {
    const signature = gameState.currentTrick
      .map((play) => `${play.playerIndex}:${tileKey(play.tile)}:${play.declaredNumber ?? ""}`)
      .join("|");

    if (!signature) {
      lastTileSoundSignatureRef.current = "";
      return;
    }

    if (lastTileSoundSignatureRef.current === signature) return;

    lastTileSoundSignatureRef.current = signature;
    audio.play("tilePlaced");
  }, [audio, gameState.currentTrick]);

  const scheduleCompleteTrick = useCallback(() => {
    if (completionTimerRef.current !== null) return;

    setIsProcessingTrick(true);
    completionTimerRef.current = window.setTimeout(() => {
      const latest = gameStateRef.current;
      if (latest.currentTrick.length === latest.players.length) {
        const completed = completeTrick(latest);
        gameStateRef.current = completed;
        setGameState(completed);
        setLastTrickWinner(completed.currentPlayerIndex);
        setShowWinnerGlow(true);
        setShowParticleBurst(true);
        audio.play("trickComplete");

        clearGlowTimer();
        clearBurstTimer();
        glowTimerRef.current = window.setTimeout(() => setShowWinnerGlow(false), 2000);
        burstTimerRef.current = window.setTimeout(() => setShowParticleBurst(false), 1000);
      }
      setIsProcessingTrick(false);
      completionTimerRef.current = null;
    }, 2000);
  }, [audio, clearBurstTimer, clearGlowTimer]);

  const commitTile = useCallback(
    (tile: DominoTile, declaredNumber?: number) => {
      setGameState((latest) => {
        const result = playTile(latest, tile, declaredNumber);
        return result.state;
      });
    },
    []
  );

  useEffect(() => {
    if (gameState.phase !== "playing" || isProcessingTrick) return;
    if (gameState.currentTrick.length !== gameState.players.length) return;
    scheduleCompleteTrick();
  }, [
    gameState.currentTrick.length,
    gameState.phase,
    gameState.players.length,
    isProcessingTrick,
    scheduleCompleteTrick
  ]);

  useEffect(() => {
    return () => {
      clearCompletionTimer();
      clearGlowTimer();
      clearBurstTimer();
      clearTimer(phaseDialogTimerRef);
    };
  }, [clearBurstTimer, clearCompletionTimer, clearGlowTimer]);

  useEffect(() => {
    clearTimer(phaseDialogTimerRef);
    setShowRoundSummary(false);
    setShowGameEnd(false);

    if (gameState.phase === "roundEnd") {
      phaseDialogTimerRef.current = window.setTimeout(() => {
        setShowRoundSummary(true);
        audio.play("roundWin");
      }, 1500);
    }

    if (gameState.phase === "gameEnd") {
      phaseDialogTimerRef.current = window.setTimeout(() => setShowGameEnd(true), 1000);
    }
  }, [audio, gameState.phase, gameState.currentRound]);

  useEffect(() => {
    if (!currentPlayer?.isAI || isProcessingTrick) return;
    if (gameState.phase !== "bidding" && gameState.phase !== "playing") return;

    // Apmācītais bots ir async + CPU-smags (anytime ISMCTS), tāpēc AI kārtu rēķinām ārpus
    // sinhronā setGameState ceļa un pielietojam pēc tam. `cancelled` sargā pret stale
    // rezultātu, kas pienāktu pēc šī efekta noārdīšanas (stāvoklis aizgājis tālāk / unmount).
    let cancelled = false;

    // Precīzs lēmuma punkta identifikators. Async rezultātu pielieto TIKAI, ja dzīvais
    // stāvoklis joprojām ir tieši šajā punktā — sargā pret jebkuru stale-pielietojumu, pat
    // ja tā pati sēdvieta/fāze atkārtojas citā pozīcijā.
    const turnKey = (s: GameState): string =>
      `${s.phase}|${s.currentRound}|${s.currentPlayerIndex}|${s.completedTricks.length}|${s.currentTrick.length}`;

    const runAiTurn = async () => {
      const snapshot = gameStateRef.current;
      const seat = snapshot.currentPlayerIndex;
      const actor = snapshot.players[seat];
      if (!actor?.isAI) return;
      const key = turnKey(snapshot);
      const level = difficultyRef.current;

      if (snapshot.phase === "bidding") {
        let bid: number;
        try {
          bid = await botDecideBid(snapshot, seat, level);
        } catch (error) {
          console.error("Bot bid failed; using safe default (0).", error);
          bid = 0;
        }
        // makeBid met kļūdu, ja bid nav vesels 0..7. Bota izejas klampēšana (legāls bid 0)
        // pasargā no izņēmuma setGameState updater'ī un nodrošina, ka solīšana virzās.
        if (!Number.isInteger(bid) || bid < 0 || bid > 7) {
          console.error(`Bot bid out of range 0..7 (${bid}); using 0.`);
          bid = 0;
        }
        if (cancelled) return;
        setGameState((latest) => {
          if (turnKey(latest) !== key) return latest;
          return makeBid(latest, bid);
        });
        return;
      }

      // playing
      let chosen: SimpleMove | null;
      try {
        chosen = await botDecideMove(snapshot, seat, level);
      } catch (error) {
        console.error("Bot move failed; using liveness safety move.", error);
        chosen = null; // resolveAiMove izvēlēsies drošības gājienu
      }
      if (cancelled) return;

      // Loud log arī klusi-nelegālam bota gājienam (core to noraidītu, atgriežot nemainītu stāvokli;
      // resolveAiMove citādi to klusi aizstātu ar drošības gājienu).
      if (chosen && !tryAdvance(snapshot, chosen)) {
        console.error("Bot move was illegal/rejected; using liveness safety move.");
      }

      const botMove = chosen;
      setGameState((latest) => {
        if (turnKey(latest) !== key) return latest;
        // resolveAiMove garantē progresu: bota gājiens, ja virza spēli; citādi liveness drošības
        // gājiens — kārta nekad neiestrēgst.
        return resolveAiMove(latest, botMove);
      });
    };

    const delay = gameState.phase === "bidding" ? 800 : 1000;
    const timer = window.setTimeout(() => {
      void runAiTurn();
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentPlayer, gameState.phase, gameState.currentPlayerIndex, isProcessingTrick]);

  const makeHumanBid = (bid: number) => {
    audio.play("bidClick");
    setGameState((latest) => makeBid(latest, bid));
  };

  const handleTileClick = (tile: DominoTile) => {
    if (!currentPlayer || currentPlayer.isAI || gameState.phase !== "playing") return;
    if (isProcessingTrick) return;

    const invalidReason = getCoreInvalidMoveReason(currentPlayer, tile, {
      leadTile: gameState.leadTile,
      requiredNumber: gameState.requiredNumber,
      isTrumpLead: gameState.isTrumpLead,
      isAceLead: gameState.isAceLead,
      highestTrumpPriorityInTrick: highestTrumpPriorityInTrick(gameState)
    });

    if (invalidReason) {
      setInvalidMessage(getInvalidMoveMessage(invalidReason, labels));
      window.setTimeout(() => setInvalidMessage(null), 2000);
      return;
    }

    if (gameState.currentTrick.length === 0 && !isTrump(tile) && tile.side1 !== tile.side2) {
      setPendingNumberTile(tile);
      return;
    }

    commitTile(tile);
  };

  const resetGameUiState = () => {
    clearCompletionTimer();
    clearGlowTimer();
    clearBurstTimer();
    clearTimer(phaseDialogTimerRef);
    setIsProcessingTrick(false);
    setPendingNumberTile(null);
    setInvalidMessage(null);
    setShowRulesDialog(false);
    setShowExitDialog(false);
    setShowRoundSummary(false);
    setShowGameEnd(false);
    setLastTrickWinner(null);
    setShowWinnerGlow(false);
    setShowParticleBurst(false);
  };

  const returnToLobby = () => {
    resetGameUiState();
    onExitToLobby();
  };

  return (
    <main className="gameShell">
      {isPhonePortrait ? (
        <SpMobileTable
          labels={labels}
          gameState={gameState}
          humanProfile={humanProfile}
          validTileKeys={validTileKeySet}
          isViewerTurn={isViewerTurn}
          onTileClick={handleTileClick}
          onLeave={openExitDialog}
        />
      ) : (
      <div className="stageClip">
        <div
          className="fixedStage"
          style={{
            left: stageLayout.left,
            top: stageLayout.top,
            transform: `scale(${stageLayout.scale})`,
            transformOrigin: "top left"
          }}
          aria-label={labels.gameTableLabel}
        >
          <GameTable gameState={gameState} labels={labels} />

          <PlayerSeat
            gameState={gameState}
            labels={labels}
            player={gameState.players[1]}
            seatIndex={1}
            isWinnerGlow={showWinnerGlow && lastTrickWinner === 1}
          />
          <PlayerSeat
            gameState={gameState}
            labels={labels}
            player={gameState.players[2]}
            seatIndex={2}
            isWinnerGlow={showWinnerGlow && lastTrickWinner === 2}
          />
          <PlayerSeat
            gameState={gameState}
            labels={labels}
            player={gameState.players[3]}
            seatIndex={3}
            isWinnerGlow={showWinnerGlow && lastTrickWinner === 3}
          />
          <PlayerSeat
            gameState={gameState}
            humanAvatarUrl={humanProfile.avatarUrl}
            humanTitle={humanProfile.title}
            labels={labels}
            player={gameState.players[0]}
            seatIndex={0}
            validTileKeys={validHumanTiles}
            isWinnerGlow={showWinnerGlow && lastTrickWinner === 0}
            onTileClick={handleTileClick}
          />

          <InfoPanel gameState={gameState} labels={labels} />
          {showParticleBurst ? <ParticleBurst /> : null}
          {invalidMessage ? (
            <div className="toast" role="status">
              {invalidMessage}
            </div>
          ) : null}
        </div>
      </div>
      )}

      {!isPhonePortrait ? (
      <div className="safeControls">
        <SoundMenu audio={audio} labels={labels} />
        <IconButton
          className="gameHelpButton"
          label={labels.rules}
          title={labels.rules}
          onClick={() => {
            audio.play("uiClick");
            setShowRulesDialog(true);
          }}
        >
          <HelpIcon />
        </IconButton>
        <IconButton
          className="exitButton"
          label={labels.exit}
          onClick={() => {
            audio.play("uiClick");
            setShowExitDialog(true);
          }}
        >
          <ExitIcon />
        </IconButton>
      </div>
      ) : null}

      {gameState.phase === "bidding" && currentPlayer && !currentPlayer.isAI ? (
        <BidDialog labels={labels} onBid={makeHumanBid} />
      ) : null}

      {showRulesDialog ? (
        <RulesDialog
          audio={audio}
          labels={labels}
          onClose={() => setShowRulesDialog(false)}
        />
      ) : null}

      {pendingNumberTile ? (
        <NumberDialog
          tile={pendingNumberTile}
          audio={audio}
          labels={labels}
          onCancel={() => setPendingNumberTile(null)}
          onChoose={(number) => {
            const tile = pendingNumberTile;
            setPendingNumberTile(null);
            commitTile(tile, number);
          }}
        />
      ) : null}

      {showRoundSummary && gameState.phase === "roundEnd" ? (
        <RoundSummaryDialog
          gameState={gameState}
          audio={audio}
          labels={labels}
          onContinue={() => {
            setShowRoundSummary(false);
            setGameState((latest) => startNextRound(latest));
          }}
        />
      ) : null}

      {showGameEnd && gameState.phase === "gameEnd" ? (
        <GameEndDialog gameState={gameState} audio={audio} labels={labels} onClose={returnToLobby} />
      ) : null}

      {showExitDialog ? (
        <ExitDialog
          audio={audio}
          labels={labels}
          onCancel={() => setShowExitDialog(false)}
          onExit={returnToLobby}
        />
      ) : null}
    </main>
  );
}

function GameTable({
  gameState,
  labels
}: {
  readonly gameState: GameState;
  readonly labels: AppStrings;
}) {
  return (
    <section className="table" aria-label={labels.currentTrickLabel}>
      <img
        className="tableLogo"
        src="/assets/images/domino_poker_logo.png"
        alt=""
        aria-hidden="true"
      />
      <div className="tableContent">
        {gameState.currentTrick.length === 0 ? (
          gameState.leadTile && gameState.phase === "playing" ? (
            <TrickInfo gameState={gameState} labels={labels} />
          ) : null
        ) : (
          <>
            {gameState.leadTile ? <TrickInfo gameState={gameState} labels={labels} /> : null}
            <div className="playedWrap">
              {gameState.currentTrick.map((play) => {
                const player = gameState.players[play.playerIndex];
                return (
                  <PlayedTileWithLabel
                    key={`${play.playerIndex}-${tileKey(play.tile)}`}
                    tile={play.tile}
                    playerName={player?.name ?? labels.fallbackPlayerName}
                    declaredNumber={play.declaredNumber}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function TrickInfo({
  gameState,
  labels
}: {
  readonly gameState: GameState;
  readonly labels: AppStrings;
}) {
  let label = "";
  let className = "trickInfo";
  if (gameState.isTrumpLead) {
    label = ` ${labels.trump}`;
    className += " danger";
  } else if (gameState.isAceLead) {
    label = ` ${labels.ace}`;
    className += " gold";
  } else if (gameState.requiredNumber !== undefined) {
    label = ` ${labels.required}: ${gameState.requiredNumber}`;
    className += " green";
  }

  return label ? <div className={className}>{label}</div> : null;
}

function PlayedTileWithLabel({
  tile,
  playerName,
  declaredNumber
}: {
  readonly tile: DominoTile;
  readonly playerName: string;
  readonly declaredNumber?: number | undefined;
}) {
  return (
    <div className="playedTileWithLabel">
      <div className="playedName">{playerName}</div>
      <DominoTileView tile={tile} isPlayable />
      {declaredNumber !== undefined ? <div className="declaredNumber">{declaredNumber}</div> : null}
    </div>
  );
}

function ParticleBurst() {
  return (
    <div className="particleLayer" aria-hidden="true">
      {Array.from({ length: 30 }).map((_, index) => (
        <span
          className="particle"
          key={index}
          style={{
            "--angle": `${(index / 30) * 360 + seededNoise(index) * 28}deg`,
            "--distance": `${150 * (0.8 + seededNoise(index + 40) * 0.4)}px`,
            "--radius": `${3 + seededNoise(index + 80) * 5}px`
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function SoundMenu({
  audio,
  labels
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="soundMenu">
      <IconButton
        className="soundButton"
        label={audio.isMuted ? labels.mutedSoundSettings : labels.soundSettings}
        onClick={() => {
          audio.play("uiClick");
          setOpen((value) => !value);
        }}
      >
        {audio.isMuted ? <VolumeOffIcon /> : <VolumeIcon />}
      </IconButton>
      {open ? (
        <div className="soundPanel">
          <AudioControls audio={audio} labels={labels} />
        </div>
      ) : null}
    </div>
  );
}

function useStageContainLayout(): StageContainLayout {
  const [layout, setLayout] = useState<StageContainLayout>(() => getStageContainLayout());

  useEffect(() => {
    const update = () => {
      setLayout(getStageContainLayout());
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return layout;
}

function getStageContainLayout(): StageContainLayout {
  if (typeof window === "undefined") {
    return { scale: 1, left: 0, top: 0 };
  }

  const scale = Math.min(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT);
  return {
    scale,
    left: (window.innerWidth - CANVAS_WIDTH * scale) / 2,
    top: (window.innerHeight - CANVAS_HEIGHT * scale) / 2
  };
}

function getInvalidMoveMessage(reason: InvalidMoveReason, labels: AppStrings): string {
  if (reason.code === "trump-required" || reason.code === "stronger-trump-required") {
    return labels.invalidTrumpMove;
  }

  if (
    (reason.code === "required-number-required" ||
      reason.code === "required-number-or-trump-required") &&
    reason.requiredNumber !== undefined
  ) {
    return formatTemplate(labels.invalidRequiredMove, { number: String(reason.requiredNumber) });
  }

  return labels.invalidMove;
}

function formatTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template
  );
}

function seededNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 42) * 43758.5453;
  return value - Math.floor(value);
}
