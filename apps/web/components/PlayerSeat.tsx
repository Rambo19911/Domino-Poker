"use client";

import { tileKey } from "@domino-poker/core";
import type { DominoTile, GameState, Player } from "@domino-poker/core";
import type { CSSProperties } from "react";
import type { AppStrings } from "../lib/i18n";
import { DominoTileView, HiddenTile } from "./DominoTileView";

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

export function PlayerSeat({
  gameState,
  humanAvatarUrl = null,
  humanTitle = null,
  isWinnerGlow,
  labels,
  onTileClick,
  player,
  seatIndex,
  validTileKeys = []
}: {
  readonly gameState: GameState;
  readonly humanAvatarUrl?: string | null;
  readonly humanTitle?: string | null;
  readonly isWinnerGlow: boolean;
  readonly labels: AppStrings;
  readonly onTileClick?: (tile: DominoTile) => void;
  readonly player: Player | undefined;
  readonly seatIndex: 0 | 1 | 2 | 3;
  readonly validTileKeys?: readonly string[];
}) {
  if (!player) return null;

  if (seatIndex === 0) {
    return (
      <HumanSeat
        gameState={gameState}
        humanAvatarUrl={humanAvatarUrl}
        humanTitle={humanTitle}
        isWinnerGlow={isWinnerGlow}
        labels={labels}
        onTileClick={onTileClick}
        player={player}
        validTileKeys={validTileKeys}
      />
    );
  }

  return (
    <AiSeat
      gameState={gameState}
      isWinnerGlow={isWinnerGlow}
      labels={labels}
      player={player}
      seatIndex={seatIndex}
    />
  );
}

function AiSeat({
  gameState,
  isWinnerGlow,
  labels,
  player,
  seatIndex
}: {
  readonly gameState: GameState;
  readonly isWinnerGlow: boolean;
  readonly labels: AppStrings;
  readonly player: Player;
  readonly seatIndex: 1 | 2 | 3;
}) {
  const profileStyle = getProfileStyle(seatIndex);
  const statsStyle = getStatsStyle(seatIndex);

  return (
    <>
      <PlayerProfile
        player={player}
        playerIndex={seatIndex}
        gameState={gameState}
        labels={labels}
        isWinnerGlow={isWinnerGlow}
        style={profileStyle}
      />
      <PlayerStats labels={labels} player={player} style={statsStyle} />
      {renderAiTiles(player, seatIndex)}
    </>
  );
}

function HumanSeat({
  gameState,
  humanAvatarUrl,
  humanTitle,
  isWinnerGlow,
  labels,
  onTileClick,
  player,
  validTileKeys
}: {
  readonly gameState: GameState;
  readonly humanAvatarUrl: string | null;
  readonly humanTitle: string | null;
  readonly isWinnerGlow: boolean;
  readonly labels: AppStrings;
  readonly onTileClick: ((tile: DominoTile) => void) | undefined;
  readonly player: Player;
  readonly validTileKeys: readonly string[];
}) {
  const isActive = gameState.currentPlayerIndex === 0;

  return (
    <>
      <PlayerProfile
        player={player}
        playerIndex={0}
        gameState={gameState}
        avatarUrl={humanAvatarUrl}
        title={humanTitle}
        labels={labels}
        isWinnerGlow={isWinnerGlow}
        style={{ left: seatLayout.player0ProfileLeft, top: seatLayout.player0ProfileTop }}
      />
      <PlayerStats
        labels={labels}
        player={player}
        style={{ left: seatLayout.player0StatsLeft, top: seatLayout.player0StatsTop }}
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
            onClick={() => onTileClick?.(tile)}
            disabled={!isValid || !isActive}
            style={{
              left: seatLayout.player0TilesStartLeft + index * seatLayout.player0TileSpacing,
              top: seatLayout.player0TilesTop
            }}
          >
            <DominoTileView tile={tile} isPlayable={isValid && isActive} />
          </button>
        );
      })}
    </>
  );
}

function renderAiTiles(player: Player, seatIndex: 1 | 2 | 3) {
  if (seatIndex === 1) {
    return player.hand.map((tile, index) => (
      <HiddenTile
        key={`${tileKey(tile)}-${index}`}
        orientation="horizontal"
        style={{
          left: seatLayout.player1TilesLeft,
          top: seatLayout.player1TilesStartTop + index * seatLayout.player1TileSpacing
        }}
      />
    ));
  }

  if (seatIndex === 2) {
    return player.hand.map((tile, index) => {
      const rightMostIndex = 6;
      const firstVisibleIndex = rightMostIndex - (player.hand.length - 1);
      const visualIndex = firstVisibleIndex + index;
      return (
        <HiddenTile
          key={`${tileKey(tile)}-${index}`}
          orientation="vertical"
          style={{
            left: seatLayout.player2TilesStartLeft + visualIndex * seatLayout.player2TileSpacing,
            top: seatLayout.player2TilesTop
          }}
        />
      );
    });
  }

  return player.hand.map((tile, index) => {
    const bottomIndex = 6;
    const firstVisibleIndex = bottomIndex - (player.hand.length - 1);
    const visualIndex = firstVisibleIndex + index;
    return (
      <HiddenTile
        key={`${tileKey(tile)}-${index}`}
        orientation="horizontal"
        style={{
          left: seatLayout.player3TilesLeft,
          top: seatLayout.player3TilesStartTop + visualIndex * seatLayout.player3TileSpacing
        }}
      />
    );
  });
}

function getProfileStyle(seatIndex: 1 | 2 | 3): CSSProperties {
  if (seatIndex === 1) {
    return { left: seatLayout.player1ProfileLeft, top: seatLayout.player1ProfileTop };
  }
  if (seatIndex === 2) {
    return { left: seatLayout.player2ProfileLeft, top: seatLayout.player2ProfileTop };
  }
  return { left: seatLayout.player3ProfileLeft, top: seatLayout.player3ProfileTop };
}

function getStatsStyle(seatIndex: 1 | 2 | 3): CSSProperties {
  if (seatIndex === 1) {
    return { left: seatLayout.player1StatsLeft, top: seatLayout.player1StatsTop };
  }
  if (seatIndex === 2) {
    return { left: seatLayout.player2StatsLeft, top: seatLayout.player2StatsTop };
  }
  return { left: seatLayout.player3StatsLeft, top: seatLayout.player3StatsTop };
}

function PlayerProfile({
  player,
  playerIndex,
  gameState,
  avatarUrl = null,
  title = null,
  labels,
  isWinnerGlow,
  style
}: {
  readonly player: Player;
  readonly playerIndex: number;
  readonly gameState: GameState;
  readonly avatarUrl?: string | null;
  readonly title?: string | null;
  readonly labels: AppStrings;
  readonly isWinnerGlow: boolean;
  readonly style: CSSProperties;
}) {
  const isActive = gameState.currentPlayerIndex === playerIndex;
  const isDealer = gameState.dealerIndex === playerIndex;
  return (
    <div
      className={`playerProfile ${avatarUrl ? "hasAvatar" : ""} ${isActive ? "active" : ""} ${isDealer ? "dealer" : ""} ${
        isWinnerGlow ? "winnerGlow" : ""
      }`}
      style={{ ...style, width: profileSize, height: profileSize }}
    >
      {avatarUrl ? (
        <img className="profileAvatarImage" src={avatarUrl} alt="" aria-hidden="true" />
      ) : null}
      <div className="profileBottom">
        <div className={`profileName ${isActive ? "activeName" : ""}`}>{player.name}</div>
        {title ? <div className="profileTitle">{title}</div> : null}
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
  readonly style: CSSProperties;
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

function TouchIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 11V5a2 2 0 0 1 4 0v6" />
      <path d="M12 10V8a2 2 0 0 1 4 0v4" />
      <path d="M16 12v-1a2 2 0 0 1 4 0v3c0 4-3 7-7 7h-1a6 6 0 0 1-5.2-3L4 13a2 2 0 0 1 3.5-2l1.5 2" />
    </svg>
  );
}

function formatTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template
  );
}
