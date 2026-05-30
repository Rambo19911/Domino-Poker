"use client";

import { calculateRoundScore } from "@domino-poker/core";
import type { GameState } from "@domino-poker/core";
import type { AppStrings } from "../lib/i18n";

export function InfoPanel({
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
