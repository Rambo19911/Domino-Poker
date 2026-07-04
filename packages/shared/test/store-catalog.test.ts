import { describe, expect, it } from "vitest";

import { BOT_ASSISTANT_PRICE, THEME_PRICE } from "../src/economy.js";
import {
  getStoreItem,
  STORE_CATALOG,
  SUPPORT_HUMAN_ITEM_ID,
  THEME_SLUGS,
  themeItemId
} from "../src/store-catalog.js";

describe("store-catalog", () => {
  it("registers all 6 purchasable themes priced at THEME_PRICE", () => {
    // Filtrē pēc veida (katalogā ir arī citi preču tipi, piem. bot_assistant), nevis
    // pieņem, ka viss katalogs ir tēmas.
    const themes = STORE_CATALOG.filter((item) => item.kind === "theme");
    expect(themes).toHaveLength(THEME_SLUGS.length);
    expect(themes).toHaveLength(6);
    for (const item of themes) {
      expect(item.price).toBe(THEME_PRICE);
      expect(item.id).toMatch(/^theme\./);
    }
  });

  it("registers the supportHuman bot assistant priced at BOT_ASSISTANT_PRICE", () => {
    const bots = STORE_CATALOG.filter((item) => item.kind === "bot_assistant");
    expect(bots).toHaveLength(1);
    expect(bots[0]?.id).toBe(SUPPORT_HUMAN_ITEM_ID);
    expect(bots[0]?.price).toBe(BOT_ASSISTANT_PRICE);
    expect(getStoreItem(SUPPORT_HUMAN_ITEM_ID)?.kind).toBe("bot_assistant");
  });

  it("themeItemId maps a slug to its catalog id and getStoreItem round-trips", () => {
    for (const slug of THEME_SLUGS) {
      const id = themeItemId(slug);
      expect(id).toBe(`theme.${slug}`);
      expect(getStoreItem(id)?.id).toBe(id);
    }
  });

  it("getStoreItem returns undefined for unknown ids (server rejects with 400)", () => {
    expect(getStoreItem("theme.nope")).toBeUndefined();
    expect(getStoreItem("")).toBeUndefined();
    expect(getStoreItem("anything")).toBeUndefined();
  });
});
