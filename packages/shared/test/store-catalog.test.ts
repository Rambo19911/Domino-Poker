import { describe, expect, it } from "vitest";

import { THEME_PRICE } from "../src/economy.js";
import {
  getStoreItem,
  STORE_CATALOG,
  THEME_SLUGS,
  themeItemId
} from "../src/store-catalog.js";

describe("store-catalog", () => {
  it("registers all 6 purchasable themes priced at THEME_PRICE", () => {
    expect(STORE_CATALOG).toHaveLength(THEME_SLUGS.length);
    expect(STORE_CATALOG).toHaveLength(6);
    for (const item of STORE_CATALOG) {
      expect(item.kind).toBe("theme");
      expect(item.price).toBe(THEME_PRICE);
      expect(item.id).toMatch(/^theme\./);
    }
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
