import { expect, test } from "@playwright/test";

test.describe("local storage resilience", () => {
  test("ignores malformed stored locale and audio values", async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);

    await page.addInitScript(() => {
      window.localStorage.setItem("domino-poker-locale", "not-a-locale");
      window.localStorage.setItem("domino-poker-muted", "not-a-boolean");
      window.localStorage.setItem("domino-poker-music-enabled", "not-a-boolean");
      window.localStorage.setItem("domino-poker-effects-volume", "999");
      window.localStorage.setItem("domino-poker-music-volume", "not-a-number");
    });

    await page.goto("/");

    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
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

    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /How many tricks/i })).toBeVisible({ timeout: 10_000 });

    expect(runtimeErrors).toEqual([]);
  });
});

// Publiskās sadaļas ietekme uz saglabātajām izvēlēm (plāna 12.2 / D5).
//
// Publiskās lapas ir OTRA root sakne ar savu `<html lang>`, tāpēc pastāv divi reāli
// regresijas riski: (a) publiskā lapa varētu pārrakstīt lietotāja izvēlēto spēles valodu,
// jo tās dokumenta valoda ir cita; (b) route grupu maiņa varētu būt atstājusi publisko
// sakni bez tēmas/glass bootstrap, un lapa ielādētos ar noklusējuma izskatu.
test.describe("public pages and stored preferences", () => {
  test("navigating to a public page does not rewrite the stored game language", async ({
    page
  }) => {
    const runtimeErrors = collectRuntimeErrors(page);

    // Lietotājs ir izvēlējies latviešu spēles valodu.
    await page.addInitScript(() => {
      window.localStorage.setItem("domino-poker-locale", "lv");
    });

    await page.goto("/");
    expect(await readStored(page, "domino-poker-locale")).toBe("lv");

    // Publiskā LV lapa un atgriešanās spēlē — abi ir pilnas pārlādes (divas root saknes).
    await page.goto("/lv/rules");
    expect(await readStored(page, "domino-poker-locale"), "public page rewrote the locale").toBe(
      "lv"
    );

    // Arī ANGĻU publiskā lapa nedrīkst pārrakstīt izvēli: tās `<html lang>` ir `en`, bet
    // tā ir dokumenta valoda, nevis lietotāja spēles izvēle.
    await page.goto("/en/rules");
    expect(await readStored(page, "domino-poker-locale"), "EN page rewrote the locale").toBe("lv");

    await page.goto("/");
    expect(await readStored(page, "domino-poker-locale")).toBe("lv");
    await expect(page.locator("html")).toHaveAttribute("lang", "lv");

    expect(runtimeErrors).toEqual([]);
  });

  test("public pages apply the stored theme and glass preferences", async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);

    await page.addInitScript(() => {
      // Vērtībām jābūt TĀDĀM, kādas raksta pati lietotne: glass bootstrap salīdzina ar
      // burtisku `"on"` (`lib/glassPrefs.ts`), tāpēc `"true"` neko neieslēgtu un tests
      // izietu pat tad, ja glass bootstrap būtu pazudis.
      window.localStorage.setItem("domino-poker-theme", "twilight");
      window.localStorage.setItem("domino-poker-glass", "on");
      window.localStorage.setItem("domino-poker-dark-glass", "on");
    });

    // Ja publiskā sakne būtu zaudējusi `BootstrapScripts`, šie atribūti paliktu noklusējuma
    // vērtībā un lapa ielādētos ar citu izskatu nekā spēle (D5 obligātais nosacījums).
    // Pārbaudītas VISAS trīs izvēles: tēma un abi glass slāņi nāk no diviem atsevišķiem
    // bootstrap skriptiem, tāpēc viena pārbaude neaptvertu otru.
    await page.goto("/en/rules");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "twilight");
    await expect(page.locator("html")).toHaveAttribute("data-glass", "on");
    await expect(page.locator("html")).toHaveAttribute("data-dark-glass", "on");

    // Spēles saknē tiek pārbaudīts TIKAI glass, un tas nav izlaidums:
    // `reconcileStoredTheme` anonīmam lietotājam atstata nenopirktu MAKSAS tēmu atpakaļ uz
    // Default (`lib/theme.ts`), tāpēc `data-theme="twilight"` tur pazūd pēc `/store/owned`
    // ielādes. Apgalvot to būtu sacīkste ar reconcile, nevis pārbaude. Bezmaksas ir tikai
    // Default, kuram bootstrap atribūtu vispār neuzliek, tāpēc stabilas tēmas signāla
    // spēles saknē nav. Glass izvēles nav piesaistītas īpašumtiesībām un paliek.
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-glass", "on");
    await expect(page.locator("html")).toHaveAttribute("data-dark-glass", "on");

    expect(runtimeErrors).toEqual([]);
  });
});

async function readStored(page: import("@playwright/test").Page, key: string): Promise<string | null> {
  return page.evaluate((name) => window.localStorage.getItem(name), key);
}

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
