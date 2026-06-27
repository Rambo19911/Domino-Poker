// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  applyTheme,
  DEFAULT_THEME,
  getThemeBootstrapScript,
  isThemeId,
  isThemeUnlocked,
  reconcileStoredTheme,
  startMotionFpsProbe,
  THEME_STORAGE_KEY,
  THEMES
} from "../lib/theme";

afterEach(() => {
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.themeMotion;
  localStorage.clear();
  vi.unstubAllGlobals();
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
    document.documentElement.dataset.theme = "twilight";
    applyTheme(DEFAULT_THEME);
    expect(document.documentElement.dataset.theme).toBeUndefined(); // noklusējums = :root

    // Reāla ne-noklusējuma tēma uzstāda atribūtu.
    applyTheme("twilight");
    expect(document.documentElement.dataset.theme).toBe("twilight");
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

  // Fāze 5.5 — pre-paint veiktspējas heiristika bootstrapā.
  it("bootstrap script includes the pre-paint motion heuristic (reduced-motion / weak device)", () => {
    const script = getThemeBootstrapScript();
    expect(script).toContain("prefers-reduced-motion");
    expect(script).toContain("deviceMemory");
    expect(script).toContain("hardwareConcurrency");
    expect(script).toContain("themeMotion");
  });

  it("startMotionFpsProbe is a no-op when no animated theme is active", () => {
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themeMotion;
    startMotionFpsProbe();
    expect(document.documentElement.dataset.themeMotion).toBeUndefined();
  });

  it("startMotionFpsProbe is a no-op when motion is already static", () => {
    document.documentElement.dataset.theme = "twilight";
    document.documentElement.dataset.themeMotion = "static";
    startMotionFpsProbe();
    expect(document.documentElement.dataset.themeMotion).toBe("static");
  });

  it("startMotionFpsProbe switches to static when the measured FPS is below threshold", () => {
    document.documentElement.dataset.theme = "twilight";
    delete document.documentElement.dataset.themeMotion;
    // Sinhrons rAF: 1. kadrs t=0, 2. kadrs t=2000 (elapsed ≥ 1500ms, 2 kadri → fps ≈ 1 < 40).
    const times = [0, 2000];
    let i = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
      const t = times[Math.min(i, times.length - 1)] ?? 0;
      i += 1; // avansē PIRMS cb (citādi tick→rAF→cb ar to pašu t = bezgalīga rekursija)
      cb(t);
      return i;
    });
    startMotionFpsProbe();
    expect(document.documentElement.dataset.themeMotion).toBe("static");
  });

  it("startMotionFpsProbe keeps animation when the measured FPS is healthy", () => {
    document.documentElement.dataset.theme = "twilight";
    delete document.documentElement.dataset.themeMotion;
    // ~60 FPS: 91 kadri 1500ms laikā → fps ≥ 40 → paliek animēts (nav static).
    const total = 1500;
    const frames = 90;
    let i = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
      const t = Math.min((i / frames) * total, total);
      i += 1;
      cb(t);
      return i;
    });
    startMotionFpsProbe();
    expect(document.documentElement.dataset.themeMotion).toBeUndefined();
  });

  it("registers the 6 purchasable themes alongside default", () => {
    const ids = THEMES.map((theme) => theme.id);
    for (const slug of ["twilight", "rain", "pop-out", "confetti", "bubbles", "luminous"]) {
      expect(ids).toContain(slug);
      expect(isThemeId(slug)).toBe(true);
    }
    expect(THEMES).toHaveLength(7);
  });

  it("default uses a localized labelKey + is free; paid themes use an EN name + itemId", () => {
    for (const theme of THEMES) {
      if (theme.id === DEFAULT_THEME) {
        expect(theme.labelKey).toBeTruthy();
        expect(theme.name).toBeUndefined();
        expect(theme.free).toBe(true);
        expect(theme.itemId).toBeUndefined();
      } else {
        expect(theme.name).toBeTruthy(); // EN literālis, netulkots
        expect(theme.labelKey).toBeUndefined();
        expect(theme.free).toBe(false);
        expect(theme.itemId).toBe(`theme.${theme.id}`); // saite uz veikala katalogu
      }
    }
  });

  // Fāze 5 — atbloķēšana pēc īpašumtiesībām (bezmaksas Default vai nopirkts itemId).
  it("isThemeUnlocked: free Default is always unlocked; paid themes need their itemId owned", () => {
    const def = THEMES.find((theme) => theme.id === DEFAULT_THEME);
    const bubbles = THEMES.find((theme) => theme.id === "bubbles");
    expect(def && isThemeUnlocked(def, [])).toBe(true); // bezmaksas → vienmēr atbloķēts
    expect(bubbles && isThemeUnlocked(bubbles, [])).toBe(false); // nepieder → bloķēts
    expect(bubbles && isThemeUnlocked(bubbles, ["theme.bubbles"])).toBe(true); // nopirkts
    expect(bubbles && isThemeUnlocked(bubbles, ["theme.rain"])).toBe(false); // cita prece
  });

  // §5.1 konsekvence: katram pērkamajam slug ↔ 4 SVG faili ↔ 4 [data-theme] CSS bloki.
  // (Katalogs/posteri nāk vēlākās fāzēs; šī daļa jau noķer typo/izlaistu asset/CSS bloku.)
  it("each paid theme has 4 screen SVGs and 4 [data-theme] CSS blocks", () => {
    const screens = ["lobby", "mp-lobby", "sp-room", "mp-room"] as const;
    const selectors = [".lobbyShell", ".mpLobby", ".gameShell.spRoomBg", ".gameShell.mpRoomBg"];
    // vitest cwd = apps/web (workspace sakne) → ceļi relatīvi pret to.
    const tokensCss = readFileSync(join(process.cwd(), "styles/tokens.css"), "utf8");
    const paidSlugs = THEMES.filter((theme) => theme.id !== DEFAULT_THEME).map((theme) => theme.id);

    for (const slug of paidSlugs) {
      for (const screen of screens) {
        const svg = join(process.cwd(), `public/assets/backgrounds/themes/${slug}/${screen}.svg`);
        expect(existsSync(svg), `${slug}/${screen}.svg trūkst`).toBe(true);
        // Fāze 5.5 — statiskais poster-kadrs katram (tēma × ekrāns).
        const poster = join(process.cwd(), `public/assets/backgrounds/themes/${slug}/poster/${screen}.jpg`);
        expect(existsSync(poster), `${slug}/poster/${screen}.jpg trūkst`).toBe(true);
      }
      for (const selector of selectors) {
        expect(
          tokensCss.includes(`[data-theme="${slug}"] ${selector}`),
          `tokens.css trūkst bloks [data-theme="${slug}"] ${selector}`
        ).toBe(true);
      }
      // Fāze 5.5 — poster-override CSS bloks ir.
      expect(
        tokensCss.includes(`[data-theme="${slug}"][data-theme-motion="static"]`),
        `tokens.css trūkst poster-override [data-theme="${slug}"][data-theme-motion="static"]`
      ).toBe(true);
    }
  });

  // P2 — account-bound saskaņošana: glabātā maksas tēma bez īpašumtiesībām → Default.
  it("reconcileStoredTheme resets an unowned paid theme to Default and clears storage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "bubbles");
    document.documentElement.dataset.theme = "bubbles";

    const effective = reconcileStoredTheme([]); // anon / nekas nepieder

    expect(effective).toBe(DEFAULT_THEME);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull(); // atslēga notīrīta
    expect(document.documentElement.dataset.theme).toBeUndefined(); // atribūts noņemts
  });

  it("reconcileStoredTheme keeps a paid theme that the user owns", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "bubbles");
    document.documentElement.dataset.theme = "bubbles";

    const effective = reconcileStoredTheme(["theme.bubbles"]); // pieder

    expect(effective).toBe("bubbles");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("bubbles");
    expect(document.documentElement.dataset.theme).toBe("bubbles");
  });

  it("reconcileStoredTheme falls back to Default for junk/empty storage", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "not-a-theme");
    expect(reconcileStoredTheme([])).toBe(DEFAULT_THEME);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  // §5.2 cache-busting: katram fona asset URL ir versēts `?v=N` (citādi klienti tur
  // veco fonu pēc deploy). Sargā pret jaunu asset pievienošanu bez versēšanas.
  it("every background asset url is cache-busted with ?v=", () => {
    const tokensCss = readFileSync(join(process.cwd(), "styles/tokens.css"), "utf8");
    const urls = tokensCss.match(/url\("\/assets\/backgrounds\/[^"]+"\)/g) ?? [];
    expect(urls.length, "tokens.css jābūt fona asset URL").toBeGreaterThan(0);
    const unversioned = urls.filter((u) => !u.includes("?v="));
    expect(unversioned, `nederēti (bez ?v=) fona asset URL: ${unversioned.join(", ")}`).toEqual([]);
  });
});
