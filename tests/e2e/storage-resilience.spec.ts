import { expect, test } from "@playwright/test";

test.describe("local storage resilience", () => {
  test("ignores malformed stored locale, audio, and stats values", async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);

    await page.addInitScript(() => {
      window.localStorage.setItem("domino-poker-locale", "not-a-locale");
      window.localStorage.setItem("domino-poker-muted", "not-a-boolean");
      window.localStorage.setItem("domino-poker-music-enabled", "not-a-boolean");
      window.localStorage.setItem("domino-poker-effects-volume", "999");
      window.localStorage.setItem("domino-poker-music-volume", "not-a-number");
      window.localStorage.setItem("domino-poker-local-stats", "{bad json");
      window.localStorage.setItem("domino-poker-active-sessions", "{bad json");
    });

    await page.goto("/");

    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
    await expect(page.getByLabel("Live Stats")).toContainText("Games played");
    await expect(page.getByLabel("Live Stats")).toContainText("0");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("dialog", { name: /Settings/i })).toBeVisible();
    await expect(page.getByLabel("Language")).toHaveValue("en");

    expect(runtimeErrors).toEqual([]);
  });

  test("continues to load and start a game when localStorage throws", async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);

    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new Error("localStorage getItem blocked");
      };
      Storage.prototype.setItem = () => {
        throw new Error("localStorage setItem blocked");
      };
    });

    await page.goto("/");

    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("button", { name: "Play" }).click();
    await expect(page.getByRole("dialog", { name: /How many tricks/i })).toBeVisible({ timeout: 10_000 });

    expect(runtimeErrors).toEqual([]);
  });
});

function collectRuntimeErrors(page: import("@playwright/test").Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
