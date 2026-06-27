/**
 * Veikala katalogs — VIENĪGAIS autoritatīvais pērkamo preču + cenu avots. Importē GAN
 * serveris (validē itemId + cenu pirkumā), GAN web (rāda cenu/slēdzeni). Nedublēt cenas.
 *
 * Īpašumtiesības tiek ATVASINĀTAS no `coin_ledger` (reason `theme_purchase`, ref = itemId)
 * ar `UNIQUE(user_id, reason, ref)` → katra prece pieder reizi, pirkums = viena atomiska
 * ledger rinda (debets UN "grants" vienlaikus). Nav atsevišķas inventāra tabulas.
 */

import { THEME_PRICE } from "./economy.js";

export type StoreItemKind = "theme";

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

export const STORE_CATALOG: readonly StoreItem[] = THEME_SLUGS.map((slug) => ({
  id: themeItemId(slug),
  kind: "theme" as const,
  price: THEME_PRICE
}));

/** Kataloga prece pēc id, vai `undefined`, ja nezināma (serveris noraida pirkumu ar 400). */
export function getStoreItem(id: string): StoreItem | undefined {
  return STORE_CATALOG.find((item) => item.id === id);
}
