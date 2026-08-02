import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { GAME_ENTITY_ID } from "../../apps/web/lib/gameStructuredData";
import { getScreenshots } from "../../apps/web/lib/publicContent";
import { PUBLIC_DOCUMENTS } from "../../apps/web/lib/publicDocuments";
import { GAME_PATH, GITHUB_REPO_URL, INDEXED_LOCALES, SITE_URL } from "../../apps/web/lib/site";
import { getLocal } from "./local-http";

const SCREENSHOT_SLUGS = getScreenshots("en").map((image) => image.slug);

// Strukturēto datu e2e (10.4). Unit testi (`gameStructuredData`, `pageStructuredData`)
// pārbauda VEIDOTĀJUS; šis pārbauda to, kas reāli nonāk piegādātajā HTML.
//
// Atšķirība nav formāla: veidotāju testi neredzētu ne pazudušu izvades punktu, ne CITU
// komponentu, kas pievieno savu JSON-LD ar `review` vai `FAQPage`. Tāpēc šeit apgalvojumi
// ir par VISIEM dokumentā atrastajiem blokiem, ne par vienu funkcijas rezultātu.
//
// Parsē VISU dokumentu, ne tikai `<head>`: JSON-LD tiek renderēts `<body>` iekšienē.
// `DOMParser` skriptus neizpilda, un `script[type="application/ld+json"]` atlase dabiski
// izslēdz Next.js RSC flight payload, kas ir parastos `<script>` tagos.

type Delivered = {
  /** Neapstrādāti bloku teksti — `JSON.parse` notiek testā, lai kļūda nosauktu maršrutu. */
  readonly raw: readonly string[];
  /** Lapā REDZAMAIS ievadteksts (`.publicLead`), ja tāds ir. */
  readonly lead: string | null;
  /** Canonical NO TĀS PAŠAS atbildes — citādi salīdzinājums būtu starp diviem dokumentiem. */
  readonly canonical: string | null;
};

const PUBLIC_PATHS = PUBLIC_DOCUMENTS.map((doc) => doc.path);
const HOME_PATHS = INDEXED_LOCALES.map(
  (locale) => PUBLIC_DOCUMENTS.find((doc) => doc.locale === locale && doc.page === "home")!.path
);

const cache = new Map<string, Delivered>();

async function delivered(
  request: APIRequestContext,
  page: Page,
  path: string
): Promise<Delivered> {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;

  const html = await (await getLocal(request, path)).text();
  const result = await page.evaluate((raw) => {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    return {
      raw: [...doc.querySelectorAll('script[type="application/ld+json"]')].map(
        (script) => script.textContent ?? ""
      ),
      lead: doc.querySelector(".publicLead")?.textContent ?? null,
      canonical: doc.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null
    };
  }, html);

  cache.set(path, result);
  return result;
}

/** Parsē katru bloku, nosaucot maršrutu un bloka indeksu, ja tas nav derīgs JSON. */
function parseBlocks(path: string, { raw }: Delivered): unknown[] {
  return raw.map((text, index) => {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`${path} JSON-LD bloks #${index} nav derīgs JSON: ${String(error)}`);
    }
  });
}

function nodesOfType(blocks: readonly unknown[], type: string): Record<string, unknown>[] {
  return blocks.filter((block): block is Record<string, unknown> => {
    if (block === null || typeof block !== "object") return false;
    const value = (block as Record<string, unknown>)["@type"];
    return Array.isArray(value) ? value.includes(type) : value === type;
  });
}

/** Visas atslēgas jebkurā dziļumā — aizliegto lauku meklēšanai. */
function deepKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(deepKeys);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, nested]) => [key.toLowerCase(), ...deepKeys(nested)]);
  }
  return [];
}

function deepStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(deepStrings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(deepStrings);
  return [];
}

test.describe("strukturētie dati piegādātajā HTML", () => {
  test("katrs bloks ir derīgs JSON un serverī jau renderēts", async ({ request, page }) => {
    for (const path of [...PUBLIC_PATHS, GAME_PATH]) {
      const data = await delivered(request, page, path);
      // Bloki nāk no sākotnējās HTTP atbildes, tāpēc to klātbūtne pati par sevi pierāda,
      // ka tie ir renderēti serverī, nevis pievienoti ar JavaScript.
      const blocks = parseBlocks(path, data);
      for (const [index, block] of blocks.entries()) {
        expect(typeof block, `${path} bloks #${index} tips`).toBe("object");
        expect(block, `${path} bloks #${index}`).not.toBeNull();
        expect((block as Record<string, unknown>)["@context"], `${path} bloks #${index}`).toBe(
          "https://schema.org"
        );
      }
    }
  });

  test("bloku skaits katrā maršrutā ir tieši gaidītais", async ({ request, page }) => {
    // Sākumlapās ir divi (lapa + spēles entītija), pārējās publiskajās viens, spēles
    // čaulā `/` neviens. Dublēts bloks sašķeltu entītiju un paliktu citādi nepamanīts.
    for (const path of PUBLIC_PATHS) {
      const expected = HOME_PATHS.includes(path) ? 2 : 1;
      expect((await delivered(request, page, path)).raw, `${path} bloku skaits`).toHaveLength(
        expected
      );
    }
    expect((await delivered(request, page, GAME_PATH)).raw, "/ bloku skaits").toHaveLength(0);
  });

  test("katrai publiskajai lapai ir tieši viens WebPage ar pareizajiem laukiem", async ({
    request,
    page
  }) => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const blocks = parseBlocks(doc.path, await delivered(request, page, doc.path));
      const pages = nodesOfType(blocks, "WebPage");
      expect(pages, `${doc.path} WebPage skaits`).toHaveLength(1);

      const node = pages[0]!;
      expect(node["@id"]).toBe(`${doc.url}#webpage`);
      expect(node["url"]).toBe(doc.url);
      expect(node["name"]).toBe(doc.title);
      expect(node["description"]).toBe(doc.description);
      expect(node["inLanguage"]).toBe(doc.locale);
      expect(node["about"]).toEqual({ "@id": GAME_ENTITY_ID });

      // Precīza atslēgu kopa PIEGĀDĀTAJĀ mezglā. Bez tās jauns lauks (piem. `logo` vai
      // `contentUrl`) parādītos klusi, un adrešu tests to nepārbaudītu, jo tā nosaukuma
      // tā sarakstā nav. Tagad jebkurš jauns lauks liek testam krist un prasa lēmumu.
      expect(Object.keys(node).sort()).toEqual(
        ["@context", "@id", "@type", "about", "description", "inLanguage", "name", "url"].sort()
      );
    }
  });

  test("WebPage.url sakrīt ar canonical TAJĀ PAŠĀ atbildē", async ({ request, page }) => {
    // Canonical un JSON-LD nāk no VIENAS atbildes, ne no diviem pieprasījumiem: citādi
    // tests salīdzinātu divus dažādus dokumentus un „sakritība" neko nepierādītu.
    for (const doc of PUBLIC_DOCUMENTS) {
      const data = await delivered(request, page, doc.path);
      expect(data.canonical, `${doc.path} canonical`).not.toBeNull();
      const blocks = parseBlocks(doc.path, data);
      expect(nodesOfType(blocks, "WebPage")[0]!["url"], `${doc.path} url vs canonical`).toBe(
        data.canonical
      );
    }
  });

  test("spēles entītija ir tikai sākumlapās un ar obligātajiem laukiem", async ({
    request,
    page
  }) => {
    for (const path of [...PUBLIC_PATHS, GAME_PATH]) {
      const blocks = parseBlocks(path, await delivered(request, page, path));
      const games = nodesOfType(blocks, "VideoGame");
      if (!HOME_PATHS.includes(path)) {
        expect(games, `${path} spēles entītija`).toHaveLength(0);
        continue;
      }

      expect(games, `${path} spēles entītija`).toHaveLength(1);
      const game = games[0]!;
      expect(game["@type"]).toEqual(["VideoGame", "WebApplication"]);
      // Viens un tas pats `@id` abās valodās — tas sasaista valodu versijas.
      expect(game["@id"]).toBe(GAME_ENTITY_ID);
      expect(game["name"]).toBe("Domino Poker");
      expect(game["url"]).toBe(new URL(GAME_PATH, SITE_URL).href);
      expect(game["applicationCategory"]).toBe("GameApplication");
      expect(game["operatingSystem"]).toBe("Any");
      expect(game["isAccessibleForFree"]).toBe(true);
      // `price` bez `priceCurrency` ir validācijas kļūda.
      expect(game["offers"]).toEqual({ "@type": "Offer", price: "0", priceCurrency: "EUR" });
      // Precīzas vērtības, ne tikai klātbūtne: pazudis `playMode` vai `sameAs` citādi
      // izietu cauri gan unit testiem, gan pārējiem šī faila testiem.
      expect(game["playMode"]).toEqual([
        "https://schema.org/SinglePlayer",
        "https://schema.org/MultiPlayer"
      ]);
      expect(game["sameAs"]).toEqual([GITHUB_REPO_URL]);
      expect(game["image"]).toEqual(
        SCREENSHOT_SLUGS.map((slug) => new URL(`/images/${slug}-1440.webp`, SITE_URL).href)
      );

      // Tāpat kā `WebPage`: jauns lauks nedrīkst parādīties bez apzināta lēmuma.
      expect(Object.keys(game).sort()).toEqual(
        [
          "@context",
          "@id",
          "@type",
          "applicationCategory",
          "description",
          "image",
          "isAccessibleForFree",
          "name",
          "offers",
          "operatingSystem",
          "playMode",
          "sameAs",
          "url"
        ].sort()
      );
    }
  });

  test("spēles entītijas apraksts sakrīt ar lapā REDZAMO ievadu", async ({ request, page }) => {
    // Fāzes 4 pieņemšanas kritērijs prasa, lai strukturētie dati saturiski atbilstu
    // redzamajai lapai. Šis to arī pārbauda pret redzamo tekstu, nevis pret kontraktu.
    for (const path of HOME_PATHS) {
      const data = await delivered(request, page, path);
      const game = nodesOfType(parseBlocks(path, data), "VideoGame")[0]!;
      expect(data.lead, `${path} redzamais ievads`).not.toBeNull();
      expect(game["description"], `${path} apraksts pret redzamo tekstu`).toBe(data.lead);
    }
  });

  test("nekur nav izdomātu rating/review, FAQPage vai breadcrumb datu", async ({
    request,
    page
  }) => {
    // Apgalvojums ir par VISU dokumentu, ne par vienu veidotāju: ja kāds cits komponents
    // pievienotu savu bloku ar vērtējumu, šis tests to noķertu, bet unit tests ne.
    const forbidden = ["aggregaterating", "review", "reviews", "ratingvalue", "breadcrumb"];
    for (const path of [...PUBLIC_PATHS, GAME_PATH]) {
      const data = await delivered(request, page, path);
      const blocks = parseBlocks(path, data);

      const keys = deepKeys(blocks);
      for (const key of forbidden) {
        expect(keys, `${path} aizliegta atslēga ${key}`).not.toContain(key);
      }
      const types = deepStrings(blocks);
      expect(types, `${path} FAQPage`).not.toContain("FAQPage");
      expect(types, `${path} BreadcrumbList`).not.toContain("BreadcrumbList");
    }
  });

  test("katrs adreses lauks ir absolūta HTTPS adrese", async ({ request, page }) => {
    // Vāc ADRESES LAUKUS pēc nosaukuma, nevis filtrē virknes, kas jau sākas ar `http`.
    // Filtrs klusi izlaistu tieši to defektu, ko meklējam: relatīvu `/attels.webp` vai
    // shēmrelatīvu `//www.piemers.lv/x` — tie vienkārši pazustu pirms pārbaudes.
    const URL_FIELDS = ["@id", "url", "image", "sameAs", "playMode"];

    const collect = (value: unknown, insideUrlField = false): string[] => {
      if (typeof value === "string") return insideUrlField ? [value] : [];
      if (Array.isArray(value)) return value.flatMap((item) => collect(item, insideUrlField));
      if (value !== null && typeof value === "object") {
        return Object.entries(value).flatMap(([key, nested]) =>
          collect(nested, insideUrlField || URL_FIELDS.includes(key))
        );
      }
      return [];
    };

    // Tikai publiskās lapas: `/` apzināti neizdod nevienu bloku, tāpēc tur nav ko pārbaudīt.
    for (const path of PUBLIC_PATHS) {
      const urls = collect(parseBlocks(path, await delivered(request, page, path)));
      expect(urls.length, `${path} adrešu skaits`).toBeGreaterThan(0);

      for (const url of urls) {
        // Absolūta JAU KĀ VIRKNE: `new URL(url)` bez bāzes izmet kļūdu relatīvam ceļam,
        // tāpēc relatīva adrese te krīt, nevis tiek klusi izlaista.
        expect(url, `${path} ${url} nav absolūta`).toMatch(/^https:\/\//);
        expect(new URL(url).protocol, `${path} ${url}`).toBe("https:");
        // `schema.org` vārdnīcas adreses ir likumīgi ārējas; pārējām jābūt mūsu domēnā
        // vai oficiālajā profilā (GitHub), nekad ar `www.`.
        expect(new URL(url).hostname, `${path} ${url}`).not.toMatch(/^www\./);
      }
      // Vismaz vienai adresei jābūt uz mūsu produkcijas domēnu.
      expect(urls.some((url) => new URL(url).origin === SITE_URL.origin)).toBe(true);
    }
  });
});
