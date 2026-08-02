import { expect, test, type Page } from "@playwright/test";

import { PUBLIC_DOCUMENTS } from "../../apps/web/lib/publicDocuments";
import { PUBLIC_PAGES, PUBLIC_ROUTES, SITE_URL } from "../../apps/web/lib/site";
import { expectLocalPath, getLocal } from "./local-http";

// Atrodamības svīta ar IZSLĒGTU JavaScript (plāna 12.1).
//
// Kā šis atšķiras no jau esošajiem SEO testiem — tas ir vienīgais iemesls, kāpēc fails
// eksistē:
//
// - `metadata.spec.ts` un `structured-data.spec.ts` lasa NEAPSTRĀDĀTU HTTP atbildi. Tie
//   pierāda, ka pareizie baiti tiek nosūtīti.
// - ŠIS fails ielādē to pašu lapu ĪSTĀ pārlūkā ar `javaScriptEnabled: false` un pārbauda
//   REZULTĀTU. Tas sedz to, ko baiti nepierāda: vai saturs ir arī REDZAMS, vai `<h1>` ir
//   tikai viens renderētajā dokumentā, vai saites tiešām navigē bez JavaScript un vai
//   attēli reāli ielādējas.
//
// Tāpēc šeit netiek atkārtoti title/description/canonical/hreflang precīzo vērtību testi —
// tos jau sedz `metadata.spec.ts`. Šeit tiek pārbaudīts tikai tas, kas prasa renderēšanu.
//
// `page.evaluate()` darbojas arī ar izslēgtu JavaScript: Playwright to izpilda izolētā
// utility world, ko lapas JS aizliegums neietekmē. Empīriski pārbaudīts pirms rakstīšanas.
//
// Spēles sakne `/` ir iekļauta TIKAI ar vienu šauru testu: tā serverī renderē `.lobbyAbout` —
// apzināti rāpojamo tiltu uz publisko sadaļu (8.3), un `/` pati ir indeksējama. Spēles
// DARBĪBA bez JavaScript šeit netiek apgalvota: tai JavaScript ir funkcionāla prasība, nevis
// progresīvs uzlabojums, un pretēja prasība būtu nepatiesa.

test.use({ javaScriptEnabled: false });

/** Visi iekšējie `<a href>` renderētajā dokumentā, kā arī `<img>` src/alt pāri. */
async function collect(page: Page) {
  return page.evaluate(() => ({
    lang: document.documentElement.getAttribute("lang"),
    h1: [...document.querySelectorAll("h1")].map((el) => el.textContent?.trim() ?? ""),
    // Tikai iekšējās saites: ārējās (GitHub, YouTube) nav šī testa atbildība.
    links: [...document.querySelectorAll("a[href]")]
      .map((el) => el.getAttribute("href") ?? "")
      .filter((href) => href.startsWith("/")),
    images: [...document.querySelectorAll("img")].map((el) => ({
      src: el.getAttribute("src") ?? "",
      alt: el.getAttribute("alt"),
      // `naturalWidth > 0` pierāda, ka attēls tiešām ielādējās, nevis tikai deklarēts.
      loaded: el.naturalWidth > 0
    })),
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
      (el) => el.textContent ?? ""
    )
  }));
}

test.describe("publiskās lapas bez JavaScript", () => {
  for (const doc of PUBLIC_DOCUMENTS) {
    test(`${doc.path} — saturs, virsraksts un valoda renderējas serverī`, async ({ page }) => {
      const response = await page.goto(doc.path);
      // Kanoniskajai adresei jāatbild `200` TIEŠI, bez pāradresācijas ķēdes.
      expect(response?.status(), `${doc.path} statuss`).toBe(200);
      expect(new URL(page.url()).pathname, `${doc.path} nemainīja adresi`).toBe(doc.path);

      const dom = await collect(page);

      // `<html lang>` jau sākotnējā dokumentā, ne pēc hidratācijas (D5). Bez JS hidratācija
      // nekad nenotiek, tāpēc šī vērtība var nākt TIKAI no servera.
      expect(dom.lang, `${doc.path} html lang`).toBe(doc.locale);

      // Tieši viens `h1`: otrs paslēptos aiz pirmā, ja tests skatītos tikai uz pirmo.
      expect(dom.h1, `${doc.path} h1 skaits`).toHaveLength(1);
      expect(dom.h1[0]).toBe(doc.heading);
      await expect(page.locator("h1"), `${doc.path} h1 nav redzams`).toBeVisible();

      // Būtiskais teksts ir REDZAMS, ne tikai klāt DOM. Slieksnis ir čaulas-vs-satura
      // trauksmes stieple, nevis satura kontrakts: mazākā reālā lapa (`/en/about`) dod 862
      // rakstzīmes, tukša čaula dotu dažus desmitus. Precīzos tekstus sedz `publicContent`
      // unit testi un `metadata.spec.ts`.
      const main = page.locator("main.publicMain");
      await expect(main, `${doc.path} pamatteksts nav redzams`).toBeVisible();
      expect(
        (await main.innerText()).trim().length,
        `${doc.path} pamatteksts par īsu — lapa, iespējams, renderēta tukša`
      ).toBeGreaterThan(400);

      // Kur ievads eksistē (visur, izņemot `/rules`, kas saturu būvē no noteikumu
      // dokumenta), tam jābūt redzamam.
      const lead = page.locator(".publicLead");
      if ((await lead.count()) > 0) {
        await expect(lead, `${doc.path} ievads nav redzams`).toBeVisible();
        expect(
          (await lead.innerText()).trim().length,
          `${doc.path} ievads ir tukšs`
        ).toBeGreaterThan(40);
      }

      // JSON-LD ir parsējams jau bez JavaScript (satura, ne skaita pārbaude —
      // `structured-data.spec.ts` sedz precīzo mezglu sastāvu).
      expect(dom.jsonLd.length, `${doc.path} JSON-LD bloku skaits`).toBeGreaterThan(0);
      for (const block of dom.jsonLd) {
        expect(() => JSON.parse(block), `${doc.path} JSON-LD nav parsējams`).not.toThrow();
      }
    });
  }

  test("spēles sakne serverī renderē tiltu uz publisko sadaļu", async ({ page }) => {
    // `/` ir indeksējama, un `.lobbyAbout` ir tās APZINĀTI rāpojamais tilts uz publisko
    // sadaļu (8.3). Pati spēle bez JavaScript nedarbojas, un to šeit neviens neapgalvo —
    // pārbaudīts tiek TIKAI tilts, kas nāk no servera. Bez šī testa klienta-tikai
    // renderēšanas regresija to varētu noņemt, un visi pārējie testi paliktu zaļi.
    const response = await page.goto("/");
    expect(response?.status(), "/ statuss").toBe(200);

    const about = page.locator(".lobbyAbout");
    await expect(about).toHaveCount(1);
    await about.scrollIntoViewIfNeeded();
    await expect(about).toBeVisible();
    expect((await about.innerText()).trim().length, "tilta bloks ir tukšs").toBeGreaterThan(20);

    // Tieši piecas saites uz tās pašas valodas publiskajām lapām — kopu vienādība, nevis
    // skaits: piecas dublētas derīgi izskatošās adreses citādi izietu cauri.
    const hrefs = await about.locator("a[href]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href") ?? "")
    );
    const expected = PUBLIC_PAGES.map((page) => PUBLIC_ROUTES.en[page]);
    expect([...hrefs].sort(), "lobija publisko saišu kopa").toEqual([...expected].sort());
  });

  test("katrā lapā ir pilna, rāpojama navigācija uz visām publiskajām lapām", async ({ page }) => {
    for (const doc of PUBLIC_DOCUMENTS) {
      await page.goto(doc.path);
      const { links } = await collect(page);

      // Katra tās pašas valodas publiskā lapa ir sasniedzama ar parastu `<a href>`.
      for (const target of PUBLIC_PAGES) {
        expect(links, `${doc.path} trūkst saites uz ${target}`).toContain(
          PUBLIC_ROUTES[doc.locale][target]
        );
      }
      // Saite uz otru valodu un uz spēli.
      expect(links, `${doc.path} trūkst saites uz spēli`).toContain("/");

      for (const href of links) expectLocalPath(href);
    }
  });

  test("saites tiešām navigē bez JavaScript", async ({ page }) => {
    // Rāpojamība nav tikai `href` esamība DOM: ja navigācija būtu piesieta JS klausītājam,
    // `href` varētu būt pareizs, bet klikšķis nedarītu neko. Ar izslēgtu JS to var pierādīt.
    await page.goto(PUBLIC_ROUTES.en.home);
    await page.locator(`.publicNav a[href="${PUBLIC_ROUTES.en.rules}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${PUBLIC_ROUTES.en.rules}$`));

    // Valodas saite pārved uz to pašu lapu otrā valodā, nevis uz sākumlapu.
    await page.locator(".publicLangLink").click();
    await expect(page).toHaveURL(new RegExp(`${PUBLIC_ROUTES.lv.rules}$`));
    expect(await page.locator("html").getAttribute("lang")).toBe("lv");
  });

  test("attēliem ir alt teksts, un tie ielādējas arī bez JavaScript", async ({ page }) => {
    let checked = 0;
    for (const doc of PUBLIC_DOCUMENTS) {
      await page.goto(doc.path);

      // Ekrānattēli ir `loading="lazy"`, tāpēc uzreiz pēc ielādes `naturalWidth` vēl var būt
      // `0` — pārbaude bez šī soļa būtu sacīkste, nevis apgalvojums. Katrs attēls tiek
      // ieritināts skatā, un pēc tam tiek gaidīts, līdz visi ir `complete`.
      const images = page.locator("main.publicMain img");
      for (let index = 0; index < (await images.count()); index += 1) {
        await images.nth(index).scrollIntoViewIfNeeded();
      }
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              [...document.querySelectorAll("main.publicMain img")].every(
                (img) => (img as HTMLImageElement).complete
              )
            ),
          { message: `${doc.path} attēli neieladējās noteiktajā laikā` }
        )
        .toBe(true);

      for (const image of (await collect(page)).images) {
        expect(image.src, `${doc.path} attēls bez src`).not.toBe("");
        // `alt=""` ir derīgs dekoratīvam attēlam, bet šie ir satura ekrānattēli — tukšs alt
        // tiem nozīmētu, ka nezinošam lietotājam saturs pazūd.
        expect((image.alt ?? "").trim().length, `${doc.path} attēls bez alt: ${image.src}`)
          .toBeGreaterThan(0);
        expect(image.loaded, `${doc.path} attēls neielādējās: ${image.src}`).toBe(true);
        checked += 1;
      }
    }
    // Sarga sargs: ja ekrānattēli kādreiz pazustu, cikls būtu tukšs un tests zaļš par neko.
    expect(checked, "nevienā publiskajā lapā nav attēlu").toBeGreaterThan(0);
  });

  test("slīpsvītras variants novirza uz canonical ar VIENU pāradresāciju", async ({ request }) => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const withSlash = `${doc.path}/`;
      expectLocalPath(withSlash);

      const baseURL = test.info().project.use.baseURL!;
      const response = await request.get(new URL(withSlash, baseURL).href, { maxRedirects: 0 });

      // Viena pāradresācija, ne ķēde: `maxRedirects: 0` atgriež pašu `3xx`.
      expect(response.status(), `${withSlash} statuss`).toBeGreaterThanOrEqual(300);
      expect(response.status(), `${withSlash} statuss`).toBeLessThan(400);

      // Mērķis ir tieši canonical ceļš — konsekventi ar to, ko izdod `<link rel=canonical>`
      // un sitemap. Salīdzina `pathname`, jo `Location` var būt relatīva vai absolūta.
      const location = response.headers()["location"] ?? "";
      const target = new URL(location, baseURL).pathname;
      expect(target, `${withSlash} Location`).toBe(doc.path);

      // 12.1 pēdējā punkta kodols: novirzes mērķis un CANONICAL ir viens un tas pats ceļš,
      // nevis divas atšķirīgas "pareizās" formas. Bez šī abas puses varētu būt iekšēji
      // konsekventas un tomēr norādīt uz dažādām adresēm.
      expect(new URL(doc.url).pathname, `${doc.path} canonical ceļš`).toBe(target);
      expect(new URL(doc.url).origin).toBe(SITE_URL.origin);

      // Un mērķis pats atbild `200` bez tālākas pāradresācijas.
      await getLocal(request, doc.path);
    }
  });
});
