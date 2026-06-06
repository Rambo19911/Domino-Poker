"use client";

import { useEffect, useState } from "react";

/**
 * Koplietoti telefona-portrēta izkārtojuma āķi (MP galds + SP galds).
 *
 * Mobilā dizaina skatuve ir fiksēta 1080×2340 px (9:16) kaste, ko mērogo vienmērīgi
 * ar `transform: scale` (`contain`), tāpat kā desktop 1920×1080. Ģeometrija dzīvo
 * `lib/mp/mobileLayout.ts`; šie āķi nodrošina pārslēgšanu un mērogošanu.
 */

export const MOBILE_CANVAS_WIDTH = 1080;
export const MOBILE_CANVAS_HEIGHT = 2340;

/** Telefona portrēts → mobilais izkārtojums; citur (ainava/desktop) → fiksētā skatuve. */
const PHONE_PORTRAIT_QUERY = "(orientation: portrait) and (max-width: 768px)";

export function useIsPhonePortrait(): boolean {
  const [isPhonePortrait, setIsPhonePortrait] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(PHONE_PORTRAIT_QUERY);
    const update = () => setIsPhonePortrait(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isPhonePortrait;
}

export type MobileStageLayout = { readonly scale: number; readonly left: number; readonly top: number };

function getMobileStageLayout(): MobileStageLayout {
  if (typeof window === "undefined") return { scale: 0, left: 0, top: 0 };
  // visualViewport seko iOS Safari joslu rādīšanai/slēpšanai (innerHeight ne vienmēr).
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const scale = Math.min(vw / MOBILE_CANVAS_WIDTH, vh / MOBILE_CANVAS_HEIGHT);
  return {
    scale,
    left: (vw - MOBILE_CANVAS_WIDTH * scale) / 2,
    top: (vh - MOBILE_CANVAS_HEIGHT * scale) / 2
  };
}

/**
 * Mērogo 1080×2340 skatuvi `contain`. Vienmērīga mērogošana → izkārtojums nekad
 * nepārklājas, lai kāda būtu telefona malu attiecība; uz citas attiecības paliek
 * tikai tukšas malas (letterbox).
 */
export function useMobileStageLayout(): MobileStageLayout {
  const [layout, setLayout] = useState<MobileStageLayout>(() => getMobileStageLayout());
  useEffect(() => {
    const update = () => setLayout(getMobileStageLayout());
    update();
    // Tikai izmēra izmaiņas pārrēķina skatuvi. NEklausāmies `visualViewport` `scroll`
    // — iOS Safari to uzbāž nepārtraukti URL-joslas/klaviatūras pārejās, kas izraisītu
    // re-render/letterbox jank; augstuma izmaiņas jau sedz `visualViewport` `resize`.
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return layout;
}
