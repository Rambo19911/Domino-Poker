"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calculateRoundScore,
  canPlayTile,
  completeTrick,
  createNewGame,
  getFullSet,
  getValidTiles,
  getWinner,
  highestTrumpPriorityInTrick,
  isAce,
  isTrump,
  makeAIBid,
  makeBid,
  playTile,
  selectAITile,
  selectNumber,
  startNextRound,
  tileKey
} from "@domino-poker/core";
import type { DominoTile, GameState, Player } from "@domino-poker/core";
import { AudioControls, VolumeIcon, VolumeOffIcon } from "./AudioControls";
import { HelpIcon, RulesDialog } from "./RulesDialog";
import type { AppStrings } from "../lib/i18n";
import type { GameOutcome } from "../lib/stats/types";
import type { AudioSettings } from "../lib/useAudioSettings";

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const PROFILE_SIZE = 144;

const layout = {
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
  player0TileSpacing: 90,
  tableLeft: 448,
  tableTop: 320,
  tableSize: 450,
  infoPanelLeft: 1360,
  infoPanelTop: 128,
  tileWidth: 80,
  tileHeight: 144,
  hiddenTileWidth: 144,
  hiddenTileHeight: 80
} as const;

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
    createNewGame({ dealerIndex: 0, deck: getFullSet(), numberOfRounds, playerName: humanPlayerName })
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
  const gameEndReportedRef = useRef(false);
  const lastTileSoundSignatureRef = useRef("");
  const scale = useCoverScale();

  useEffect(() => {
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
    clearCompletionTimer();
    setIsProcessingTrick(true);
    completionTimerRef.current = window.setTimeout(() => {
      setGameState((latest) => {
        const completed = completeTrick(latest);
        setLastTrickWinner(completed.currentPlayerIndex);
        setShowWinnerGlow(true);
        setShowParticleBurst(true);
        audio.play("trickComplete");

        clearGlowTimer();
        clearBurstTimer();
        glowTimerRef.current = window.setTimeout(() => setShowWinnerGlow(false), 2000);
        burstTimerRef.current = window.setTimeout(() => setShowParticleBurst(false), 1000);
        return completed;
      });
      setIsProcessingTrick(false);
      completionTimerRef.current = null;
    }, 2000);
  }, [audio, clearBurstTimer, clearCompletionTimer, clearGlowTimer]);

  const commitTile = useCallback(
    (tile: DominoTile, declaredNumber?: number) => {
      setGameState((latest) => {
        const result = playTile(latest, tile, declaredNumber);
        if (result.trickComplete) {
          scheduleCompleteTrick();
        }
        return result.state;
      });
    },
    [scheduleCompleteTrick]
  );

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
          const bid = makeAIBid(latestPlayer, latestPlayer.aiDifficulty ?? "hard");
          return makeBid(latest, bid);
        }

        if (latest.phase === "playing" && !isProcessingTrick) {
          const tile = selectAITile(latestPlayer, latest, latestPlayer.aiDifficulty ?? "hard");
          const declaredNumber =
            latest.currentTrick.length === 0 && !isTrump(tile)
              ? selectNumber(tile, latestPlayer)
              : undefined;
          const result = playTile(latest, tile, declaredNumber);
          if (result.trickComplete) {
            scheduleCompleteTrick();
          }
          return result.state;
        }

        return latest;
      });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [currentPlayer, gameState.phase, isProcessingTrick, scheduleCompleteTrick]);

  const makeHumanBid = (bid: number) => {
    audio.play("bidClick");
    setGameState((latest) => makeBid(latest, bid));
  };

  const handleTileClick = (tile: DominoTile) => {
    if (!currentPlayer || currentPlayer.isAI || gameState.phase !== "playing") return;
    if (isProcessingTrick) return;

    const playable = canPlayTile(currentPlayer, tile, {
      leadTile: gameState.leadTile,
      requiredNumber: gameState.requiredNumber,
      isTrumpLead: gameState.isTrumpLead,
      isAceLead: gameState.isAceLead,
      highestTrumpPriorityInTrick: highestTrumpPriorityInTrick(gameState)
    });

    if (!playable) {
      setInvalidMessage(getInvalidMoveMessage(gameState, labels));
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
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
          aria-label={labels.gameTableLabel}
        >
          <GameTable gameState={gameState} labels={labels} />

          <AILeftPlayer
            gameState={gameState}
            labels={labels}
            player={gameState.players[1]}
            isWinnerGlow={showWinnerGlow && lastTrickWinner === 1}
          />
          <AITopPlayer
            gameState={gameState}
            labels={labels}
            player={gameState.players[2]}
            isWinnerGlow={showWinnerGlow && lastTrickWinner === 2}
          />
          <AIRightPlayer
            gameState={gameState}
            labels={labels}
            player={gameState.players[3]}
            isWinnerGlow={showWinnerGlow && lastTrickWinner === 3}
          />
          <HumanBottomPlayer
            gameState={gameState}
            humanAvatarUrl={humanProfile.avatarUrl}
            labels={labels}
            player={gameState.players[0]}
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

function AILeftPlayer({
  gameState,
  labels,
  player,
  isWinnerGlow
}: {
  readonly gameState: GameState;
  readonly labels: AppStrings;
  readonly player: Player | undefined;
  readonly isWinnerGlow: boolean;
}) {
  if (!player) return null;
  return (
    <>
      <PlayerProfile
        player={player}
        playerIndex={1}
        gameState={gameState}
        labels={labels}
        isWinnerGlow={isWinnerGlow}
        style={{ left: layout.player1ProfileLeft, top: layout.player1ProfileTop }}
      />
      <PlayerStats
        labels={labels}
        player={player}
        style={{ left: layout.player1StatsLeft, top: layout.player1StatsTop }}
      />
      {player.hand.map((tile, index) => (
        <HiddenTile
          key={`${tileKey(tile)}-${index}`}
          orientation="horizontal"
          style={{
            left: layout.player1TilesLeft,
            top: layout.player1TilesStartTop + index * layout.player1TileSpacing
          }}
        />
      ))}
    </>
  );
}

function AITopPlayer({
  gameState,
  labels,
  player,
  isWinnerGlow
}: {
  readonly gameState: GameState;
  readonly labels: AppStrings;
  readonly player: Player | undefined;
  readonly isWinnerGlow: boolean;
}) {
  if (!player) return null;
  return (
    <>
      <PlayerProfile
        player={player}
        playerIndex={2}
        gameState={gameState}
        labels={labels}
        isWinnerGlow={isWinnerGlow}
        style={{ left: layout.player2ProfileLeft, top: layout.player2ProfileTop }}
      />
      <PlayerStats
        labels={labels}
        player={player}
        style={{ left: layout.player2StatsLeft, top: layout.player2StatsTop }}
      />
      {player.hand.map((tile, index) => {
        const rightMostIndex = 6;
        const firstVisibleIndex = rightMostIndex - (player.hand.length - 1);
        const visualIndex = firstVisibleIndex + index;
        return (
          <HiddenTile
            key={`${tileKey(tile)}-${index}`}
            orientation="vertical"
            style={{
              left: layout.player2TilesStartLeft + visualIndex * layout.player2TileSpacing,
              top: layout.player2TilesTop
            }}
          />
        );
      })}
    </>
  );
}

function AIRightPlayer({
  gameState,
  labels,
  player,
  isWinnerGlow
}: {
  readonly gameState: GameState;
  readonly labels: AppStrings;
  readonly player: Player | undefined;
  readonly isWinnerGlow: boolean;
}) {
  if (!player) return null;
  return (
    <>
      <PlayerProfile
        player={player}
        playerIndex={3}
        gameState={gameState}
        labels={labels}
        isWinnerGlow={isWinnerGlow}
        style={{ left: layout.player3ProfileLeft, top: layout.player3ProfileTop }}
      />
      <PlayerStats
        labels={labels}
        player={player}
        style={{ left: layout.player3StatsLeft, top: layout.player3StatsTop }}
      />
      {player.hand.map((tile, index) => {
        const bottomIndex = 6;
        const firstVisibleIndex = bottomIndex - (player.hand.length - 1);
        const visualIndex = firstVisibleIndex + index;
        return (
          <HiddenTile
            key={`${tileKey(tile)}-${index}`}
            orientation="horizontal"
            style={{
              left: layout.player3TilesLeft,
              top: layout.player3TilesStartTop + visualIndex * layout.player3TileSpacing
            }}
          />
        );
      })}
    </>
  );
}

function HumanBottomPlayer({
  gameState,
  humanAvatarUrl,
  labels,
  player,
  validTileKeys,
  isWinnerGlow,
  onTileClick
}: {
  readonly gameState: GameState;
  readonly humanAvatarUrl: string | null;
  readonly labels: AppStrings;
  readonly player: Player | undefined;
  readonly validTileKeys: readonly string[];
  readonly isWinnerGlow: boolean;
  readonly onTileClick: (tile: DominoTile) => void;
}) {
  if (!player) return null;
  const isActive = gameState.currentPlayerIndex === 0;
  return (
    <>
      <PlayerProfile
        player={player}
        playerIndex={0}
        gameState={gameState}
        avatarUrl={humanAvatarUrl}
        labels={labels}
        isWinnerGlow={isWinnerGlow}
        style={{ left: layout.player0ProfileLeft, top: layout.player0ProfileTop }}
      />
      <PlayerStats
        labels={labels}
        player={player}
        style={{ left: layout.player0StatsLeft, top: layout.player0StatsTop }}
      />
      {isActive && gameState.phase === "playing" ? <YourTurnIndicator labels={labels} /> : null}
      {player.hand.map((tile, index) => {
        const key = tileKey(tile);
        const isValid = validTileKeys.includes(key);
        return (
          <button
            className={`humanTileButton ${isValid && isActive ? "valid" : ""}`}
            key={`${key}-${index}`}
            type="button"
            aria-label={formatTemplate(labels.playTile, { tile: `${tile.side1}-${tile.side2}` })}
            onClick={() => onTileClick(tile)}
            disabled={!isValid || !isActive}
            style={{
              left: layout.player0TilesStartLeft + index * layout.player0TileSpacing,
              top: layout.player0TilesTop
            }}
          >
            <DominoTileView tile={tile} isPlayable={isValid && isActive} />
          </button>
        );
      })}
    </>
  );
}

function PlayerProfile({
  player,
  playerIndex,
  gameState,
  avatarUrl = null,
  labels,
  isWinnerGlow,
  style
}: {
  readonly player: Player;
  readonly playerIndex: number;
  readonly gameState: GameState;
  readonly avatarUrl?: string | null;
  readonly labels: AppStrings;
  readonly isWinnerGlow: boolean;
  readonly style: React.CSSProperties;
}) {
  const isActive = gameState.currentPlayerIndex === playerIndex;
  const isDealer = gameState.dealerIndex === playerIndex;
  return (
    <div
      className={`playerProfile ${avatarUrl ? "hasAvatar" : ""} ${isActive ? "active" : ""} ${isDealer ? "dealer" : ""} ${
        isWinnerGlow ? "winnerGlow" : ""
      }`}
      style={{ ...style, width: PROFILE_SIZE, height: PROFILE_SIZE }}
    >
      {avatarUrl ? (
        <img className="profileAvatarImage" src={avatarUrl} alt="" aria-hidden="true" />
      ) : null}
      <div className="profileBottom">
        <div className={`profileName ${isActive ? "activeName" : ""}`}>{player.name}</div>
        {isDealer ? <div className="dealerBadge">{labels.dealer}</div> : null}
      </div>
    </div>
  );
}

function PlayerStats({
  labels,
  player,
  style
}: {
  readonly labels: AppStrings;
  readonly player: Player;
  readonly style: React.CSSProperties;
}) {
  return (
    <div className="playerStats" style={style}>
      <div>{labels.tricksBid}: {player.bid < 0 ? "?" : player.bid}</div>
      <div>{labels.tricksWon}: {player.tricksWon}</div>
    </div>
  );
}

function YourTurnIndicator({ labels }: { readonly labels: AppStrings }) {
  return (
    <div className="yourTurnIndicator">
      <TouchIcon />
      <span>{labels.yourTurn}</span>
    </div>
  );
}

function InfoPanel({
  gameState,
  labels
}: {
  readonly gameState: GameState;
  readonly labels: AppStrings;
}) {
  return (
    <aside className="infoPanel" aria-label={labels.gameStatus}>
      <div className="infoPanelHeader">
        <div className="roundTitle">{labels.roundLabel} {gameState.currentRound}/{gameState.totalRounds}</div>
        {gameState.phase === "playing" ? (
          <div className="trickCount">{gameState.completedTricks.length} {labels.tricksLabel} / 7</div>
        ) : null}
      </div>
      <div className="infoDivider" />
      <div className="scoreRows">
        {gameState.players.map((player, index) => {
          const roundScore = calculateRoundScore(player);
          const isCurrent = gameState.currentPlayerIndex === index;
          const tricksBidText = player.bid >= 0 ? `${player.tricksWon}/${player.bid}` : `${player.tricksWon}`;
          return (
            <div className="scoreRow" key={player.id}>
              <span className={`turnMarker ${isCurrent ? "active" : ""}`} aria-hidden="true" />
              <div className={`scorePlayerName ${isCurrent ? "current" : ""}`}>
                <span>{player.name}</span>
              </div>
              <div className="tricksBidCell">{tricksBidText}</div>
              <div className="scoreCell">{roundScore} / {player.totalScore}</div>
            </div>
          );
        })}
      </div>
    </aside>
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

function DominoTileView({
  tile,
  isPlayable = true
}: {
  readonly tile: DominoTile;
  readonly isPlayable?: boolean;
}) {
  const tileClass = !isPlayable ? "disabledTile" : isTrump(tile) ? "trumpTile" : isAce(tile) ? "aceTile" : "";
  return (
    <span className={`dominoTile ${tileClass}`}>
      <span className="tileHalf">{renderPips(tile.side1)}</span>
      <span className="tileDivider" />
      <span className="tileHalf">{renderPips(tile.side2)}</span>
    </span>
  );
}

function HiddenTile({
  orientation,
  style
}: {
  readonly orientation: "horizontal" | "vertical";
  readonly style: React.CSSProperties;
}) {
  return (
    <span
      className={`hiddenTile ${orientation === "vertical" ? "hiddenVertical" : "hiddenHorizontal"}`}
      style={style}
    >
      <span className="hiddenTileSide" />
      <span className="hiddenDivider" />
      <span className="hiddenTileSide" />
    </span>
  );
}

function renderPips(count: number) {
  return (
    <span className={`pips pips-${count}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <span className="pip" key={index} />
      ))}
    </span>
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
            "--radius": `${3 + seededNoise(index + 80) * 5}px`,
            "--colorIndex": index % 3
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function BidDialog({
  labels,
  onBid
}: {
  readonly labels: AppStrings;
  readonly onBid: (bid: number) => void;
}) {
  return (
    <Modal transparent>
      <div className="bidDialog">
        <h2>{labels.bidPrompt}</h2>
        <div className="bidGrid">
          {Array.from({ length: 8 }).map((_, bid) => (
            <button className={`bidButton ${bid === 0 ? "selected" : ""} ${bid === 7 ? "bidSeven" : ""}`} key={bid} type="button" onClick={() => onBid(bid)}>
              <strong>{bid}</strong>
              {bid === 7 ? <span>{labels.bidSevenBonus}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function NumberDialog({
  tile,
  audio,
  labels,
  onCancel,
  onChoose
}: {
  readonly tile: DominoTile;
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onCancel: () => void;
  readonly onChoose: (number: number) => void;
}) {
  const options = tile.side1 === tile.side2 ? [tile.side1] : [tile.side1, tile.side2];
  return (
    <Modal>
      <div className="alertDialog numberDialog">
        <h2>{labels.selectSuit}</h2>
        <p>{labels.chooseNumber}</p>
        <div className="numberChoices">
          {options.map((number) => (
            <button
              key={number}
              type="button"
              onClick={() => {
                audio.play("uiClick");
                onChoose(number);
              }}
            >
              {number}
            </button>
          ))}
        </div>
        <div className="dialogActions">
          <button className="textButton" type="button" onClick={onCancel}>{labels.cancel}</button>
        </div>
      </div>
    </Modal>
  );
}

function RoundSummaryDialog({
  gameState,
  audio,
  labels,
  onContinue
}: {
  readonly gameState: GameState;
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onContinue: () => void;
}) {
  return (
    <Modal>
      <div className="alertDialog summaryDialog">
        <h2><TrophyIcon /> {labels.roundSummary}</h2>
        <strong className="summaryRound">{labels.roundLabel} {gameState.currentRound}/{gameState.totalRounds}</strong>
        <table>
          <thead>
            <tr>
              <th />
              <th>{labels.roundSummaryTricks}</th>
              <th>{labels.roundSummaryWon}</th>
              <th>+/-</th>
            </tr>
          </thead>
          <tbody>
            {gameState.players.map((player) => {
              const score = calculateRoundScore(player);
              return (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.bid}</td>
                  <td>{player.tricksWon}</td>
                  <td className={score >= 0 ? "positive" : "negative"}>{score > 0 ? `+${score}` : score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h3>{labels.totalScore}</h3>
        <dl className="summaryScores">
          {gameState.players.map((player) => (
            <div key={player.id}>
              <dt>{player.name}</dt>
              <dd>{player.totalScore}</dd>
            </div>
          ))}
        </dl>
        <button
          className="primaryButton"
          type="button"
          onClick={() => {
            audio.play("uiClick");
            onContinue();
          }}
        >
          {labels.continueGame}
        </button>
      </div>
    </Modal>
  );
}

function GameEndDialog({
  gameState,
  audio,
  labels,
  onClose
}: {
  readonly gameState: GameState;
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onClose: () => void;
}) {
  const winner = getWinner(gameState);
  return (
    <Modal>
      <div className="alertDialog summaryDialog">
        <h2><TrophyIcon /> {labels.gameOver}</h2>
        <div className="winnerBanner">{labels.winner}: {winner?.name ?? ""}</div>
        <dl className="finalScores">
          {gameState.players.map((player) => (
            <div className={player.id === winner?.id ? "winnerRow" : ""} key={player.id}>
              <dt>{player.name}</dt>
              <dd>{player.totalScore} {labels.pointsLabel}</dd>
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
          {labels.ok}
        </button>
      </div>
    </Modal>
  );
}

function ExitDialog({
  audio,
  labels,
  onCancel,
  onExit
}: {
  readonly audio: AudioSettings;
  readonly labels: AppStrings;
  readonly onCancel: () => void;
  readonly onExit: () => void;
}) {
  return (
    <Modal>
      <div className="alertDialog exitDialog">
        <h2><ExitIcon /> {labels.exit}</h2>
        <div className="exitContent">
          <p>{labels.exitGameConfirm}</p>
          <p className="negative">{labels.exitGameLoseWarning}</p>
        </div>
        <div className="dialogActions">
          <button
            className="textButton"
            type="button"
            onClick={() => {
              audio.play("uiClick");
              onCancel();
            }}
          >
            {labels.cancel}
          </button>
          <button
            className="dangerButton"
            type="button"
            onClick={() => {
              audio.play("uiClick");
              onExit();
            }}
          >
            {labels.exit}
          </button>
        </div>
      </div>
    </Modal>
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

function Modal({
  children,
  transparent = false
}: {
  readonly children: React.ReactNode;
  readonly transparent?: boolean;
}) {
  return <div className={`modalBackdrop ${transparent ? "transparentBackdrop" : ""}`}>{children}</div>;
}

function useCoverScale(): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      setScale(Math.max(window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return scale;
}

function getInvalidMoveMessage(gameState: GameState, labels: AppStrings): string {
  if (gameState.isTrumpLead) {
    return labels.invalidTrumpMove;
  }
  if ((gameState.isAceLead || gameState.requiredNumber !== undefined) && gameState.requiredNumber !== undefined) {
    return formatTemplate(labels.invalidRequiredMove, { number: String(gameState.requiredNumber) });
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

function ExitIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M8 12h10" />
    </svg>
  );
}

function TouchIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 11V5a2 2 0 0 1 4 0v6" />
      <path d="M12 10V8a2 2 0 0 1 4 0v4" />
      <path d="M16 12v-1a2 2 0 0 1 4 0v3c0 4-3 7-7 7h-1a6 6 0 0 1-5.2-3L4 13a2 2 0 0 1 3.5-2l1.5 2" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H4v2a4 4 0 0 0 4 4" />
      <path d="M16 6h4v2a4 4 0 0 1-4 4" />
      <path d="M12 13v5" />
      <path d="M8 20h8" />
    </svg>
  );
}
