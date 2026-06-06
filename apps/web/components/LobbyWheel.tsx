"use client";

import { useState, type CSSProperties, type PointerEvent } from "react";
import type { AppStrings } from "../lib/i18n";

export function LobbyWheel({
  disabled,
  labels,
  maxRoundCount,
  minRoundCount,
  onRoundCountChange,
  onStartSinglePlayer,
  onStartMultiplayer,
  selectedRoundCount
}: {
  readonly disabled: boolean;
  readonly labels: AppStrings;
  readonly maxRoundCount: number;
  readonly minRoundCount: number;
  readonly onRoundCountChange: (roundCount: number) => void;
  readonly onStartSinglePlayer: () => void;
  readonly onStartMultiplayer: () => void;
  readonly selectedRoundCount: number;
}) {
  const playButtonPoint = getWheelPoint(348, 215);
  const multiplayerButtonPoint = getWheelPoint(12, 215);

  return (
    <div className="modeWheel" aria-label={labels.gameModes}>
      <svg className="modeWheelArt" viewBox="0 0 500 500" aria-hidden="true">
        <defs>
          <path
            id="single-player-label-path"
            d="M 118 162 A 170 170 0 0 1 382 162"
          />
          <path
            id="multiplayer-label-path"
            d="M 115 360 A 170 170 0 0 0 385 360"
          />
        </defs>
        <path
          className="modeWheelArc top"
          d="M 6 235 A 245 245 0 0 1 494 235 L 394 235 A 145 145 0 0 0 106 235 Z"
        />
        <path
          className="modeWheelArc bottom"
          d="M 494 265 A 245 245 0 0 1 6 265 L 106 265 A 145 145 0 0 0 394 265 Z"
        />
        <text className="modeWheelText top">
          <textPath href="#single-player-label-path" startOffset="50%">
            {labels.modeSinglePlayer}
          </textPath>
        </text>
        <text className="modeWheelText bottom">
          <textPath href="#multiplayer-label-path" startOffset="50%">
            {labels.modeMultiplayer}
          </textPath>
        </text>
      </svg>

      <div className="singleModeControls">
        <RoundArcSelector
          decreaseLabel={labels.decreaseRounds}
          disabled={disabled}
          id="single-player-round-count"
          increaseLabel={labels.increaseRounds}
          label={labels.roundCount}
          max={maxRoundCount}
          min={minRoundCount}
          onChange={onRoundCountChange}
          value={selectedRoundCount}
        />

        <button
          className="playButton"
          style={{
            left: formatWheelPercent(playButtonPoint.x),
            top: formatWheelPercent(playButtonPoint.y)
          } as CSSProperties}
          type="button"
          disabled={disabled}
          onClick={onStartSinglePlayer}
        >
          {labels.play}
        </button>
      </div>

      <div className="multiModeControls">
        <button
          className="playButton multiplayerButton"
          style={{
            left: formatWheelPercent(multiplayerButtonPoint.x),
            top: formatWheelPercent(multiplayerButtonPoint.y)
          } as CSSProperties}
          type="button"
          disabled={disabled}
          aria-label={labels.modeMultiplayer}
          onClick={onStartMultiplayer}
        >
          {labels.mpEnter}
        </button>
      </div>

      <div className="modeWheelLogo">
        <img src="/assets/images/domino_poker_logo.png" alt="" />
      </div>
    </div>
  );
}

export function CompactLobbyPanel({
  disabled,
  labels,
  maxRoundCount,
  minRoundCount,
  onRoundCountChange,
  onStartSinglePlayer,
  onStartMultiplayer,
  selectedRoundCount
}: {
  readonly disabled: boolean;
  readonly labels: AppStrings;
  readonly maxRoundCount: number;
  readonly minRoundCount: number;
  readonly onRoundCountChange: (roundCount: number) => void;
  readonly onStartSinglePlayer: () => void;
  readonly onStartMultiplayer: () => void;
  readonly selectedRoundCount: number;
}) {
  return (
    <div className="compactLobbyPanel" aria-label={labels.gameModes}>
      <img className="compactLobbyLogo" src="/assets/images/domino_poker_logo.png" alt="" />
      <div className="compactModeTitle">{labels.modeSinglePlayer}</div>
      <CompactRoundSelector
        decreaseLabel={labels.decreaseRounds}
        disabled={disabled}
        id="compact-single-player-round-count"
        increaseLabel={labels.increaseRounds}
        label={labels.roundCount}
        max={maxRoundCount}
        min={minRoundCount}
        onChange={onRoundCountChange}
        value={selectedRoundCount}
      />
      <button
        className="compactPlayButton"
        type="button"
        disabled={disabled}
        onClick={onStartSinglePlayer}
      >
        {labels.play}
      </button>
      <button
        className="compactMultiplayerButton"
        type="button"
        disabled={disabled}
        onClick={onStartMultiplayer}
      >
        {labels.modeMultiplayer}
      </button>
    </div>
  );
}

function CompactRoundSelector({
  decreaseLabel,
  disabled,
  id,
  increaseLabel,
  label,
  max,
  min,
  onChange,
  value
}: {
  readonly decreaseLabel: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly increaseLabel: string;
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly onChange: (roundCount: number) => void;
  readonly value: number;
}) {
  const setClampedValue = (nextValue: number) => {
    onChange(clampRoundCount(nextValue, min, max));
  };

  return (
    <div className="compactRoundSelector">
      <div className="compactRoundHeader">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{value}</output>
      </div>
      <div className="compactRoundControls">
        <button
          className="compactRoundStep"
          type="button"
          disabled={disabled || value <= min}
          aria-label={decreaseLabel}
          onClick={() => setClampedValue(value - 1)}
        >
          -
        </button>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => setClampedValue(event.currentTarget.valueAsNumber)}
        />
        <button
          className="compactRoundStep"
          type="button"
          disabled={disabled || value >= max}
          aria-label={increaseLabel}
          onClick={() => setClampedValue(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

const wheelCenter = 250;
const roundArcRadius = 214;
const roundArcStartAngle = 214;
const roundArcEndAngle = 326;
const roundArcPath = describeArc(
  wheelCenter,
  wheelCenter,
  roundArcRadius,
  roundArcStartAngle,
  roundArcEndAngle
);

function RoundArcSelector({
  decreaseLabel,
  disabled,
  id,
  increaseLabel,
  label,
  max,
  min,
  onChange,
  value
}: {
  readonly decreaseLabel: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly increaseLabel: string;
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly onChange: (roundCount: number) => void;
  readonly value: number;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const progress = (value - min) / (max - min);
  const thumb = getRoundArcPoint(progress);
  const minusPoint = getWheelPoint(206, 210);
  const plusPoint = getWheelPoint(334, 210);
  const labelPoint = getWheelPoint(220, 185);
  const valuePoint = getWheelPoint(270, 188);

  const setClampedValue = (nextValue: number) => {
    onChange(clampRoundCount(nextValue, min, max));
  };

  const setValueFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / rect.width) * 500;
    const localY = ((event.clientY - rect.top) / rect.height) * 500;
    const angle = normalizeDegrees(
      (Math.atan2(localY - wheelCenter, localX - wheelCenter) * 180) / Math.PI
    );
    const clampedAngle = Math.min(roundArcEndAngle, Math.max(roundArcStartAngle, angle));
    const nextProgress =
      (clampedAngle - roundArcStartAngle) / (roundArcEndAngle - roundArcStartAngle);
    setClampedValue(min + nextProgress * (max - min));
  };

  return (
    <div className="roundArcSelector">
      <span
        className="roundArcLabel"
        style={{
          left: formatWheelPercent(labelPoint.x),
          top: formatWheelPercent(labelPoint.y)
        } as CSSProperties}
      >
        {label}
      </span>
      <output
        className="roundArcValue"
        htmlFor={id}
        style={{
          left: formatWheelPercent(valuePoint.x),
          top: formatWheelPercent(valuePoint.y)
        } as CSSProperties}
      >
        {value}
      </output>
      <button
        className="roundArcStep minus"
        style={{
          left: formatWheelPercent(minusPoint.x),
          top: formatWheelPercent(minusPoint.y)
        } as CSSProperties}
        type="button"
        disabled={disabled || value <= min}
        aria-label={decreaseLabel}
        onClick={() => setClampedValue(value - 1)}
      >
        -
      </button>
      <svg
        id={id}
        className="roundArcSvg"
        viewBox="0 0 500 500"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={(event) => {
          setIsDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
          setValueFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (isDragging) setValueFromPointer(event);
        }}
        onPointerUp={() => setIsDragging(false)}
        onPointerCancel={() => setIsDragging(false)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            setClampedValue(value - 1);
          }
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            setClampedValue(value + 1);
          }
        }}
      >
        <path className="roundArcTrack" d={roundArcPath} pathLength={100} />
        {progress > 0 ? (
          <path
            className="roundArcActive"
            d={roundArcPath}
            pathLength={100}
            strokeDasharray={`${formatNumber(progress * 100)} 100`}
          />
        ) : null}
        <circle
          className="roundArcThumbHalo"
          cx={formatNumber(thumb.x)}
          cy={formatNumber(thumb.y)}
          r="16"
        />
        <circle
          className="roundArcThumb"
          cx={formatNumber(thumb.x)}
          cy={formatNumber(thumb.y)}
          r="10"
        />
      </svg>
      <button
        className="roundArcStep plus"
        style={{
          left: formatWheelPercent(plusPoint.x),
          top: formatWheelPercent(plusPoint.y)
        } as CSSProperties}
        type="button"
        disabled={disabled || value >= max}
        aria-label={increaseLabel}
        onClick={() => setClampedValue(value + 1)}
      >
        +
      </button>
    </div>
  );
}

function clampRoundCount(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function getRoundArcPoint(progress: number): { x: number; y: number } {
  return getWheelPoint(
    roundArcStartAngle + progress * (roundArcEndAngle - roundArcStartAngle),
    roundArcRadius
  );
}

function getWheelPoint(angleDegrees: number, radius: number): { x: number; y: number } {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: wheelCenter + radius * Math.cos(radians),
    y: wheelCenter + radius * Math.sin(radians)
  };
}

function describeArc(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = getWheelPoint(startAngle, radius);
  const end = getWheelPoint(endAngle, radius);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;
}

function formatWheelPercent(value: number): string {
  return `${formatNumber(value / 5)}%`;
}

function formatNumber(value: number): string {
  return value.toFixed(4);
}

function normalizeDegrees(degrees: number): number {
  return (degrees + 360) % 360;
}
