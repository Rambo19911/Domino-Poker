import { expect, type Page, test } from "@playwright/test";

/**
 * Fāze 6, solis 6 — CI veiktspējas TRIPWIRE (regresijas slazds, NE garantija).
 *
 * Avoti (themes-plan.md §6.6): web.dev Long Tasks / RAIL, Chrome DevTools Performance.
 *
 * SVARĪGI — ko šis testē un ko NĒ:
 *  - Headless Chromium FPS ≠ reālas ierīces FPS. Šis NAV PASS/no-go gate (to izlemj
 *    īpašnieks; reālo ierīču mērījums apzināti izlaists — sk. §6).
 *  - Šis ir lēts regresijas slazds: noķer KATASTROFĀLU sabrukumu (animācija nedzīvo,
 *    gara Long Task bloķē pavedienu, vai konsoles kļūda tēmas ceļā) PIRMS deploy.
 *
 * Dizaina niansītes:
 *  - `playwright.config.ts` uzliek `reducedMotion: "reduce"` globāli → tas piespiestu
 *    motion uz `static`. Šeit pārrakstām uz `no-preference`, lai mērītu ANIMĒTO ceļu.
 *  - Tēmu uzliekam TIEŠI caur `data-theme` atribūtu (ne caur app `selectTheme`), tāpēc
 *    app `startMotionFpsProbe()` atkārtoti nepalaižas un nepārslēdz mūs uz `static`.
 *
 * Palaišana (opt-in, dedikēts CI darbs — nepiesārņo galveno e2e komplektu):
 *   THEME_PERF=1 npx playwright test theme-performance
 */

test.use({ reducedMotion: "no-preference" });

// 6 pērkamās tēmas. Filtru/CSS-animācijas riska tēmas (§2.1) ir iekļautas pirmās.
const PAID_THEME_SLUGS = ["pop-out", "luminous", "confetti", "twilight", "rain", "bubbles"] as const;

// Tripwire sliekšņi — apzināti VAĻĪGI (headless trokšņains). Noķer tikai katastrofas.
const PROBE_MS = 3000; // idle animācijas logs vienai tēmai
const MIN_FRAMES = 20; // < ~7 FPS 3s laikā = rAF cilpa praktiski mirusi
const MAX_LONG_TASK_MS = 400; // viena Long Task virs šī = bloķēts pavediens, ne jitter

type ProbeResult = {
  readonly frames: number;
  readonly elapsedMs: number;
  readonly fps: number;
  readonly longTaskCount: number;
  readonly maxLongTaskMs: number;
};

/** Palaiž rAF kadenci + Long Task novērotāju lapā uz `durationMs`. */
async function probeMainThread(page: Page, durationMs: number): Promise<ProbeResult> {
  return page.evaluate(async (ms): Promise<ProbeResult> => {
    let longTaskCount = 0;
    let maxLongTaskMs = 0;
    let observer: PerformanceObserver | undefined;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskCount += 1;
          if (entry.duration > maxLongTaskMs) maxLongTaskMs = entry.duration;
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch {
      // longtask nav atbalstīts → maxLongTaskMs paliek 0 (aserts tikai vājāks, ne nepatiess).
    }

    const start = performance.now();
    let frames = 0;
    await new Promise<void>((resolve) => {
      const tick = () => {
        frames += 1;
        if (performance.now() - start >= ms) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsedMs = performance.now() - start;
    observer?.disconnect();

    return {
      frames,
      elapsedMs,
      fps: (frames / elapsedMs) * 1000,
      longTaskCount,
      maxLongTaskMs
    };
  }, durationMs);
}

test.describe("theme performance tripwire", () => {
  test.skip(!process.env.THEME_PERF, "opt-in: palaiž ar THEME_PERF=1 (dedikēts CI darbs)");

  for (const slug of PAID_THEME_SLUGS) {
    test(`lobby animation stays alive and unblocked: ${slug}`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
      page.on("pageerror", (e) => consoleErrors.push(e.message));

      await page.goto("/");
      await expect(page.locator(".lobbyShell")).toBeVisible();

      // Uzliek animēto tēmu tieši + piespiež motion=animated (notīra app static-gate).
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        delete document.documentElement.dataset.themeMotion;
      }, slug);

      // Fons tiešām pārslēdzas uz šīs tēmas animēto SVG (ne posteri, ne default).
      const bgImage = await page.evaluate(() =>
        getComputedStyle(document.querySelector(".lobbyShell") as Element).backgroundImage
      );
      expect(bgImage, `${slug} lobby fonam jārāda tēmas animētais SVG`).toContain(`/themes/${slug}/lobby.svg`);

      const result = await probeMainThread(page, PROBE_MS);

      expect(result.frames, `${slug}: rAF cilpa sabruka (${result.frames} kadri)`).toBeGreaterThanOrEqual(MIN_FRAMES);
      expect(
        result.maxLongTaskMs,
        `${slug}: gara Long Task bloķēja pavedienu (${Math.round(result.maxLongTaskMs)}ms)`
      ).toBeLessThanOrEqual(MAX_LONG_TASK_MS);
      expect(consoleErrors, `${slug}: konsoles kļūdas tēmas ceļā`).toEqual([]);
    });
  }
});
