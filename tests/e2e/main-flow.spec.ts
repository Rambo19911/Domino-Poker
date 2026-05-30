import { expect, test } from "@playwright/test";

test("single-player smoke flow reaches the first completed trick", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      runtimeErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("/");
  await expect(page).toHaveTitle(/Domino Poker/);
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();

  await page.getByRole("button", { name: "Play" }).click();

  const bidDialog = page.getByRole("dialog", { name: /How many tricks/i });
  await expect(bidDialog).toBeVisible();
  const zeroBidButton = bidDialog.getByRole("button", { name: "0", exact: true });
  await expect(zeroBidButton).toBeFocused();
  await zeroBidButton.click();
  await expect(bidDialog).toBeHidden();

  await expect(page.getByText("Your Turn")).toBeVisible({ timeout: 20_000 });

  const playableTile = page.locator('button[aria-label^="Play "]:not([disabled])').first();
  await expect(playableTile).toBeVisible();
  await playableTile.click();

  const numberDialog = page.getByRole("dialog", { name: /Select suit/i });
  if (await numberDialog.isVisible().catch(() => false)) {
    await numberDialog.getByRole("button").first().click();
  }

  await expect(page.getByText("1 tricks / 7")).toBeVisible({ timeout: 20_000 });
  expect(runtimeErrors).toEqual([]);
});
