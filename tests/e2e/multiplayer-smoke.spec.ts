import { expect, test } from "@playwright/test";

/**
 * Multiplayer browser-to-server smoke test (audita Fāze 2, 9. punkts).
 *
 * Validē REĀLO integrēto ceļu, ko vitest neaptver: browser → WebSocket → shared
 * protokols → servera room engine. Scenārijs: atver lobby, savienojas ar MP serveri,
 * izveido istabu, aizpilda ar botiem, sāk spēli un sagaida game snapshot/turn UI.
 *
 * Abus serverus (apps/server uz 4000 + apps/web uz 3000) startē playwright.config.ts.
 */
test("multiplayer: create room, fill bots, start, and reach the game table", async ({ page }) => {
  test.setTimeout(90_000); // WS savienojums + 10s pre-game countdown + botu solīšana
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  await page.goto("/");
  await expect(page).toHaveTitle(/Domino Poker/);

  // 1) Ieiet multiplayer lobby. Pogas accessible name nāk no aria-label (modeMultiplayer
  //    = "Multiplayer"); desktop variants (LobbyWheel) ir pirmais DOM un redzams.
  await page.getByRole("button", { name: "Multiplayer", exact: true }).first().click();

  // 2) Atvērt "Create room" dialogu (lobby poga var saturēt "+ ").
  await page.getByRole("button", { name: /Create room/ }).first().click();
  const createDialog = page.getByRole("dialog");
  await expect(createDialog).toBeVisible();

  // 3) Iesniegt — submit poga ir disabled, līdz WS savienojums izveidots, tāpēc
  //    Playwright auto-gaida savienojumu pirms klikšķa.
  await createDialog.getByRole("button", { name: "Create room", exact: true }).click();

  // 4) Waiting room: aizpildīt tukšās sēdvietas ar botiem (poga enabled tikai hostam).
  await page.getByRole("button", { name: "Fill bots", exact: true }).click();

  // 5) Sākt spēli (Start enabled tikai, kad visas 4 sēdvietas aizpildītas).
  await page.getByRole("button", { name: "Start", exact: true }).click();

  // 6) Spēles galds renderējas pēc servera GAME_STARTING + snapshot (ir ~10s pre-game
  //    countdown, tāpēc dāsns timeout).
  await expect(page.getByLabel("Domino Poker game table")).toBeVisible({ timeout: 30_000 });

  // 7) Servera turn routing: cilvēks (hosts) saņem solīšanas kārtu → bid dialogs.
  await expect(page.getByRole("dialog", { name: /How many tricks/i })).toBeVisible({
    timeout: 30_000
  });

  expect(runtimeErrors).toEqual([]);
});
