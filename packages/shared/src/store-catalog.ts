/**
 * Veikala katalogs — VIENĪGAIS autoritatīvais pērkamo preču + cenu avots. Importē GAN
 * serveris (validē itemId + cenu pirkumā), GAN web (rāda cenu/slēdzeni). Nedublēt cenas.
 *
 * Īpašumtiesības tiek ATVASINĀTAS no `coin_ledger` (reason atkarīgs no preces veida:
 * tēmām `theme_purchase`, botiem `bot_purchase`; ref = itemId) ar `UNIQUE(user_id, reason,
 * ref)` → katra prece pieder reizi, pirkums = viena atomiska ledger rinda (debets UN
 * "grants" vienlaikus). Nav atsevišķas inventāra tabulas.
 */

import { BOT_ASSISTANT_PRICE, THEME_PRICE } from "./economy.js";

export type StoreItemKind = "theme" | "bot_assistant";

export interface StoreItem {
  /** Stabils kataloga id (= ledger `ref`). Tēmām: `theme.<slug>`. */
  readonly id: string;
  readonly kind: StoreItemKind;
  /** Cena monētās (veseli skaitļi). */
  readonly price: number;
}

/** Pērkamo tēmu slugi — atbilst web `ThemeId` ne-bezmaksas tēmām (Default ir bezmaksas, nav šeit). */
export const THEME_SLUGS = [
  "twilight",
  "rain",
  "pop-out",
  "confetti",
  "bubbles",
  "luminous"
] as const;

export type ThemeSlug = (typeof THEME_SLUGS)[number];

/** Tēmas kataloga `itemId` no sluga (= ledger `ref`). */
export function themeItemId(slug: ThemeSlug): string {
  return `theme.${slug}`;
}

/**
 * "supportHuman" bota palīga stabilais kataloga id (= ledger `ref`). VIENĪGAIS avots šai
 * virknei — importē GAN klients (ownership pārbaude), GAN serveris. Nelietot literāli citur.
 */
export const SUPPORT_HUMAN_ITEM_ID = "bot.supportHuman";

export const STORE_CATALOG: readonly StoreItem[] = [
  ...THEME_SLUGS.map((slug) => ({
    id: themeItemId(slug),
    kind: "theme" as const,
    price: THEME_PRICE
  })),
  { id: SUPPORT_HUMAN_ITEM_ID, kind: "bot_assistant" as const, price: BOT_ASSISTANT_PRICE }
];

/** Kataloga prece pēc id, vai `undefined`, ja nezināma (serveris noraida pirkumu ar 400). */
export function getStoreItem(id: string): StoreItem | undefined {
  return STORE_CATALOG.find((item) => item.id === id);
}

/** Vai lietotājam (piederošo itemId saraksts no `/store/owned`) pieder supportHuman bots. */
export function ownsSupportHuman(ownedItemIds: readonly string[]): boolean {
  return ownedItemIds.includes(SUPPORT_HUMAN_ITEM_ID);
}
