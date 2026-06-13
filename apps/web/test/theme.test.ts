// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import {
  applyTheme,
  DEFAULT_THEME,
  getThemeBootstrapScript,
  isThemeId,
  THEME_STORAGE_KEY,
  THEMES,
  type ThemeId
} from "../lib/theme";

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe("theme module", () => {
  it("registers the default theme and accepts only known ids", () => {
    expect(THEMES.some((theme) => theme.id === DEFAULT_THEME)).toBe(true);
    expect(isThemeId("default")).toBe(true);
    expect(isThemeId("midnight")).toBe(false); // vēl nereģistrēta
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId("")).toBe(false);
  });

  it("applyTheme removes the attribute for the default theme and sets it otherwise", () => {
    document.documentElement.dataset.theme = "midnight";
    applyTheme(DEFAULT_THEME);
    expect(document.documentElement.dataset.theme).toBeUndefined(); // noklusējums = :root

    // Nākotnes (ne-noklusējuma) tēma uzstāda atribūtu (mehānisma pārbaude).
    applyTheme("midnight" as ThemeId);
    expect(document.documentElement.dataset.theme).toBe("midnight");
  });

  it("bootstrap script references the storage key, default, and valid ids (single source)", () => {
    const script = getThemeBootstrapScript();
    expect(script).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(script).toContain(JSON.stringify(DEFAULT_THEME));
    expect(script).toContain(JSON.stringify(THEMES.map((theme) => theme.id)));
    // Apvilkts try/catch (inline skripts nedrīkst mest, ja localStorage bloķēts).
    expect(script).toContain("try");
    expect(script).toContain("catch");
  });
});
