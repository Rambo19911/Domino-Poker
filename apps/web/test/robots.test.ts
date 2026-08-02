import { describe, expect, it } from "vitest";

import robots from "../app/robots";
import { GAME_PATH, INDEXED_LOCALES, PUBLIC_PAGES, PUBLIC_ROUTES, SITE_URL } from "../lib/site";

type Rule = {
  userAgent?: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
};

const FILE = robots();
const RULES = FILE.rules as Rule[];

/** Visi indeksējamie publiskie ceļi + spēles sakne. Rāpotājam jātiek pie visiem. */
const PUBLIC_PATHS = [
  GAME_PATH,
  ...INDEXED_LOCALES.flatMap((locale) => PUBLIC_PAGES.map((page) => PUBLIC_ROUTES[locale][page]))
];

/**
 * Servera maršrutu audits, pierakstīts VERBĀLI (11.1). Avots: `apps/server/src/httpServer.ts`
 * dispatch secība + `net/wsTransport.ts` (`/ws`). `/admin/*` apzināti nav sarakstā — admin
 * saskarne ir uz atsevišķa origin, un ceļa publiska uzskaitīšana to tikai reklamētu.
 *
 * Šo sarakstu NEDRĪKST atvasināt no `robots()` izvada: tad maršruta izņemšana klusi
 * padarītu testu tukšu, nevis sarkanu.
 */
const EXPECTED_TECHNICAL_PATHS = [
  "/auth/",
  "/chat/",
  "/contact",
  "/sp/",
  "/stats",
  "/daily/",
  "/weekly/",
  "/store",
  "/slots/",
  "/ws",
  "/health",
  "/metrics"
];

/** Renderēšanai vajadzīgie resursi. Ja tos bloķē, rāpotājs redz citu lapu nekā lietotājs. */
const RENDERING_PATHS = [
  "/_next/static/chunks/main.js",
  "/_next/static/css/app.css",
  "/images/domino-poker-open-graph.jpg",
  "/icon.svg",
  "/manifest.webmanifest"
];

function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * RFC 9309 §2.2.1 efektīvā noteikumu kopa: VISAS grupas ar rāpotāja nosaukumu tiek
 * APVIENOTAS vienā; `*` ir tikai rezerve, ko lieto vienīgi tad, ja nesakrīt neviena
 * nosaukta grupa. Grupas ar dažādiem nosaukumiem noteikumus nemanto.
 */
function groupFor(userAgent: string): Rule {
  const matches = RULES.filter((rule) =>
    toList(rule.userAgent).some((value) => value.toLowerCase() === userAgent.toLowerCase())
  );
  const groups = matches.length > 0 ? matches : RULES.filter((rule) => toList(rule.userAgent).includes("*"));
  if (groups.length === 0) throw new Error(`robots.txt nesatur ne ${userAgent} grupu, ne "*" grupu`);
  return {
    userAgent,
    allow: groups.flatMap((rule) => toList(rule.allow)),
    disallow: groups.flatMap((rule) => toList(rule.disallow))
  };
}

/**
 * Ievieš TIKAI RFC 9309 prefiksu apakškopu: vienkāršus drukājamus ASCII prefiksus. `*`
 * aizstājējzīme, `$` enkurs un procentu kodējuma normalizēšana nav atbalstīti. Klusa
 * nepareiza interpretācija būtu bīstamāka par nesegtu gadījumu — un tas attiecas uz abām
 * pusēm: `Disallow: /*` liegtu visu, bet burtisks prefikss ziņotu "atļauts", savukārt
 * `Disallow: /%65n/` pēc normalizēšanas liegtu `/en/`, bet burtiski nesakristu.
 */
function assertSimpleAscii(value: string, label: string): void {
  expect(/[*$%]/.test(value), `sakritinātājs neatbalsta ${label} "${value}"`).toBe(false);
  expect(/^[\x20-\x7E]*$/.test(value), `sakritinātājs neatbalsta ne-ASCII ${label} "${value}"`).toBe(
    true
  );
}

/** Garākā sakrītošā prefiksa garums, vai -1, ja neviens noteikums nesakrīt. */
function longestMatch(patterns: string[], path: string): number {
  assertSimpleAscii(path, "ceļu");
  for (const pattern of patterns) assertSimpleAscii(pattern, "šablonu");
  return patterns
    .filter((pattern) => path.startsWith(pattern))
    .reduce((longest, pattern) => Math.max(longest, pattern.length), -1);
}

/**
 * RFC 9309 §2.2.2: uzvar garākā sakritība; neizšķirtā gadījumā `Allow`. Ja nesakrīt
 * nekas, ceļš ir atļauts.
 */
function isAllowed(userAgent: string, path: string): boolean {
  const group = groupFor(userAgent);
  const allow = longestMatch(toList(group.allow), path);
  const disallow = longestMatch(toList(group.disallow), path);
  return allow >= disallow;
}

describe("robots.txt", () => {
  it("publiskās lapas ir atļautas noklusējuma rāpotājam", () => {
    // Neizteikts "nav lieguma" arī nozīmētu atļauju, bet plāns prasa ATĻAUJU deklarēt
    // skaidri, tāpēc `Allow: /` ir daļa no kontrakta, ne tikai rezultāts.
    expect(toList(groupFor("*").allow)).toContain("/");
    for (const path of PUBLIC_PATHS) {
      expect(isAllowed("*", path), `bloķēts publisks ceļš: ${path}`).toBe(true);
    }
  });

  it("tehniskie servera maršruti ir liegti — arī to apakšceļi", () => {
    const disallowed = toList(groupFor("*").disallow);
    // Kopu vienādība, nevis apakškopa: iztrūkstošs UN lieks maršruts abi ir kļūda.
    expect([...disallowed].sort()).toEqual([...EXPECTED_TECHNICAL_PATHS].sort());
    for (const path of EXPECTED_TECHNICAL_PATHS) {
      expect(isAllowed("*", path), `neliegts tehniskais ceļš: ${path}`).toBe(false);
      // robots.txt sakrīt pēc prefiksa, tāpēc aizliegumam jāsedz arī apakšceļi.
      expect(isAllowed("*", `${path}login`), `neliegts apakšceļš: ${path}login`).toBe(false);
    }
  });

  it("vienceļa maršruti bez `$` enkura sedz arī query un brāļus ar to pašu prefiksu", () => {
    // APZINĀTS kompromiss, nevis nejaušība. `$` enkurs izgrieztu brāļus (`/contact-us`),
    // bet tad ceļš ar query (`/stats?x=1`) vairs nesakristu. Tādu publisku lapu nav un
    // nav plānotu, tāpēc plašākā sakritība ir izdevīgāka. Ja kādreiz rodas reāla
    // `/contact-us` lapa, šis tests krīt un liek izvēli pārskatīt.
    for (const path of ["/stats?range=week", "/contact?lang=lv"]) {
      expect(isAllowed("*", path), `query variants nav segts: ${path}`).toBe(false);
    }
    for (const path of ["/contact-us", "/stats-2026"]) {
      expect(isAllowed("*", path), `brālis ar to pašu prefiksu nav segts: ${path}`).toBe(false);
    }
    // Fāze 8, 14.1 regresija. Caddy proksē `/store*` BEZ slīpsvītras, tāpēc uz publiskā
    // origin `/store` un `/store-x` sasniedz MP serveri (mērīts 2026-08-02). Ar agrāko
    // `/store/` ierakstu tie bija sasniedzami, bet neuzskaitīti. Ja kāds atgriež
    // slīpsvītru "konsekvences dēļ", šis tests krīt un parāda, kāpēc to nedrīkst.
    for (const path of ["/store", "/store-x", "/store/buy", "/store/owned"]) {
      expect(isAllowed("*", path), `sasniedzams /store variants nav segts: ${path}`).toBe(false);
    }
    // Sarga robeža: neviens no šiem prefiksiem nesakrīt ar reālu publisku ceļu.
    for (const path of PUBLIC_PATHS) {
      expect(isAllowed("*", path), `pārbloķēts publisks ceļš: ${path}`).toBe(true);
    }
  });

  it("renderēšanas resursi nav bloķēti", () => {
    for (const path of RENDERING_PATHS) {
      expect(isAllowed("*", path), `bloķēts renderēšanas resurss: ${path}`).toBe(true);
    }
  });

  it("OAI-SearchBot nav atsevišķas grupas un tāpēc krīt uz '*'", () => {
    // D4: nosaukta grupa būtu jāuztur sinhroni ar `*` (`*` netiek mantots), tāpēc tās
    // NAV. Šis tests fiksē tieši to izvēli — ne tikai rezultātu.
    const named = RULES.filter((rule) => toList(rule.userAgent).includes("OAI-SearchBot"));
    expect(named).toHaveLength(0);
    expect(toList(groupFor("OAI-SearchBot").disallow)).toEqual(toList(groupFor("*").disallow));
    for (const path of PUBLIC_PATHS) {
      expect(isAllowed("OAI-SearchBot", path), `OAI-SearchBot bloķēts: ${path}`).toBe(true);
    }
  });

  it("GPTBot ir pilnībā liegts (īpašnieka lēmums D4)", () => {
    const group = groupFor("GPTBot");
    expect(toList(group.disallow)).not.toEqual(toList(groupFor("*").disallow));
    expect(toList(group.disallow)).toContain("/");
    for (const path of [...PUBLIC_PATHS, ...RENDERING_PATHS]) {
      expect(isAllowed("GPTBot", path), `GPTBot netika liegts: ${path}`).toBe(false);
    }
  });

  it("katra nosaukta grupa atkārto pilnu tehnisko liegumu sarakstu", () => {
    // RFC 9309 sargs nākotnei: ja kāds pievieno nosauktu grupu, kas atļauj rāpošanu,
    // tai jādublē `*` liegumi — citādi tehniskie maršruti tai klusi atvērtos.
    const wildcardDisallow = toList(groupFor("*").disallow);
    for (const rule of RULES) {
      const agents = toList(rule.userAgent);
      if (agents.includes("*")) continue;
      if (toList(rule.disallow).includes("/")) continue; // pilns liegums jau sedz visu
      for (const path of wildcardDisallow) {
        expect(toList(rule.disallow), `grupa ${agents.join(",")} neatkārto ${path}`).toContain(path);
      }
    }
  });

  it("sitemap ir absolūta production adrese", () => {
    expect(FILE.sitemap).toBe("https://domino-poker.com/sitemap.xml");
    const sitemap = new URL(FILE.sitemap as string);
    expect(sitemap.origin).toBe(SITE_URL.origin);
    expect(sitemap.pathname).toBe("/sitemap.xml");
  });
});
