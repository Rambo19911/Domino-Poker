import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { PUBLIC_DOCUMENTS } from "../../apps/web/lib/publicDocuments";
import { GAME_PATH, SITE_URL } from "../../apps/web/lib/site";
import { getLocal } from "./local-http";

// Rāpotāju failu e2e (11.3). Unit testi (`robots.test.ts`, `sitemap.test.ts`) pārbauda
// FUNKCIJU ATGRIEZTOS OBJEKTUS; šis tests pārbauda to, ko rāpotājs reāli saņem pa vadu.
//
// Tieši tāpēc `robots.txt` te tiek PARSĒTS no teksta, nevis importēts kā `robots()`.
// Imports apietu Next.js serializācijas slāni — vienīgo, kura dēļ šis fails eksistē.
// Serializators var mainīt grupu secību, apvienot rindas vai pazaudēt direktīvu, un
// objekta līmeņa tests to nekad neieraudzītu.
//
// Pieprasījumi iet caur `getLocal()`: ceļa lokalitāte tiek pārbaudīta PIRMS izsūtīšanas,
// `maxRedirects: 0` un `status === 200`. Tāpēc "nav pāradresācijas ķēdes" netiek
// apgalvots atsevišķi — tā ir tā paša izsaukuma tiešā sekas (9.3).

const ROBOTS_PATH = "/robots.txt";
const SITEMAP_PATH = "/sitemap.xml";
const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";

/** Paredzētās indeksējamās adreses no maršrutu reģistra — sitemap tās nedrīkst pārsniegt. */
const EXPECTED_URLS = [GAME_PATH, ...PUBLIC_DOCUMENTS.map((doc) => doc.path)].map(
  (path) => new URL(path, SITE_URL).href
);

type RobotsGroup = {
  readonly agents: readonly string[];
  readonly allow: readonly string[];
  readonly disallow: readonly string[];
};

type RobotsFile = {
  readonly groups: readonly RobotsGroup[];
  readonly sitemaps: readonly string[];
};

/**
 * Minimāls RFC 9309 parsētājs PIEGĀDĀTAJAM tekstam.
 *
 * Secīgas `User-agent` rindas veido VIENU grupu (§2.2.1); pirmā `Allow`/`Disallow` pēc
 * tām grupu noslēdz, tāpēc nākamā `User-agent` sāk jaunu. `Sitemap` ir globāla direktīva
 * un nepieder nevienai grupai.
 */
function parseRobots(text: string): RobotsFile {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = [];
  const sitemaps: string[] = [];
  let current: { agents: string[]; allow: string[]; disallow: string[] } | undefined;
  let acceptingAgents = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0]!.trim();
    if (line === "") continue;

    const separator = line.indexOf(":");
    expect(separator, `rinda bez atdalītāja: ${line}`).toBeGreaterThan(0);
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!acceptingAgents || current === undefined) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
        acceptingAgents = true;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (field === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (field === "allow" || field === "disallow") {
      expect(current, `${field} pirms User-agent: ${line}`).toBeDefined();
      acceptingAgents = false;
      // Tukšs `Disallow:` nozīmē "nekas nav liegts" — tas nav prefikss, ko sakritināt.
      if (value !== "") current![field].push(value);
    }
  }

  return { groups, sitemaps };
}

/** Grupas ar rāpotāja nosaukumu tiek APVIENOTAS; `*` lieto tikai kā rezervi (§2.2.1). */
function rulesFor(file: RobotsFile, userAgent: string): { allow: string[]; disallow: string[] } {
  const agent = userAgent.toLowerCase();
  const named = file.groups.filter((group) => group.agents.includes(agent));
  const groups = named.length > 0 ? named : file.groups.filter((g) => g.agents.includes("*"));
  expect(groups.length, `nav ne ${userAgent}, ne "*" grupas`).toBeGreaterThan(0);
  return {
    allow: groups.flatMap((group) => [...group.allow]),
    disallow: groups.flatMap((group) => [...group.disallow])
  };
}

/**
 * Šis sakritinātājs ievieš TIKAI RFC 9309 prefiksu apakškopu: vienkāršus drukājamus ASCII
 * prefiksus. NAV atbalstīta `*` aizstājējzīme, `$` enkurs un procentu kodējuma
 * normalizēšana. Mūsu `robots.txt` un publiskās adreses ir tieši tādas, tāpēc ar to pietiek.
 *
 * Bet klusa nepareiza interpretācija būtu bīstamāka par nesegtu gadījumu — un tas attiecas
 * uz ABĀM pusēm, ne tikai uz šabloniem:
 *
 * - `Disallow: /*` liegtu visu, bet burtiska prefiksa pārbaude ziņotu "atļauts";
 * - `Disallow: /%65n/` pēc RFC normalizēšanas liegtu `/en/`, bet burtiski nesakristu.
 *
 * Tāpēc pārbaudīti gan šabloni, gan salīdzināmais ceļš; jebkurš neatbalstīts simbols liek
 * testam SKAĻI krist un pieprasa sakritinātāju papildināt, nevis minēt.
 */
function assertSimpleAscii(value: string, label: string): void {
  expect(/[*$%]/.test(value), `sakritinātājs neatbalsta ${label} "${value}"`).toBe(false);
  expect(/^[\x20-\x7E]*$/.test(value), `sakritinātājs neatbalsta ne-ASCII ${label} "${value}"`).toBe(
    true
  );
}

function longestMatch(patterns: readonly string[], path: string): number {
  assertSimpleAscii(path, "ceļu");
  for (const pattern of patterns) assertSimpleAscii(pattern, "šablonu");
  return patterns
    .filter((pattern) => path.startsWith(pattern))
    .reduce((longest, pattern) => Math.max(longest, pattern.length), -1);
}

/** §2.2.2: uzvar garākā sakritība; neizšķirtā — `Allow`. Bez sakritības — atļauts. */
function isAllowed(file: RobotsFile, userAgent: string, path: string): boolean {
  const rules = rulesFor(file, userAgent);
  return longestMatch(rules.allow, path) >= longestMatch(rules.disallow, path);
}

/** `text/plain; charset=utf-8` → `text/plain`. Parametri nav daļa no kontrakta. */
function mediaType(response: { headers(): Record<string, string> }): string {
  return (response.headers()["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
}

/**
 * Parsē sitemap XML pārlūkā ar `application/xml` režīmu. HTML režīms kļūdaini formētu XML
 * klusi salabotu; XML režīmā tas kļūst par `<parsererror>`, ko šeit noraida.
 *
 * Pārbaudīta arī STRUKTŪRA, ne tikai formas pareizība: sakne ir `<urlset>` pareizajā
 * nosaukumtelpā, un katrs `<loc>` ir tieši viens tiešs `<url>` bērns. Bez tā namespaced
 * `<foo><loc>` koks ar tām pašām adresēm tiktu cauri kā derīgs sitemap.
 */
async function parseSitemap(page: Page, xml: string): Promise<{ error: string | null; locs: string[] }> {
  return page.evaluate(
    ([raw, ns]) => {
      const doc = new DOMParser().parseFromString(raw!, "application/xml");
      const failure = doc.querySelector("parsererror");
      if (failure) return { error: failure.textContent ?? "parsererror", locs: [] };

      const root = doc.documentElement;
      if (root.namespaceURI !== ns) return { error: `nepareiza nosaukumtelpa: ${root.namespaceURI}`, locs: [] };
      if (root.localName !== "urlset") return { error: `sakne nav <urlset>: ${root.localName}`, locs: [] };

      const locs: string[] = [];
      for (const child of [...root.children]) {
        if (child.namespaceURI !== ns || child.localName !== "url") {
          return { error: `<urlset> bērns nav <url>: ${child.localName}`, locs: [] };
        }
        const own = [...child.children].filter((el) => el.namespaceURI === ns && el.localName === "loc");
        if (own.length !== 1) return { error: `<url> ar ${own.length} <loc> elementiem`, locs: [] };
        locs.push(own[0]!.textContent?.trim() ?? "");
      }
      return { error: null, locs };
    },
    [xml, SITEMAP_NS] as const
  );
}

/** `X-Robots-Tag` ir līdzvērtīgs `<meta name="robots">`, bet HTML parsētājs to neredz. */
function expectNoRobotsHeader(response: { headers(): Record<string, string> }, label: string): void {
  const header = (response.headers()["x-robots-tag"] ?? "").toLowerCase();
  expect(header, `${label} izdod X-Robots-Tag: ${header}`).not.toMatch(/\b(noindex|none)\b/);
}

// `workers: 1` un `fullyParallel: false`, tāpēc viens kešs uz failu ir drošs.
let robotsText: string | undefined;
let sitemapLocs: string[] | undefined;

async function loadRobots(request: APIRequestContext): Promise<RobotsFile> {
  robotsText ??= await (await getLocal(request, ROBOTS_PATH)).text();
  return parseRobots(robotsText);
}

async function loadSitemap(request: APIRequestContext, page: Page): Promise<string[]> {
  if (sitemapLocs === undefined) {
    const parsed = await parseSitemap(page, await (await getLocal(request, SITEMAP_PATH)).text());
    expect(parsed.error, "sitemap XML nav derīgs").toBeNull();
    sitemapLocs = parsed.locs;
  }
  return sitemapLocs;
}

test.describe("rāpotāju faili piegādes slānī", () => {
  test("/robots.txt — 200, text/plain, absolūta sitemap adrese", async ({ request }) => {
    const response = await getLocal(request, ROBOTS_PATH);
    expect(mediaType(response)).toBe("text/plain");

    const file = parseRobots(await response.text());
    // Tieši viena `Sitemap` direktīva: otra, novecojusi adrese paslēptos aiz pareizās.
    expect(file.sitemaps).toEqual([new URL(SITEMAP_PATH, SITE_URL).href]);
    expect(file.sitemaps[0]!.startsWith("https://")).toBe(true);
  });

  test("/sitemap.xml — 200, application/xml, derīgs XML pareizā nosaukumtelpā", async ({
    request,
    page
  }) => {
    const response = await getLocal(request, SITEMAP_PATH);
    expect(mediaType(response)).toBe("application/xml");

    const parsed = await parseSitemap(page, await response.text());
    expect(parsed.error, "sitemap XML nav derīgs").toBeNull();
    expect(parsed.locs.length).toBeGreaterThan(0);
  });

  test("abi faili ir stabili — divi pieprasījumi dod baitu ziņā identisku atbildi", async ({
    request
  }) => {
    // Godīgi par tvērumu: tas ir PIEPRASĪJUMU līmeņa stabilitātes tests vienā servera
    // procesā, nevis pierādījums par determinismu starp būvēm. Būvju salīdzinājums prasītu
    // servera pārstartēšanu; to nesedz. Salīdzina `body()` baitus, ne dekodētu tekstu.
    for (const path of [ROBOTS_PATH, SITEMAP_PATH]) {
      const first = await (await getLocal(request, path)).body();
      const second = await (await getLocal(request, path)).body();
      expect(second.equals(first), `${path} nav stabils starp diviem pieprasījumiem`).toBe(true);
    }
  });

  test("sitemap satur tieši indeksējamās adreses, bez dublikātiem un query", async ({
    request,
    page
  }) => {
    const locs = await loadSitemap(request, page);

    for (const loc of locs) {
      const url = new URL(loc);
      expect(url.href, `relatīva vai nenormalizēta adrese: ${loc}`).toBe(loc);
      expect(url.origin, `svešs origin: ${loc}`).toBe(SITE_URL.origin);
      expect(url.protocol).toBe("https:");
      expect(url.search, `query variants: ${loc}`).toBe("");
      expect(url.hash, `fragments: ${loc}`).toBe("");
    }

    expect(new Set(locs).size, "dublēti <loc>").toBe(locs.length);
    // Kopu vienādība ar maršrutu reģistru. Tas vienlaikus pierāda, ka sitemap NAV neviena
    // tehniska, privāta, autentifikācijas vai admin adrese — reģistrā tādu nav.
    expect([...locs].sort()).toEqual([...EXPECTED_URLS].sort());
  });

  test("neviena sitemap adrese nav liegta robots.txt nevienam publiskam rāpotājam", async ({
    request,
    page
  }) => {
    const file = await loadRobots(request);
    const locs = await loadSitemap(request, page);

    // `OAI-SearchBot` nav nosauktas grupas, tāpēc tam jākrīt uz `*`; `Googlebot` pārbauda
    // to pašu ceļu vēlreiz. Abiem visas publiskās adreses jābūt lasāmām (Gate 2).
    for (const agent of ["*", "OAI-SearchBot", "Googlebot"]) {
      for (const loc of locs) {
        const path = new URL(loc).pathname;
        expect(isAllowed(file, agent, path), `${agent} nedrīkst lasīt ${path}`).toBe(true);
      }
    }
  });

  test("pieprasījums ar OAI-SearchBot produkta žetonu saņem 200 katrai publiskajai lapai", async ({
    request,
    page
  }) => {
    // Iepriekšējais tests pierāda tikai to, ka `robots.txt` ATĻAUJ. Tas nav tas pats, kas
    // "var izlasīt": UA atkarīga starpprogrammatūra vai botu filtrs varētu atbildēt `403`.
    //
    // Tvēruma robeža (Codex): šī NAV OpenAI pašreizējā oficiālā UA virkne — versija mainās,
    // un to piesaistīt testam nozīmētu klusu novecošanu. Pierādīts tiek tieši tik, cik ir:
    // pieprasījums, kas satur `OAI-SearchBot` produkta žetonu, saņem `200` bez
    // pāradresācijas un bez `X-Robots-Tag: noindex`. Reālo IP diapazonu un WAF piekļuvi
    // lokāls tests principā nevar pārbaudīt — tā paliek produkcijas fāzei (14.2).
    for (const loc of await loadSitemap(request, page)) {
      const path = new URL(loc).pathname;
      const response = await getLocal(request, path, {
        "user-agent": "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)"
      });
      expectNoRobotsHeader(response, `${path} (OAI-SearchBot)`);
    }
  });

  test("GPTBot ir liegts, un liegums neskar OAI-SearchBot", async ({ request }) => {
    const file = await loadRobots(request);
    expect(isAllowed(file, "GPTBot", "/"), "GPTBot netika liegts").toBe(false);
    expect(isAllowed(file, "GPTBot", "/en/rules")).toBe(false);
    expect(isAllowed(file, "OAI-SearchBot", "/en/rules")).toBe(true);
  });

  test("katra sitemap adrese atgriež 200, nav noindex un kanonizējas pati uz sevi", async ({
    request,
    page
  }) => {
    const locs = await loadSitemap(request, page);
    const sitemapSet = new Set(locs);

    for (const loc of locs) {
      // 9.3 princips: production adrese tiek salīdzināta kā VIRKNE, bet pieprasīts tikai
      // tās `pathname` pret lokālo `baseURL`. `getLocal` prasa `200` bez pāradresācijas.
      const path = new URL(loc).pathname;
      const response = await getLocal(request, path);
      // `X-Robots-Tag: noindex` ir līdzvērtīgs meta tagam, bet HTML parsētājam neredzams —
      // bez šīs pārbaudes `noindex` galvenē izslīdētu cauri visam testam.
      expectNoRobotsHeader(response, path);
      const html = await response.text();

      const head = await page.evaluate((raw) => {
        const parsed = new DOMParser().parseFromString(raw, "text/html").head;
        const metas = [...parsed.querySelectorAll("meta[name]")].map((meta) => ({
          name: (meta.getAttribute("name") ?? "").toLowerCase(),
          content: (meta.getAttribute("content") ?? "").toLowerCase()
        }));
        const links = [...parsed.querySelectorAll("link[rel]")].map((link) => ({
          rel: (link.getAttribute("rel") ?? "").toLowerCase(),
          href: link.getAttribute("href") ?? "",
          hreflang: link.getAttribute("hreflang")
        }));
        return {
          // `robots` un rāpotājam specifiskie tagi; direktīvas ir reģistrnejutīgas.
          robots: metas.filter((m) => m.name === "robots" || m.name.includes("bot")),
          canonicals: links.filter((l) => l.rel === "canonical").map((l) => l.href),
          alternates: links
            .filter((l) => l.rel === "alternate" && l.hreflang !== null)
            .map((l) => l.href)
        };
      }, html);

      for (const directive of head.robots) {
        expect(directive.content, `${path} izdod ${directive.name}=${directive.content}`).not.toMatch(
          /\b(noindex|none)\b/
        );
      }

      // Tieši viens canonical: otrs, pretrunīgs, paslēptos aiz pirmā.
      expect(head.canonicals, `${path} canonical skaits`).toHaveLength(1);
      // Normalizē TIKAI tukšu saknes ceļu — `new URL().href` to dara pats. `/en` un `/en/`
      // paliek dažādi URL (9.1).
      expect(new URL(head.canonicals[0]!).href, `${path} canonical nesakrīt ar sitemap`).toBe(
        new URL(loc).href
      );

      // Sitemap ↔ canonical ↔ `hreflang` nekonfliktē: katrs valodas mērķis ir adrese, kas
      // pati ir sitemapā. Savstarpējo pāru pilnīgumu sedz `metadata.spec.ts`.
      for (const alternate of head.alternates) {
        expect(sitemapSet.has(new URL(alternate).href), `${path} hreflang ārpus sitemap: ${alternate}`).toBe(
          true
        );
      }
    }
  });
});
