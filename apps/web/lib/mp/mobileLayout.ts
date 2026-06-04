import type { CSSProperties } from "react";

import type { VisualSeat } from "./gameTableView";

/**
 * MP portrēta (telefonu) izkārtojuma ģeometrija — vienīgais avots, atvasināts no
 * `docs/mockups/mp-layout-spec.json` (lietotāja Photoshop zīmējums, 1080×1920).
 *
 * Pozīcijas glabā kā elementa CENTRU daļās (0..1) no skatuves → pozicionē ar
 * `left/top: %` + `translate(-50%,-50%)`, tāpēc izkārtojums seko zīmējumam
 * proporcionāli jebkurā telefona izšķirtspējā.
 *
 * Izmēri profiliem/nozīmītēm/galdam ir `vw` (mērogojas ar platumu). Domino
 * kauliņiem izmēru dod fiksēta `transform: scale` (skat. CSS `.mpmTile`), jo
 * `DominoTileView` punkti ir px — vienmērīga mērogošana saglabā ģeometriju.
 */

export type Pt = { readonly cx: number; readonly cy: number };

/** Elementu izmēri kā daļa no skatuves platuma (→ vw), un malu attiecības. */
export const MP_MOBILE_SIZE = {
  profileVw: 20.19,
  badgeVw: 9.35,
  tableVw: 44.72,
  tableAspect: 467 / 483,
  leaveVw: 10.19,
  leaveAspect: 58 / 110,
  summaryVw: 59.07
} as const;

/** Centra pozīcijas (daļas no skatuves W×H). Sēdvietas pēc vizuālās vietas 0..3. */
export const MP_MOBILE_POS = {
  table: { cx: 0.5005, cy: 0.4945 },
  trumpLabel: { cx: 0.5, cy: 0.378 },
  summary: { cx: 0.5037, cy: 0.1253 },
  leave: { cx: 0.9222, cy: 0.0318 },
  trick: {
    N: { cx: 0.5, cy: 0.4362 },
    S: { cx: 0.5, cy: 0.5544 },
    W: { cx: 0.3611, cy: 0.4935 },
    E: { cx: 0.6333, cy: 0.4914 }
  },
  hand: [
    { cx: 0.4444, cy: 0.6935 },
    { cx: 0.5657, cy: 0.6935 },
    { cx: 0.2639, cy: 0.8086 },
    { cx: 0.3815, cy: 0.8086 },
    { cx: 0.5, cy: 0.8091 },
    { cx: 0.6194, cy: 0.8091 },
    { cx: 0.7389, cy: 0.8091 }
  ],
  seats: {
    0: { profile: { cx: 0.5, cy: 0.9273 }, points: { cx: 0.644, cy: 0.8961 }, bidWon: { cx: 0.3523, cy: 0.8966 }, countdown: { cx: 0.644, cy: 0.9591 }, tileCount: null },
    1: { profile: { cx: 0.1009, cy: 0.4997 }, points: { cx: 0.0468, cy: 0.5826 }, bidWon: { cx: 0.0468, cy: 0.4185 }, countdown: { cx: 0.1579, cy: 0.5826 }, tileCount: { cx: 0.1597, cy: 0.419 } },
    2: { profile: { cx: 0.5, cy: 0.2544 }, points: { cx: 0.6477, cy: 0.2242 }, bidWon: { cx: 0.3523, cy: 0.2227 }, countdown: { cx: 0.6477, cy: 0.2846 }, tileCount: { cx: 0.3523, cy: 0.2846 } },
    3: { profile: { cx: 0.8991, cy: 0.4997 }, points: { cx: 0.9477, cy: 0.5815 }, bidWon: { cx: 0.9532, cy: 0.418 }, countdown: { cx: 0.8458, cy: 0.5826 }, tileCount: { cx: 0.8458, cy: 0.419 } }
  }
} as const;

/** Stiķa slots pēc tā spēlētāja vizuālās vietas, kurš veica gājienu. */
export const TRICK_SLOT_BY_VISUAL_SEAT: Record<VisualSeat, keyof typeof MP_MOBILE_POS.trick> = {
  0: "S",
  1: "W",
  2: "N",
  3: "E"
};

/** Pozicionē pēc centra punkta (izmēru dod CSS). */
export function centerPoint(pt: Pt): CSSProperties {
  return { left: `${pt.cx * 100}%`, top: `${pt.cy * 100}%`, transform: "translate(-50%, -50%)" };
}

/** Pozicionē pēc centra + dod izmēru `vw` (aspect = h/w). */
export function centerBox(pt: Pt, widthVw: number, aspect: number): CSSProperties {
  return {
    left: `${pt.cx * 100}%`,
    top: `${pt.cy * 100}%`,
    width: `${widthVw}vw`,
    height: `${widthVw * aspect}vw`,
    transform: "translate(-50%, -50%)"
  };
}
