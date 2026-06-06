import type { CSSProperties } from "react";

import type { VisualSeat } from "./gameTableView";

/**
 * MP portrēta (telefonu) izkārtojuma ģeometrija — vienīgais avots, atvasināts no
 * `docs/mockups/mp-layout-spec.json` (lietotāja Photoshop zīmējums, 1080×2340).
 *
 * Skatuve ir fiksēta **1080×2340 px** kaste, ko `MpMobileTable` mērogo vienmērīgi
 * ar `transform: scale` (kā desktop 1920×1080) → viss (pozīcijas UN izmēri) dzīvo
 * vienā px telpā, tāpēc nekas nevar pārklāties neatkarīgi no telefona malu
 * attiecības (atšķirībā no agrākās % pozīciju + `vw` izmēru pieejas).
 *
 * Pozīcijas glabā kā elementa CENTRU daļās (0..1) no skatuves → pozicionē ar
 * `left/top: %` + `translate(-50%,-50%)`. % no 1080×2340 kastes = precīzas spec px.
 *
 * Izmēri profiliem/nozīmītēm/galdam ir **px šajā 1080×2340 telpā** (no spec). Domino
 * kauliņiem izmēru dod fiksēta `transform: scale` (skat. CSS `.mpmTile`).
 */

export type Pt = { readonly cx: number; readonly cy: number };

/** Elementu izmēri px 1080×2340 skatuves telpā (no spec), un malu attiecības. */
export const MP_MOBILE_SIZE = {
  profilePx: 255,
  badgePx: 101,
  tablePx: 490,
  tableAspect: 490 / 490, // galds = ideāls aplis (renderēts ar border-radius:50%)
  leavePx: 114,
  leaveAspect: 60 / 114,
  summaryPx: 720
} as const;

/** Centra pozīcijas (daļas no skatuves W×H). Sēdvietas pēc vizuālās vietas 0..3. */
export const MP_MOBILE_POS = {
  table: { cx: 0.4991, cy: 0.5 },
  // Nav PSD elements — novietots tieši VIRS galda augšmalas (galds: top ≈ 0.3953),
  // lai uzraksts nepārklājas pāri galdam. ~26px atstarpe līdz galdam.
  trumpLabel: { cx: 0.5, cy: 0.373 },
  summary: { cx: 0.5037, cy: 0.0823 },
  // Atlikušo raundu skaitlis — kreisajā ailē, vertikāli vienā līmenī ar tabulu.
  roundCount: { cx: 0.083, cy: 0.0823 },
  leave: { cx: 0.9222, cy: 0.0329 },
  trick: {
    N: { cx: 0.5, cy: 0.4476 },
    S: { cx: 0.5, cy: 0.5545 },
    W: { cx: 0.3565, cy: 0.4998 },
    E: { cx: 0.6435, cy: 0.4998 }
  },
  // Lasīšanas secībā: 2 augšā (L→R), tad 5 apakšā (L→R). Pozīcijas no spec.
  hand: [
    { cx: 0.4324, cy: 0.666 },
    { cx: 0.5741, cy: 0.666 },
    { cx: 0.2278, cy: 0.7741 },
    { cx: 0.3667, cy: 0.7741 },
    { cx: 0.5046, cy: 0.7731 },
    { cx: 0.6435, cy: 0.7733 },
    { cx: 0.7815, cy: 0.7737 }
  ],
  seats: {
    0: { profile: { cx: 0.5032, cy: 0.9002 }, points: { cx: 0.6681, cy: 0.8665 }, bidWon: { cx: 0.3347, cy: 0.8665 }, countdown: { cx: 0.6662, cy: 0.934 }, tileCount: null },
    1: { profile: { cx: 0.1181, cy: 0.4998 }, points: { cx: 0.0468, cy: 0.5759 }, bidWon: { cx: 0.0458, cy: 0.4224 }, countdown: { cx: 0.1894, cy: 0.5759 }, tileCount: { cx: 0.1894, cy: 0.4233 } },
    2: { profile: { cx: 0.4986, cy: 0.2254 }, points: { cx: 0.6662, cy: 0.1917 }, bidWon: { cx: 0.3347, cy: 0.1917 }, countdown: { cx: 0.6662, cy: 0.2592 }, tileCount: { cx: 0.3356, cy: 0.2592 } },
    3: { profile: { cx: 0.8819, cy: 0.4998 }, points: { cx: 0.9532, cy: 0.5759 }, bidWon: { cx: 0.9532, cy: 0.4224 }, countdown: { cx: 0.8097, cy: 0.5754 }, tileCount: { cx: 0.8097, cy: 0.4224 } }
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

/** Pozicionē pēc centra + dod izmēru px (1080×2340 skatuves telpā; aspect = h/w). */
export function centerBox(pt: Pt, widthPx: number, aspect: number): CSSProperties {
  return {
    left: `${pt.cx * 100}%`,
    top: `${pt.cy * 100}%`,
    width: `${widthPx}px`,
    height: `${widthPx * aspect}px`,
    transform: "translate(-50%, -50%)"
  };
}
