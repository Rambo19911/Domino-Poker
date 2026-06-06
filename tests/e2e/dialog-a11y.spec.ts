import { expect, type Locator, type Page, test } from "@playwright/test";

test.describe("dialog accessibility", () => {
  test("lobby closeable dialogs receive focus, expose modal semantics, and close with Escape", async ({ page }) => {
    await page.goto("/");

    const settingsButton = page.getByRole("button", { name: "Settings" });
    await settingsButton.click();

    const settingsDialog = page.getByRole("dialog", { name: /Settings/i });
    await expectModalDialog(settingsDialog);
    await expect(settingsDialog.getByRole("button", { name: "Close" })).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(page.getByLabel("Language")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(settingsDialog.getByRole("button", { name: "Close" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(settingsDialog).toBeHidden();
    await expect(settingsButton).toBeFocused();

    const rulesButton = page.getByRole("button", { name: "Game rules" });
    await rulesButton.click();

    const rulesDialog = page.getByRole("dialog", { name: /Game rules/i });
    await expectModalDialog(rulesDialog);
    await expect(rulesDialog.getByRole("button", { name: "Close" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(rulesDialog).toBeHidden();
    await expect(rulesButton).toBeFocused();
  });

  test("mandatory bid dialog keeps focus and stays open on Escape", async ({ page }) => {
    const bidDialog = await openHumanLeadGameAtBidDialog(page);
    await expectModalDialog(bidDialog);

    const zeroBidButton = bidDialog.getByRole("button", { name: "0", exact: true });
    await expect(zeroBidButton).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(bidDialog.getByRole("button").last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(zeroBidButton).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(bidDialog).toBeVisible();
    await expect(zeroBidButton).toBeFocused();
  });

  test("exit confirmation dialog closes with Escape and restores focus", async ({ page }) => {
    const bidDialog = await openHumanLeadGameAtBidDialog(page);
    await bidDialog.getByRole("button", { name: "0", exact: true }).click();
    await expect(bidDialog).toBeHidden();

    const exitButton = page.locator(".exitButton");
    await expect(exitButton).toBeVisible();
    await exitButton.click();

    const exitDialog = page.getByRole("dialog", { name: /^Exit/i });
    await expectModalDialog(exitDialog);
    await expect(exitDialog.getByRole("button", { name: "Cancel" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(exitDialog).toBeHidden();
    await expect(exitButton).toBeFocused();
  });

  test("number selection dialog closes with Escape and restores tile focus", async ({ page }) => {
    const bidDialog = await openHumanLeadGameAtBidDialog(page);
    await bidDialog.getByRole("button", { name: "0", exact: true }).click();
    await expect(bidDialog).toBeHidden();
    await expect(page.getByText("Your Turn")).toBeVisible({ timeout: 20_000 });

    const playableNumberTile = await findPlayableNumberTile(page);
    await playableNumberTile.click();

    const numberDialog = page.getByRole("dialog", { name: /Select Suit/i });
    await expectModalDialog(numberDialog);
    await expect(numberDialog.getByRole("button").first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(numberDialog).toBeHidden();
    await expect(playableNumberTile).toBeFocused();
  });
});

async function openHumanLeadGameAtBidDialog(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.evaluate(() => {
    const browserRandom = Math.random.bind(Math);
    let randomCalls = 0;
    // Keep the production shuffle path intact, but make this UI scenario repeatable.
    Math.random = () => {
      randomCalls += 1;
      return randomCalls <= 64 ? 0 : browserRandom();
    };
  });
  await page.getByRole("button", { name: "Play", exact: true }).click();

  const bidDialog = page.getByRole("dialog", { name: /How many tricks/i });
  await expect(bidDialog).toBeVisible({ timeout: 10_000 });
  return bidDialog;
}

async function findPlayableNumberTile(page: Page): Promise<Locator> {
  const playableTiles = page.locator('button[aria-label^="Play "]:not([disabled])');
  await expect(playableTiles.first()).toBeVisible();

  const count = await playableTiles.count();
  for (let index = 0; index < count; index += 1) {
    const tile = playableTiles.nth(index);
    const label = await tile.getAttribute("aria-label");
    const match = /^Play (\d)-(\d)$/.exec(label ?? "");
    if (!match) continue;

    const side1 = Number(match[1]);
    const side2 = Number(match[2]);
    if (side1 !== side2 && !isTrumpTile(side1, side2)) {
      return tile;
    }
  }

  throw new Error("Expected a playable non-trump, non-double tile for the number selection dialog.");
}

function isTrumpTile(side1: number, side2: number): boolean {
  return [
    [0, 0],
    [1, 1],
    [1, 6],
    [1, 5],
    [1, 4],
    [1, 3],
    [1, 2],
    [1, 0]
  ].some(([trumpSide1, trumpSide2]) =>
    (side1 === trumpSide1 && side2 === trumpSide2) ||
    (side1 === trumpSide2 && side2 === trumpSide1)
  );
}

async function expectModalDialog(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
}
