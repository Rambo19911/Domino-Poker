"use client";

import { useEffect, useState } from "react";

/**
 * Desktop (ainavas) MP galda fiksētā skatuve. Atbilstošs sieksts `lib/mobileStage.ts`
 * telefona-portrēta ceļam: 1920×1080 px kaste, mērogota vienmērīgi ar `transform:
 * scale` (`contain`). Pārkopēts no SP `DominoPokerGame.tsx`, lai MP galds izmantotu
 * to pašu skatuvi; SP fails paliek neskarts.
 */

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

export type StageContainLayout = { readonly scale: number; readonly left: number; readonly top: number };

export function useStageContainLayout(): StageContainLayout {
  const [layout, setLayout] = useState<StageContainLayout>(() => getStageContainLayout());
  useEffect(() => {
    const update = () => setLayout(getStageContainLayout());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    // visualViewport `resize` noķer iOS Safari joslas sabrukumu (mainās augstums);
    // NEklausāmies `scroll`, kas uzbāztos nepārtraukti un radītu jank (sk. m5).
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return layout;
}

function getStageContainLayout(): StageContainLayout {
  if (typeof window === "undefined") return { scale: 1, left: 0, top: 0 };
  // visualViewport seko iOS Safari joslu rādīšanai/slēpšanai, tāpēc skatuve
  // neielien zem pārlūka joslas mobilajā ainavā; fallback uz innerWidth/Height.
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const scale = Math.min(vw / CANVAS_WIDTH, vh / CANVAS_HEIGHT);
  return {
    scale,
    left: (vw - CANVAS_WIDTH * scale) / 2,
    top: (vh - CANVAS_HEIGHT * scale) / 2
  };
}
