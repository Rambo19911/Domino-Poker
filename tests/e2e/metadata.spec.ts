import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { PUBLIC_DOCUMENTS } from "../../apps/web/lib/publicDocuments";
import { GAME_PATH, INDEXED_LOCALES, SITE_URL, X_DEFAULT_LOCALE } from "../../apps/web/lib/site";
import { LOCAL_HOSTNAME, getLocal } from "./local-http";

// Metadatu e2e. Unit testi (`publicDocuments`, `publicMetadata`) pārbauda kontraktu un
// palīgfunkciju; ŠIS tests pārbauda, ka lietotājam un rāpotājam reāli PIEGĀDĀTAIS HTML
// tam atbilst — tātad arī Next.js renderēšanu un maršrutu pievadu kopā.
//
// Četri apzināti lēmumi:
//
// 1. **Lasa neapstrādātu HTTP atbildi, nevis hidratētu DOM.** Rāpotājs redz sākotnējo
//    dokumentu. `page.goto()` + `locator` iet cauri arī tad, ja metadati parādītos tikai
//    pēc JavaScript; `request.get()` to nepieļauj.
// 2. **Parsē ar `DOMParser`, ne ar regulārām izteiksmēm.** Jau paņemtā virkne tiek nodota
//    `DOMParser`, kas skriptus NEIZPILDA, bet saprot HTML kontekstu: tags komentārā vai
//    inline skripta tekstā vairs nevar uzdoties par īstu. Ar roku rakstīts parsētājs to
//    nespēj, un tieši tur jau tika atrastas divas klusās caurlaides.
//    `document.head` arī dabiski izslēdz Next.js RSC flight payload, kas `<body>` beigās
//    tos pašus metadatus atkārto JSON veidā.
// 3. **Testi nepieprasa produkciju.** Canonical adreses ir absolūtas
//    `https://domino-poker.com/...`, bet tās tiek pārbaudītas kā VIRKNES; pieejamību
//    pārbauda tikai `new URL(u).pathname` pret lokālo `baseURL`. Ceļa lokalitāte tiek
//    pārbaudīta PIRMS izsūtīšanas, un pieprasījumi iet ar `maxRedirects: 0`.
// 4. **Apgalvojumi ir par KOPĀM ar precīzu kardinalitāti.** Otrs `robots` tags ar
//    `noindex` vai dublēts `hreflang` paslēptos aiz pareizā, ja tests skatītos tikai pirmo.
//
// Gaidāmās vērtības NETIEK ierakstītas atkārtoti — tās nāk no tā paša maršrutu un satura
// reģistra, ko lieto lapas. Citādi testam būtu sava, patstāvīgi novecojoša URL kopija.

type MetaTag = { readonly name: string; readonly content: string };
type AlternateTag = { readonly hreflang: string; readonly href: string };

type HeadTags = {
  readonly titles: readonly string[];
  readonly descriptions: readonly string[];
  readonly canonicals: readonly string[];
  readonly alternates: readonly AlternateTag[];
  /** `robots` UN rāpotājam specifiskie (`googlebot`, `bingbot`, ...) tagi. */
  readonly robotsDirectives: readonly MetaTag[];
  readonly keywordsCount: number;
  /** Visi `<meta name="…">` — `twitter:*` kartītes lieto `name`. */
  readonly names: readonly MetaTag[];
  /**
   * `<meta property="…">` — Open Graph lieto `property`, nevis `name`, tāpēc tie
   * NEPARĀDĀS `names` savākumā un jālasa atsevišķi.
   */
  readonly properties: readonly MetaTag[];
};

/** Visas indeksējamās adreses: spēles čaula + 10 EN/LV publiskās lapas. */
const INDEXABLE_PATHS: readonly string[] = [
  GAME_PATH,
  ...PUBLIC_DOCUMENTS.map((doc) => doc.path)
];


/**
 * Parsē JAU PAŅEMTU HTML virkni pārlūkā ar `DOMParser`. Lapa netiek navigēta uz šo saturu
 * un skripti netiek izpildīti — `parseFromString` tos neizpilda pēc specifikācijas.
 */
async function parseHead(page: Page, html: string): Promise<HeadTags> {
  return page.evaluate((raw) => {
    const head = new DOMParser().parseFromString(raw, "text/html").head;

    const metas = [...head.querySelectorAll("meta[name]")].map((meta) => ({
      name: (meta.getAttribute("name") ?? "").toLowerCase(),
      content: meta.getAttribute("content") ?? ""
    }));
    const properties = [...head.querySelectorAll("meta[property]")].map((meta) => ({
      name: (meta.getAttribute("property") ?? "").toLowerCase(),
      content: meta.getAttribute("content") ?? ""
    }));
    const links = [...head.querySelectorAll("link[rel]")].map((link) => ({
      rel: (link.getAttribute("rel") ?? "").toLowerCase(),
      href: link.getAttribute("href") ?? "",
      hreflang: link.getAttribute("hreflang")
    }));

    return {
      titles: [...head.querySelectorAll("title")].map((title) => title.textContent ?? ""),
      descriptions: metas.filter((m) => m.name === "description").map((m) => m.content),
      canonicals: links.filter((l) => l.rel === "canonical").map((l) => l.href),
      alternates: links
        .filter((l) => l.rel === "alternate" && l.hreflang !== null)
        .map((l) => ({ hreflang: l.hreflang!.toLowerCase(), href: l.href })),
      // `robots` un rāpotājam specifiskie tagi. Next.js metadatu API izdod tikai `robots`
      // un `googlebot`, tāpēc tā ir reālā virsma; `bot` apakšvirkne ir platāks drošības
      // tīkls (`bingbot`, `msnbot`). Saturs tiek pārveidots mazajos burtos, jo direktīvas
      // ir reģistrnejutīgas — `NOINDEX` skaitās tikpat lielā mērā kā `noindex`.
      robotsDirectives: metas
        .filter((m) => m.name === "robots" || m.name.includes("bot"))
        .map((m) => ({ name: m.name, content: m.content.toLowerCase() })),
      keywordsCount: metas.filter((m) => m.name === "keywords").length,
      names: metas,
      properties
    };
  }, html);
}

// `workers: 1` un `fullyParallel: false`, tāpēc viens kešs uz visu failu ir drošs:
// 11 lapas tiek ielādētas vienu reizi, nevis atkārtoti katrā apgalvojumā. Kešs glabā
// tikai jau parsētus, nemaināmus datus.
const cache = new Map<string, HeadTags>();

async function headTags(request: APIRequestContext, page: Page, path: string): Promise<HeadTags> {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;

  const parsed = await parseHead(page, await (await getLocal(request, path)).text());
  cache.set(path, parsed);
  return parsed;
}

test.describe("publisko lapu metadati piegādātajā HTML", () => {
  for (const doc of PUBLIC_DOCUMENTS) {
    test(`${doc.path} — nosaukums, apraksts, canonical un valodu kopa`, async ({
      request,
      page
    }) => {
      const head = await headTags(request, page, doc.path);

      expect(head.titles).toEqual([doc.title]);
      expect(head.descriptions).toEqual([doc.description]);

      // Tieši viens canonical, un tas kanonizējas pats uz sevi, nevis uz angļu versiju.
      expect(head.canonicals).toEqual([doc.url]);

      // Tieši trīs alternatīvas, katra valoda tikai vienreiz. Dublēts `hreflang` ar citu
      // adresi citādi paslēptos aiz pareizā ieraksta.
      expect(head.alternates).toHaveLength(INDEXED_LOCALES.length + 1);
      const byLang = new Map(head.alternates.map((alt) => [alt.hreflang, alt.href]));
      expect(byLang.size).toBe(head.alternates.length);
      expect([...byLang.keys()].sort()).toEqual([...INDEXED_LOCALES, "x-default"].sort());

      for (const locale of INDEXED_LOCALES) {
        expect(byLang.get(locale)).toBe(doc.alternates[locale]);
      }
      // Paš-atsauce: lapa ir arī pati savā `hreflang` kopā.
      expect(byLang.get(doc.locale)).toBe(doc.url);
      // `x-default` ir TĀS PAŠAS lapas angļu versija, nevis sākumlapa.
      expect(byLang.get("x-default")).toBe(doc.alternates[X_DEFAULT_LOCALE]);
    });
  }

  test("EN un LV versijas norāda viena uz otru", async ({ request, page }) => {
    // Google ignorē `hreflang`, ja abas lapas nenorāda viena uz otru.
    for (const doc of PUBLIC_DOCUMENTS) {
      const counterpart = PUBLIC_DOCUMENTS.find(
        (candidate) => candidate.page === doc.page && candidate.locale !== doc.locale
      );
      expect(counterpart, `${doc.path} pārinieks`).toBeDefined();

      const here = await headTags(request, page, doc.path);
      const there = await headTags(request, page, counterpart!.path);
      const hrefFor = (head: HeadTags, lang: string) =>
        head.alternates.find((alt) => alt.hreflang === lang)?.href;

      expect(hrefFor(here, counterpart!.locale)).toBe(counterpart!.url);
      expect(hrefFor(there, doc.locale)).toBe(doc.url);
    }
  });

  test("spēles sakne `/` paliek ārpus hreflang kopas", async ({ request, page }) => {
    const head = await headTags(request, page, GAME_PATH);
    expect(head.alternates).toEqual([]);
    expect(head.canonicals).toHaveLength(1);
    expect(new URL(head.canonicals[0]!).origin).toBe(SITE_URL.origin);
  });

  test("nevienā lapā nav divu vienādu title/description pāru", async ({ request, page }) => {
    const pairs: string[] = [];
    for (const path of INDEXABLE_PATHS) {
      const head = await headTags(request, page, path);
      expect(head.titles, `${path} nosaukumu skaits`).toHaveLength(1);
      expect(head.descriptions, `${path} aprakstu skaits`).toHaveLength(1);
      pairs.push(`${head.titles[0]}|${head.descriptions[0]}`);
    }
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  test("neviena publiskā lapa nav noindex un nesatur keywords", async ({ request, page }) => {
    for (const path of INDEXABLE_PATHS) {
      const head = await headTags(request, page, path);

      // `robots` taga TRŪKUMS ir atļauts — noklusējums ir index/follow. Aizliegts ir
      // `noindex`/`none` JEBKURĀ no tagiem, arī rāpotājam specifiskajos.
      for (const directive of head.robotsDirectives) {
        expect(directive.content, `${path} ${directive.name}`).not.toContain("noindex");
        expect(directive.content, `${path} ${directive.name}`).not.toContain("none");
      }
      expect(head.keywordsCount, `${path} keywords tagu skaits`).toBe(0);
    }
  });

  test("canonical ir absolūts HTTPS bez www un tā pathname lokāli atgriež 200", async ({
    request,
    page
  }) => {
    for (const path of INDEXABLE_PATHS) {
      const head = await headTags(request, page, path);
      expect(head.canonicals, `${path} canonical skaits`).toHaveLength(1);

      const canonical = head.canonicals[0]!;
      // Produkcijas izcelsmi pārbauda kā VIRKNI...
      expect(canonical.startsWith("https://domino-poker.com")).toBe(true);
      expect(new URL(canonical).hostname).toBe("domino-poker.com");
      expect(new URL(canonical).protocol).toBe("https:");

      // ...bet pieejamību tikai pret lokālo `baseURL`. `getLocal` pārbauda ceļa lokalitāti
      // pirms izsūtīšanas un neļauj pāradresācijai aizvest projām.
      await getLocal(request, new URL(canonical).pathname);
    }
  });

  test("canonical kopa sakrīt ar sitemap paredzēto adrešu kopu", async ({ request, page }) => {
    // Sitemap tiek ģenerēts tikai Fāzē 5 (11.2). Šeit tiek fiksēta PAREDZĒTĀ kopa no tā
    // paša reģistra, no kura sitemap to vēlāk ņems; 11.3 salīdzinās reālo izvadi.
    //
    // Normalizē TIKAI tukšu saknes ceļu (`https://domino-poker.com` -> `.../`), ko dara
    // `new URL().href`. Beigu slīpsvītra ne-saknes ceļiem NETIEK ignorēta: `/en` un
    // `/en/` ir dažādi URL.
    const intended = new Set(INDEXABLE_PATHS.map((path) => new URL(path, SITE_URL).href));

    const served = new Set<string>();
    for (const path of INDEXABLE_PATHS) {
      const head = await headTags(request, page, path);
      served.add(new URL(head.canonicals[0]!).href);
    }

    expect([...served].sort()).toEqual([...intended].sort());
  });

  test("katra lapa izdod tieši vienu absolūtu og:image ar alt un izmēriem", async ({
    request,
    page
  }) => {
    for (const path of INDEXABLE_PATHS) {
      const props = (await headTags(request, page, path)).properties;
      const valuesOf = (name: string) =>
        props.filter((p) => p.name === name).map((p) => p.content);

      const images = valuesOf("og:image");
      expect(images, `${path} og:image skaits`).toHaveLength(1);

      // Absolūta produkcijas adrese: relatīvu ceļu kopīgošanas robots neatrisina.
      const image = images[0]!;
      expect(new URL(image).origin, `${path} og:image izcelsme`).toBe("https://domino-poker.com");
      expect(new URL(image).protocol).toBe("https:");

      // Bez `alt` attēls ir nepieejams tiem, kas to neredz.
      expect(valuesOf("og:image:alt"), `${path} og:image:alt`).toHaveLength(1);
      expect(valuesOf("og:image:alt")[0]!.length).toBeGreaterThan(40);

      expect(valuesOf("og:image:width")).toEqual(["1200"]);
      expect(valuesOf("og:image:height")).toEqual(["630"]);

      // Attēls patiešām ir pieejams — pathname pret lokālo serveri, nevis produkciju.
      await getLocal(request, new URL(image).pathname);
    }
  });

  test("visas lapas izdod lielo Twitter kartīti, kas atbilst Open Graph", async ({
    request,
    page
  }) => {
    // `twitter:*` Next.js izdod ar `name`, nevis `property`. SVARĪGI: ja `twitter` bloks
    // nav norādīts, Next.js šos laukus ATVASINA no `openGraph` (un izvēlas
    // `summary_large_image`, tiklīdz ir attēls). Tāpēc kartīte ir arī publiskajām lapām,
    // kurām sava `twitter` konfigurācija nav — tas ir tieši tas, ko šis tests notur.
    for (const path of INDEXABLE_PATHS) {
      const head = await headTags(request, page, path);
      const named = (name: string) =>
        head.names.filter((meta) => meta.name === name).map((meta) => meta.content);
      const property = (name: string) =>
        head.properties.filter((meta) => meta.name === name).map((meta) => meta.content);

      expect(named("twitter:card"), `${path} twitter:card`).toEqual(["summary_large_image"]);

      // Vispirms KLĀTBŪTNE, tikai tad sakritība: divas tukšas kopas savā starpā ir vienādas,
      // tāpēc bez šī apgalvojuma pilnīgi pazuduši tagi izietu cauri kā „sakrīt".
      for (const tag of ["og:title", "og:description", "og:image", "og:image:alt"]) {
        expect(property(tag), `${path} ${tag}`).toHaveLength(1);
      }

      // Kartītei jāsakrīt ar Open Graph, citādi divi kopīgošanas kanāli rādītu dažādu saturu.
      expect(named("twitter:title"), `${path} twitter:title`).toEqual(property("og:title"));
      expect(named("twitter:description"), `${path} twitter:description`).toEqual(
        property("og:description")
      );
      expect(named("twitter:image"), `${path} twitter:image`).toEqual(property("og:image"));
      expect(named("twitter:image:alt"), `${path} twitter:image:alt`).toEqual(
        property("og:image:alt")
      );
    }
  });

  test("neviens HTTP pieprasījums neiet uz produkciju", async ({ page }) => {
    // Apgalvojumi satur absolūtas produkcijas adreses, tāpēc šī ir tieša pārbaude, ka
    // neviena no tām netiek arī IELĀDĒTA. Ne-lokālie pieprasījumi tiek APTURĒTI pirms
    // izsūtīšanas, ne tikai pierakstīti.
    //
    // TVĒRUMS: `page.route` sedz HTTP(S) pieprasījumus. WebSocket savienojumi un
    // service worker apkalpotie pieprasījumi tam neiet cauri; SW šajā vidē nav reģistrēts,
    // un publiskās lapas WS neatver. Dzīvā hosta pārbaudes notiek tikai Fāzē 8.
    const blocked: string[] = [];
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith("data:") || new URL(url).hostname === LOCAL_HOSTNAME) {
        await route.continue();
        return;
      }
      blocked.push(url);
      await route.abort();
    });

    for (const path of INDEXABLE_PATHS) {
      await page.goto(path);
    }
    expect(blocked).toEqual([]);
  });
});
