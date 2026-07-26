import { expect, test, type Page } from "@playwright/test";

/**
 * T7.3 — Domino Slots pilnais pārlūka ceļš.
 *
 * Šis ir VIENĪGAIS tests, kas reāli montē PixiJS spēli: līdz Fāzei 6 neviens neimportēja
 * `SlotsGameLoader`, tāpēc renderētājam nebija izpildlaika seguma (sk. plāna §5).
 *
 * Kontu izveido pret servera `/auth/register` (playwright.config.ts serveris iet ar
 * `DATABASE_URL=":memory:"`, tāpēc konts ir īslaicīgs un pazūd līdz ar procesu).
 * Tokens tiek ielikts `localStorage` pirms lapas skripta, jo tieši tā app hidratē sesiju.
 */

const SERVER = "http://127.0.0.1:4000";
const AUTH_TOKEN_STORAGE_KEY = "domino-poker-auth-token";
/** Katram laidienam savs konts; `/auth/register` ir 5/h uz IP, tāpēc reģistrē VIENREIZ. */
const suffix = `${Date.now()}`.slice(-6);
const account = {
  username: `slots${suffix}`,
  password: "Slots-e2e-1234",
  email: `slots${suffix}@example.com`
};

let token = "";

test.beforeAll(async ({ request }) => {
  const response = await request.post(`${SERVER}/auth/register`, { data: account });
  expect(response.ok(), `register failed: ${response.status()} ${await response.text()}`).toBe(true);
  token = ((await response.json()) as { token: string }).token;
  expect(token).toBeTruthy();
});

async function signIn(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [AUTH_TOKEN_STORAGE_KEY, token]
  );
}

/** Konsoles kļūdas + neveiksmīgi tīkla pieprasījumi, ko katrs tests apgalvo kā tukšus. */
function collectFailures(page: Page): { errors: string[]; notFound: string[] } {
  const errors: string[] = [];
  const notFound: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() === 404) notFound.push(response.url());
  });
  return { errors, notFound };
}

test("anonīms lietotājs slotu ikonu neredz", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Store" })).toBeVisible();

  expect(await page.locator(".lobbySlotsButton").count()).toBe(0);
});

test("autentificēts darbvirsmas lietotājs redz ikonu, un Pixi ielādējas TIKAI pēc klikšķa", async ({
  page
}) => {
  test.setTimeout(120_000);
  const failures = collectFailures(page);
  const slotAssets: string[] = [];
  const pixiChunks: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/\/assets\/slots\//u.test(url)) slotAssets.push(url);
    // T5.2 dinamiskā robeža attiecas gan uz 4,5 MiB grafiku, GAN uz pašu PixiJS (~376 KiB).
    if (/pixi/iu.test(url) && /\.js(\?|$)/u.test(url)) pixiChunks.push(url);
  });

  await signIn(page);
  await page.goto("/");

  const icon = page.locator(".lobbySlotsButton");
  await expect(icon).toBeVisible();

  // T7.6 bundle budžets: pirms klikšķa lobijs NEDRĪKST būt vilcis ne slotu aktīvus,
  // ne PixiJS chunk.
  expect(slotAssets).toEqual([]);
  expect(pixiChunks).toEqual([]);

  await icon.click();

  const dialog = page.getByRole("dialog", { name: "Domino Slots" });
  await expect(dialog).toBeVisible();
  // Spēle ir ielādējusies, kad pieejamības proxy pogas eksistē (tās veido `GameApp`).
  await expect(page.getByRole("button", { name: "Spin", exact: true })).toBeEnabled({ timeout: 90_000 });
  expect(slotAssets.length).toBeGreaterThan(0);
  expect(pixiChunks.length).toBeGreaterThan(0);

  expect(failures.errors).toEqual([]);
  expect(failures.notFound).toEqual([]);
});

test("grieziens sinhronizē lobija bilanci ar servera autoritatīvo atbildi", async ({ page }) => {
  test.setTimeout(120_000);
  const failures = collectFailures(page);

  await signIn(page);
  await page.goto("/");
  await page.locator(".lobbySlotsButton").click();

  const spin = page.getByRole("button", { name: "Spin", exact: true });
  await expect(spin).toBeEnabled({ timeout: 90_000 });

  // Iznākums ir nejaušs, tāpēc NEapgalvojam "bilance mainījās" (laimests var būt tieši
  // likmes lielumā). Apgalvojam SINHRONIZĀCIJU: lobijs rāda tieši to summu, ko atdeva
  // serveris — tas ir īstais invariants un tas nav flaky.
  const settled = page.waitForResponse(
    (response) => response.url().includes("/slots/spin") && response.request().method() === "POST"
  );
  // Proxy pogas ir `pointer-events: none` platā panelī (kanva pati apstrādā klikšķi),
  // tāpēc aktivizējam ar tastatūru — tas ir arī dokumentētais pieejamības ceļš.
  await spin.press("Enter");
  const response = await settled;
  expect(response.status()).toBe(200);
  const authoritative = ((await response.json()) as { balance: number }).balance;

  // Aizver dialogu; `dispose` izskalo neizpausto bilanci arī tad, ja ruļļi vēl griežas.
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Domino Slots" })).toBeHidden();

  await expect(page.locator(".lobbyProfileBalance")).toHaveAttribute(
    "aria-label",
    new RegExp(`:\\s*${authoritative}$`, "u"),
    { timeout: 15_000 }
  );

  expect(failures.errors).toEqual([]);
  expect(failures.notFound).toEqual([]);
});

test("aizvēršana AKTĪVAS Auto Spin sērijas vidū aptur turpmākās likmes", async ({ page }) => {
  test.setTimeout(120_000);
  // Fāzes 5 Codex atrada naudas kļūdu tieši šajā ķēdē, un Fāze 6 pret to uzbūvēja
  // vārtus. Šis tests iet cauri ĪSTAJAI ķēdei (`AutoSpinDialog` → `GameController` →
  // HTTP) un apgalvo GALA invariantu: pēc aizvēršanas likmes vairs nenotiek.
  //
  // ⚠️ Ko šis tests NEPIERĀDA: sinhrono `canWager()` vārtu atsevišķi. Mutācijas
  // pārbaudē (`canWager` → `true`) tests joprojām izturēja, jo atmontēšana pie
  // `"closing"` paspēj nostrādāt. Zem-kadra sacīkstes logu no Playwright nevar droši
  // trāpīt; to determinēti sedz `apps/web/test/slots/SlotsDialog.test.tsx`.
  //
  // `reducedMotion` globāli ir "reduce", un `usePresence` tad atmontē UZREIZ, apejot
  // 200 ms izejas logu. Šeit to izslēdzam, lai testētu īsto dzīves ciklu.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/slots/spin") && request.method() === "POST") {
      posts.push(request.url());
    }
  });

  await signIn(page);
  await page.goto("/");
  await page.locator(".lobbySlotsButton").click();
  await page.getByRole("button", { name: "Spin", exact: true }).waitFor({ timeout: 90_000 });

  await page.getByRole("button", { name: "Auto spin" }).press("Enter");
  const firstSpin = page.waitForResponse(
    (response) => response.url().includes("/slots/spin") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "10 auto spins" }).press("Enter");
  await firstSpin;

  // Auto Spin sērija ir sākusies (10 griezieni). Aizveram tās vidū.
  await page.getByRole("button", { name: "Close" }).click();
  const afterClose = posts.length;

  // Logam jābūt garākam par GARĀKO laimesta prezentāciju (HUGE/MEGA/JACKPOT paneļi),
  // citādi liels laimests to izstieptu un tests izturētu tikai tāpēc, ka nākamais
  // grieziens vēl nebūtu paguvis sākties.
  await page.waitForTimeout(8_000);
  expect(posts.length).toBe(afterClose);
});

test("atkārtota atvēršana IZEJAS LOGA laikā atjauno spēles darbību", async ({ page }) => {
  test.setTimeout(120_000);
  // `Presence` reopen 200 ms izejas logā patur TO PAŠU `SlotsDialog` instanci (remontē
  // tikai bērnu), tāpēc `closeRequestedRef` jānoņem — citādi no jauna atvērtā spēle
  // nekad vairs nevarētu griezt un rādītu maldinošu "session expired".
  //
  // Divi nosacījumi, lai tests tiešām trāpītu tajā logā:
  //  1. jāizslēdz globālais `reducedMotion: "reduce"` — citādi `usePresence` atmontē
  //     uzreiz, tiek uzbūvēta JAUNA instance, un retained-instance ceļš netiek segts;
  //  2. atvēršanai jānotiek < 200 ms pēc aizvēršanas, tāpēc abi klikšķi iet caur
  //     `evaluate` ar fiksētu aizturi, nevis caur Playwright actionability gaidīšanu.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await signIn(page);
  await page.goto("/");

  await page.locator(".lobbySlotsButton").click();
  await page.getByRole("button", { name: "Spin", exact: true }).waitFor({ timeout: 90_000 });

  await page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>(".slotsCloseButton")?.click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    document.querySelector<HTMLButtonElement>(".lobbySlotsButton")?.click();
  });

  const spin = page.getByRole("button", { name: "Spin", exact: true });
  await expect(spin).toBeEnabled({ timeout: 90_000 });

  const settled = page.waitForResponse(
    (response) => response.url().includes("/slots/spin") && response.request().method() === "POST"
  );
  await spin.press("Enter");
  expect((await settled).status()).toBe(200);
});

test("kompaktā izmērā ikona ir paslēpta un atvērts dialogs aizveras pats", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto("/");

  // Vispirms atver darbvirsmas izmērā...
  await page.locator(".lobbySlotsButton").click();
  await expect(page.getByRole("dialog", { name: "Domino Slots" })).toBeVisible();

  // ...tad sarauj logu zem kompaktā sliekšņa (`max-width: 820px`, `max-height: 680px`).
  await page.setViewportSize({ width: 900, height: 650 });

  // Divi slāņi: JS aizver dialogu, CSS paslēpj ikonu.
  await expect(page.getByRole("dialog", { name: "Domino Slots" })).toBeHidden();
  await expect(page.locator(".lobbySlotsButton")).toBeHidden();
});
