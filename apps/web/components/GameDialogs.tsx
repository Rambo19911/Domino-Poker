"use client";

import { useCallback } from "react";
import { calculateRoundScore, getWinner } from "@domino-poker/core";
import type { DominoTile, GameState } from "@domino-poker/core";
import type { AppStrings } from "../lib/i18n";
import type { AudioSettings } from "../lib/useAudioSettings";
import { Dialog } from "./Dialog";

export function BidDialog({
  labels,
  onBid
}: {
  readonly labels: AppStrings;
  readonly onBid: (bid: number) => void;
}) {
  return (
    <Dialog
      ariaLabelledBy="bid-dialog-title"
      className="bidDialog"
      transparent
    >
      <h2 id="bid-dialog-title">{labels.bidPrompt}</h2>
      <div className="bidGrid">
        {Array.from({ length: 8 }).map((_, bid) => (
          <button className={`bidButton ${bid === 0 ? "selected" : ""} ${bid === 7 ? "bidSeven" : ""}`} key={bid} type="button" onClick={() => onBid(bid)}>
            <strong>{bid}</strong>
            {bid === 7 ? <span>{labels.bidSevenBonus}</span> : null}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export function NumberDialog({
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
  const handleCancel = useCallback(() => {
    audio.play("uiClick");
    onCancel();
  }, [audio, onCancel]);

  return (
    <Dialog
      ariaLabelledBy="number-dialog-title"
      className="alertDialog numberDialog"
      onEscape={handleCancel}
    >
      <h2 id="number-dialog-title">{labels.selectSuit}</h2>
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
        <button className="textButton" type="button" onClick={handleCancel}>{labels.cancel}</button>
      </div>
    </Dialog>
  );
}

export function RoundSummaryDialog({
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
    <Dialog
      ariaLabelledBy="round-summary-title"
      className="alertDialog summaryDialog"
    >
      <h2 id="round-summary-title"><TrophyIcon /> {labels.roundSummary}</h2>
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
    </Dialog>
  );
}

export function GameEndDialog({
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
  const handleClose = useCallback(() => {
    audio.play("uiClick");
    onClose();
  }, [audio, onClose]);

  return (
    <Dialog
      ariaLabelledBy="game-end-title"
      className="alertDialog summaryDialog"
      onEscape={handleClose}
    >
      <h2 id="game-end-title"><TrophyIcon /> {labels.gameOver}</h2>
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
        onClick={handleClose}
      >
        {labels.ok}
      </button>
    </Dialog>
  );
}

export function ExitDialog({
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
  const handleCancel = useCallback(() => {
    audio.play("uiClick");
    onCancel();
  }, [audio, onCancel]);

  return (
    <Dialog
      ariaLabelledBy="exit-dialog-title"
      className="alertDialog exitDialog"
      onEscape={handleCancel}
    >
      <h2 id="exit-dialog-title"><ExitIcon /> {labels.exit}</h2>
      <div className="exitContent">
        <p>{labels.exitGameConfirm}</p>
        <p className="negative">{labels.exitGameLoseWarning}</p>
      </div>
      <div className="dialogActions">
        <button
          className="textButton"
          type="button"
          onClick={handleCancel}
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
    </Dialog>
  );
}

export function ExitIcon() {
  return (
    <svg className="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 4H5v16h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M8 12h10" />
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
