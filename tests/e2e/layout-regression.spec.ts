import { expect, type Locator, type Page, test } from "@playwright/test";

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
