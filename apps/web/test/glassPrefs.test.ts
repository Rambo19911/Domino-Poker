// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyDarkGlass,
  applyGlass,
  DARK_GLASS_STORAGE_KEY,
  getGlassBootstrapScript,
  GLASS_STORAGE_KEY,
  readDarkGlassEnabled,
  readGlassEnabled,
  setDarkGlassEnabled,
  setGlassEnabled
} from "../lib/glassPrefs";

afterEach(() => {
  delete document.documentElement.dataset.glass;
  delete document.documentElement.dataset.darkGlass;
  localStorage.clear();
});

describe("glassPrefs module", () => {
  it("both toggles default to OFF when nothing is stored", () => {
    expect(readGlassEnabled()).toBe(false);
    expect(readDarkGlassEnabled()).toBe(false);
  });

  it("only the ON state is persisted; OFF clears the key (default = off)", () => {
    setGlassEnabled(true);
    setDarkGlassEnabled(true);
    expect(localStorage.getItem(GLASS_STORAGE_KEY)).toBe("on");
    expect(localStorage.getItem(DARK_GLASS_STORAGE_KEY)).toBe("on");

    setGlassEnabled(false);
    setDarkGlassEnabled(false);
    expect(localStorage.getItem(GLASS_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(DARK_GLASS_STORAGE_KEY)).toBeNull();
  });

  it("applyGlass/applyDarkGlass toggle the <html> attributes (absent = OFF, 'on' = ON)", () => {
    applyGlass(true);
    applyDarkGlass(true);
    expect(document.documentElement.dataset.glass).toBe("on");
    expect(document.documentElement.dataset.darkGlass).toBe("on");

    applyGlass(false);
    applyDarkGlass(false);
    expect(document.documentElement.dataset.glass).toBeUndefined();
    expect(document.documentElement.dataset.darkGlass).toBeUndefined();
  });

  it("set* persists AND applies in one call", () => {
    setGlassEnabled(true);
    expect(document.documentElement.dataset.glass).toBe("on");
    expect(readGlassEnabled()).toBe(true);

    setDarkGlassEnabled(true);
    expect(document.documentElement.dataset.darkGlass).toBe("on");
    expect(readDarkGlassEnabled()).toBe(true);
  });

  it("bootstrap script references both storage keys and is wrapped in try/catch", () => {
    const script = getGlassBootstrapScript();
    expect(script).toContain(JSON.stringify(GLASS_STORAGE_KEY));
    expect(script).toContain(JSON.stringify(DARK_GLASS_STORAGE_KEY));
    expect(script).toContain("dataset.glass"); // uzstāda data-glass pirms krāsošanas
    expect(script).toContain("dataset.darkGlass"); // uzstāda data-dark-glass
    expect(script).toContain("==='on'"); // tikai glabātais "on" ieslēdz
    expect(script).toContain("try");
    expect(script).toContain("catch");
  });

  // Wiring-sargs: CSS jāreaģē uz tieši tiem atribūtiem, ko modulis uzstāda (citādi
  // pārslēdzēji būtu klusi bezjēdzīgi). vitest cwd = apps/web.
  it("glass.css gates blur on data-glass=on and tokens.css adds the strong tint on data-dark-glass=on", () => {
    const glassCss = readFileSync(join(process.cwd(), "styles/glass.css"), "utf8");
    const tokensCss = readFileSync(join(process.cwd(), "styles/tokens.css"), "utf8");
    // Blur ir aiz `:root[data-glass="on"]` → noklusējumā (OFF) bez blur, caurspīdīgums paliek.
    expect(glassCss).toContain(':root[data-glass="on"]');
    expect(glassCss).toContain("backdrop-filter");
    // Noklusējums (bāze) = bez toņa; `[data-dark-glass="on"]` pievieno izteikto tumšo toni.
    expect(tokensCss).toContain("--glass-bg: rgb(var(--overlay-rgb) / 0)");
    expect(tokensCss).toContain(':root[data-dark-glass="on"]');
    expect(tokensCss).toContain("--glass-bg: rgb(var(--overlay-rgb) / 0.66)");
  });
});
