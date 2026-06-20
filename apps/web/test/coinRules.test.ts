import { describe, expect, it } from "vitest";

import { en } from "../lib/locales/en";
import { lv } from "../lib/locales/lv";
import { getMpRulesDoc } from "../lib/mpRulesContent";

/** Saplacina MP noteikumu dokumentu vienā teksta virknē (sekciju + bloku meklēšanai). */
function flattenMpRules(localeCode: string): string {
  const doc = getMpRulesDoc(localeCode);
  const parts: string[] = [...doc.intro];
  for (const section of doc.sections) {
    parts.push(section.title);
    for (const block of section.blocks) {
      if (typeof block === "string") parts.push(block);
      else parts.push(...block.list);
    }
  }
  return parts.join("\n");
}

describe("i18n parity (Phase 5)", () => {
  it("en and lv have an identical set of keys", () => {
    expect(Object.keys(lv).sort()).toEqual(Object.keys(en).sort());
  });

  it("every value is a non-empty string in both locales", () => {
    for (const locale of [en, lv]) {
      for (const [key, value] of Object.entries(locale)) {
        expect(typeof value, key).toBe("string");
        expect((value as string).trim().length, key).toBeGreaterThan(0);
      }
    }
  });
});

describe("Gold-coin rules content (Phase 5)", () => {
  it("the main rules carry the gold-coin keys with the 5000 bonus + SP rewards", () => {
    for (const locale of [en, lv]) {
      expect(locale.rulesCoinsTitle.trim().length).toBeGreaterThan(0);
      expect(locale.rulesCoinsIntro).toContain("5000");
      // SP balvas pa grūtībai: 50 / 100 / 300.
      for (const amount of ["50", "100", "300"]) {
        expect(locale.rulesCoinsSpBody).toContain(amount);
      }
    }
  });

  it("the MP rules include a gold-coin section in both locales (entry fee, refund, 70/30 pot)", () => {
    for (const code of ["en", "lv"]) {
      const doc = getMpRulesDoc(code);
      const hasCoinSection = doc.sections.some((s) => /gold|zelta/i.test(s.title));
      expect(hasCoinSection, code).toBe(true);
      const text = flattenMpRules(code);
      // MP-specifiskie akcenti: pods 70/30 starp top-2 reģistrētajiem.
      expect(text).toContain("70%");
      expect(text).toContain("30%");
    }
  });

  it("falls back to en for an unknown locale", () => {
    expect(getMpRulesDoc("xx")).toBe(getMpRulesDoc("en"));
  });
});
