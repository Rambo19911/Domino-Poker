import type { AppStrings } from "../i18n";

/**
 * Cilvēks → `displayId`; bots → "AI {sēdvieta}" (numurēts, lai atšķirtu 3 botus,
 * tāpat kā SP); nezināms → atkāpšanās vārds. Kopīgs MP galda izkārtojumiem
 * (desktop `MpGameTable` un portrēta `MpMobileTable`).
 */
export function seatLabel(
  displayId: string | undefined,
  isAI: boolean,
  gameSeatIndex: number,
  t: AppStrings
): string {
  if (displayId) return displayId;
  return isAI ? `${t.mpBot} ${gameSeatIndex + 1}` : t.fallbackPlayerName;
}

export function formatTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}
