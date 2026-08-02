import { expect, type Locator, type Page, test } from "@playwright/test";

import { PUBLIC_PAGES, PUBLIC_ROUTES } from "../../apps/web/lib/site";

type ViewportCase = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly lobbyMode: "desktop" | "compact";
};

const layoutViewports: readonly ViewportCase[] = [
  { name: "full-hd", width: 1920, height: 1080, lobbyMode: "desktop" },
  { name: "laptop", width: 1366, height: 768, lobbyMode: "desktop" },
  { name: "hd", width: 1280, height: 720, lobbyMode: "desktop" },
  { name: "tablet-landscape", width: 1024, height: 768, lobbyMode: "desktop" },
  { name: "compact-tablet", width: 900, height: 650, lobbyMode: "compact" }
];

test.describe("layout regression", () => {
  for (const viewport of layoutViewports) {
    test(`lobby key surfaces fit in ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepareLayoutPage(page);

      await expect(page).toHaveTitle(/Domino Poker/);
      await expect(page.locator(".lobbyShell")).toBeVisible();
      await expectInsideViewport(page.locator(".lobbyTopBar"), viewport, "lobby top bar");
      await expectInsideViewport(page.locator(".lobbyContent"), viewport, "lobby content");

      if (viewport.lobbyMode === "compact") {
        await expect(page.locator(".modeWheel")).toBeHidden();
        await expect(page.locator(".compactLobbyPanel")).toBeVisible();
        await expectInsideViewport(page.locator(".compactLobbyPanel"), viewport, "compact lobby panel");
        await expectInsideViewport(page.locator(".compactPlayButton"), viewport, "compact play button");
      } else {
        await expect(page.locator(".modeWheel")).toBeVisible();
        await expect(page.locator(".compactLobbyPanel")).toBeHidden();
        await expectInsideViewport(page.locator(".modeWheel"), viewport, "desktop lobby wheel");
        await expectInsideViewport(page.locator(".playButton:not(.multiplayerButton)"), viewport, "desktop play button");
      }
    });

    test(`game table stage fits in ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepareLayoutPage(page);

      await clickVisiblePlayButton(page, viewport.lobbyMode);
      await expect(page.getByRole("dialog", { name: /How many tricks/i })).toBeVisible();

      await expectInsideViewport(page.locator(".fixedStage"), viewport, "fixed game stage");
      await expectInsideViewport(page.locator(".table"), viewport, "game table");
      await expectInsideViewport(page.locator(".infoPanel"), viewport, "score panel");

      await expect(page.locator(".playerProfile")).toHaveCount(4);
      await expect(page.locator(".humanTileButton")).toHaveCount(7);
      await expect(page.locator(".hiddenTile")).toHaveCount(21);

      await expectAllInsideViewport(page.locator(".playerProfile"), viewport, "player profile");
      await expectAllInsideViewport(page.locator(".humanTileButton"), viewport, "human tile");
      await expectAllInsideViewport(page.locator(".hiddenTile"), viewport, "opponent hidden tile");
    });
  }
});

// Publiskās navigācijas bloks lobijā (`.lobbyAbout`, plāna 8.3 / 12.2).
//
// Divi izmēri APZINĀTI: virs 820px tas ir `position: absolute` čaulas apakšā, zem tā
// (`public-pages.css` media query) pāriet parastā plūsmā ritināmā čaulā. Tie ir divi
// atšķirīgi izkārtojuma režīmi, tāpēc viens izmērs neko nepierādītu par otru.
//
// Mobilais portrets ir jauns arī pašam failam: līdz šim mazākais bija 900×650.
const publicNavViewports: readonly ViewportCase[] = [
  { name: "hd", width: 1280, height: 720, lobbyMode: "desktop" },
  { name: "mobile-portrait", width: 390, height: 844, lobbyMode: "compact" }
];

test.describe("public navigation in lobby", () => {
  for (const viewport of publicNavViewports) {
    test(`public links stay visible and clear of game controls in ${viewport.name}`, async ({
      page
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepareLayoutPage(page);

      const about = page.locator(".lobbyAbout");
      // Bloks nekad netiek slēpts — `public-pages.css` to nosaka tieši. Nogriezts vai
      // paslēpts teksts būtu slēpšana, ko plāna 8.3 aizliedz.
      await expect(about, "public nav block should exist in every size").toHaveCount(1);

      // Bloks nedrīkst būt NOGRIEZTS: `.lobbyShell` ir `overflow: hidden`, tāpēc viss, kas
      // iziet ārpus čaulas, pazūd neatgriezeniski. Tas ir īstais slēpšanas risks.
      //
      // Prasība "pilnībā skatā" šeit APZINĀTI NETIEK izvirzīta: pie 1280×720 čaula ir 764px
      // augsta (apakšējais padding tur vietu tieši šim blokam), tāpēc dokuments ritinās ~44px
      // un bloks sākas tieši zem locījuma. Tas ir izkārtojuma fakts, ne defekts — mērīts, ne
      // pieņemts. Nogriešana un pārklāšanās ir tas, kas jāsargā.
      await expectInsideContainer(about, page.locator(".lobbyShell"), "public nav block");
      await about.scrollIntoViewIfNeeded();
      await expect(about).toBeVisible();

      // Tieši piecas saites uz publiskajām lapām — KOPU vienādība, nevis skaits un forma:
      // piecas dublētas derīgi izskatošās adreses citādi izietu cauri.
      const hrefs = await about.locator("a[href]").evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("href") ?? "")
      );
      expect([...hrefs].sort(), "lobby public link set").toEqual(
        [...PUBLIC_PAGES.map((item) => PUBLIC_ROUTES.en[item])].sort()
      );

      // KODOLS: jaunās saites nedrīkst pārklāt spēles vadīklas.
      const play = await visiblePlayButton(page);
      await expectNoOverlap(about, play, "public nav block", "play button");
      await expectNoOverlap(about, page.locator(".lobbyTopBar"), "public nav block", "top bar");
    });

    test(`single-player still launches with public links present in ${viewport.name}`, async ({
      page
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepareLayoutPage(page);

      // `main-flow.spec.ts` jau pierāda pilnu SP partiju un `multiplayer-smoke.spec.ts` — MP
      // istabu; tie netiek dublēti. Šeit tiek pierādīts tikai tas, kas ir JAUNS: palaišana
      // joprojām strādā ŠAJOS izmēros, kur publisko saišu bloks ir klāt.
      const play = await visiblePlayButton(page);
      await play.click();
      await expect(page.getByRole("dialog", { name: /How many tricks/i })).toBeVisible();
    });
  }

  // MP ieejas poga ir DIVAS atšķirīgas pogas (`.multiplayerButton` un
  // `.compactMultiplayerButton`), un līdz šim neviens tests nepieskārās kompaktajai.
  for (const viewport of publicNavViewports) {
    test(`multiplayer entry point stays reachable next to the public links in ${viewport.name}`, async ({
      page
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await prepareLayoutPage(page);

      const multiplayer = page.getByRole("button", { name: "Multiplayer", exact: true });
      const visible = multiplayer.filter({ visible: true }).first();
      await expect(visible, "no visible multiplayer button").toBeVisible();
      await expectNoOverlap(
        page.locator(".lobbyAbout"),
        visible,
        "public nav block",
        "multiplayer button"
      );

      // Redzamība un nepārklāšanās NAV darbība. `multiplayer-smoke.spec.ts` klikšķina tikai
      // darbvirsmas pogu, tāpēc kompaktā `.compactMultiplayerButton` līdz šim nekad nav bijusi
      // nospiesta nevienā testā. Šeit tā tiek nospiesta un tiek prasīta MP lobija virsma;
      // pilnu istabas izveidi un partiju joprojām sedz `multiplayer-smoke.spec.ts`.
      await visible.click();
      await expect(
        page.getByRole("button", { name: /Create room/ }).first(),
        "multiplayer lobby did not open"
      ).toBeVisible();
    });
  }
});

/** Lobijs pārslēdzas starp diviem izkārtojumiem; testam jāstrādā abos. */
async function visiblePlayButton(page: Page): Promise<Locator> {
  const compact = page.locator(".compactPlayButton");
  if (await compact.isVisible()) return compact;
  const desktop = page.locator(".playButton:not(.multiplayerButton)");
  await expect(desktop, "neither compact nor desktop play button is visible").toBeVisible();
  return desktop;
}

/**
 * Elements pilnībā ietilpst konteinerā. Vajadzīgs tur, kur konteineram ir `overflow: hidden`:
 * tad izeja ārpus tā nozīmē neatgriezenisku nogriešanu, ko `toBeVisible()` nepamana.
 */
async function expectInsideContainer(inner: Locator, outer: Locator, label: string) {
  await expect(inner, `${label} should be visible`).toBeVisible();
  const box = await inner.boundingBox();
  const container = await outer.boundingBox();
  expect(box, `${label} should have a bounding box`).not.toBeNull();
  expect(container, `${label} container should have a bounding box`).not.toBeNull();
  if (!box || !container) return;

  const tolerance = 1;
  expect(box.x, `${label} left edge should be inside its container`).toBeGreaterThanOrEqual(
    container.x - tolerance
  );
  expect(box.y, `${label} top edge should be inside its container`).toBeGreaterThanOrEqual(
    container.y - tolerance
  );
  expect(box.x + box.width, `${label} right edge should be inside its container`).toBeLessThanOrEqual(
    container.x + container.width + tolerance
  );
  expect(
    box.y + box.height,
    `${label} bottom edge should be inside its container (clipped by overflow: hidden)`
  ).toBeLessThanOrEqual(container.y + container.height + tolerance);
}

/**
 * Divi elementi nedrīkst pārklāties. Salīdzina taisnstūru krustojumu, nevis tikai to, ka
 * abi ir redzami: `toBeVisible()` ir patiess arī tad, kad viens elements guļ virs otra.
 */
async function expectNoOverlap(a: Locator, b: Locator, labelA: string, labelB: string) {
  const boxA = await a.boundingBox();
  const boxB = await b.boundingBox();
  expect(boxA, `${labelA} should have a bounding box`).not.toBeNull();
  expect(boxB, `${labelB} should have a bounding box`).not.toBeNull();
  if (!boxA || !boxB) return;

  const overlapX = Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x);
  const overlapY = Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y);
  const overlaps = overlapX > 1 && overlapY > 1;
  expect(overlaps, `${labelA} must not overlap ${labelB}`).toBe(false);
}

async function prepareLayoutPage(page: Page) {
  await page.goto("/");
}

async function clickVisiblePlayButton(page: Page, lobbyMode: ViewportCase["lobbyMode"]) {
  const playButton = lobbyMode === "compact" ? page.locator(".compactPlayButton") : page.locator(".playButton:not(.multiplayerButton)");
  await expect(playButton).toBeVisible();
  await playButton.click();
}

async function expectAllInsideViewport(locator: Locator, viewport: ViewportCase, label: string) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    await expectInsideViewport(locator.nth(index), viewport, `${label} ${index + 1}`);
  }
}

async function expectInsideViewport(locator: Locator, viewport: ViewportCase, label: string) {
  await expect(locator, `${label} should be visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} should have a bounding box`).not.toBeNull();
  if (!box) return;

  const tolerance = 1;
  expect(box.x, `${label} left edge should be inside viewport`).toBeGreaterThanOrEqual(-tolerance);
  expect(box.y, `${label} top edge should be inside viewport`).toBeGreaterThanOrEqual(-tolerance);
  expect(box.x + box.width, `${label} right edge should be inside viewport`).toBeLessThanOrEqual(viewport.width + tolerance);
  expect(box.y + box.height, `${label} bottom edge should be inside viewport`).toBeLessThanOrEqual(viewport.height + tolerance);
}
