"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  completeTrick,
  createNewGame,
  getInvalidMoveReason as getCoreInvalidMoveReason,
  getValidTiles,
  getWinner,
  highestTrumpPriorityInTrick,
  isTrump,
  makeAIBid,
  makeBid,
  playTile,
  selectAITile,
  selectNumber,
  startNextRound,
  tileKey
} from "@domino-poker/core";
import type { DominoTile, GameState, InvalidMoveReason } from "@domino-poker/core";
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
import type { AppStrings } from "../lib/i18n";
import type { GameOutcome } from "../lib/stats/types";
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
  humanProfile,
  labels,
  numberOfRounds,
  onGameFinished,
  onExitToLobby
}: {
  readonly audio: AudioSettings;
  readonly humanProfile: {
    readonly avatarUrl: string | null;
    readonly displayName: string;
  };
  readonly labels: AppStrings;
  readonly numberOfRounds: number;
  readonly onGameFinished: (outcome: GameOutcome) => void;
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
  const gameEndReportedRef = useRef(false);
  const didInitializeGameRef = useRef(false);
  const lastTileSoundSignatureRef = useRef("");
  const stageLayout = useStageContainLayout();

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (!didInitializeGameRef.current) {
      didInitializeGameRef.current = true;
      return;
    }

    gameEndReportedRef.current = false;
    setGameState(createNewGame({ numberOfRounds, playerName: humanPlayerName }));
  }, [humanPlayerName, numberOfRounds]);

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const validHumanTiles = useMemo(() => {
    if (gameState.phase !== "playing" || isProcessingTrick || !currentPlayer || currentPlayer.isAI) {
      return [];
    }
    return getValidTiles(currentPlayer, gameState).map(tileKey);
  }, [currentPlayer, gameState, isProcessingTrick]);

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
      if (!gameEndReportedRef.current) {
        gameEndReportedRef.current = true;
        const winner = getWinner(gameState);
        const humanPlayer = gameState.players[0];
        onGameFinished(winner?.id === humanPlayer?.id ? "win" : "loss");
      }
      phaseDialogTimerRef.current = window.setTimeout(() => setShowGameEnd(true), 1000);
    }
  }, [audio, gameState.phase, gameState.currentRound, onGameFinished]);

  useEffect(() => {
    if (!currentPlayer?.isAI || isProcessingTrick) return;

    const delay = gameState.phase === "bidding" ? 800 : 1000;
    const timer = window.setTimeout(() => {
      setGameState((latest) => {
        const latestPlayer = latest.players[latest.currentPlayerIndex];
        if (!latestPlayer?.isAI) return latest;

        if (latest.phase === "bidding") {
          const bid = makeAIBid(latestPlayer);
          return makeBid(latest, bid);
        }

        if (latest.phase === "playing" && !isProcessingTrick) {
          const tile = selectAITile(latestPlayer, latest);
          const declaredNumber =
            latest.currentTrick.length === 0 && !isTrump(tile)
              ? selectNumber(tile, latestPlayer)
              : undefined;
          const result = playTile(latest, tile, declaredNumber);
          return result.state;
        }

        return latest;
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [currentPlayer, gameState.phase, isProcessingTrick]);

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

      <div className="safeControls">
        <SoundMenu audio={audio} labels={labels} />
        <button
          className="iconButton gameHelpButton"
          type="button"
          aria-label={labels.rules}
          title={labels.rules}
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
          aria-label={labels.exit}
          onClick={() => {
            audio.play("uiClick");
            setShowExitDialog(true);
          }}
        >
          <ExitIcon />
        </button>
      </div>

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
      <button
        className="iconButton soundButton"
        type="button"
        aria-label={audio.isMuted ? labels.mutedSoundSettings : labels.soundSettings}
        onClick={() => {
          audio.play("uiClick");
          setOpen((value) => !value);
        }}
      >
        {audio.isMuted ? <VolumeOffIcon /> : <VolumeIcon />}
      </button>
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
