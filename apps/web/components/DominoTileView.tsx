"use client";

import { isAce, isTrump } from "@domino-poker/core";
import type { DominoTile } from "@domino-poker/core";
import type { CSSProperties } from "react";

export function DominoTileView({
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

export function HiddenTile({
  orientation,
  style
}: {
  readonly orientation: "horizontal" | "vertical";
  readonly style: CSSProperties;
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
