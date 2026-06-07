import type { TitleId } from "@domino-poker/shared";

import type { AppStrings } from "../i18n";

/** TitleId → lokalizētā i18n atslēga (nosaukumi dzīvo `locales/*`, nav hardcoded). */
const TITLE_KEYS: Record<TitleId, keyof AppStrings> = {
  mushroom: "titleMushroom",
  student: "titleStudent",
  amateur: "titleAmateur",
  strategist: "titleStrategist",
  champion: "titleChampion",
  king: "titleKing",
  universeGod: "titleUniverseGod"
};

/** Lokalizētais titula nosaukums. */
export function titleLabel(labels: AppStrings, id: TitleId): string {
  return labels[TITLE_KEYS[id]];
}
