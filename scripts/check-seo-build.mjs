// Publisko lapu būves artefaktu pārbaude (plāna 12.2 un Gate 3).
//
// KĀPĒC SKRIPTS, NEVIS PLAYWRIGHT TESTS: `playwright.config.ts` palaiž web serveri ar
// `next dev`, kur moduļi netiek bundlēti tāpat kā produkcijā. Statiskumu un klienta koda
// sastāvu tāpēc pārbauda pret `next build` artefaktiem, nevis pārlūkā. Plāna 12.2 to
// pieprasa tieši.
//
// Palaišana (pēc `npm run build --workspace apps/web`):
//   node scripts/check-seo-build.mjs
//
// Maršruti tiek lasīti no TĀ PAŠA reģistra, ko lieto lapas, sitemap un canonical
// (`apps/web/lib/site.ts`) — Node 24 importē TypeScript tieši. Citādi skriptam būtu sava,
// patstāvīgi novecojoša adrešu kopija.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GAME_PATH, INDEXED_LOCALES, PUBLIC_PAGES, PUBLIC_ROUTES } from "../apps/web/lib/site.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = join(repoRoot, "apps/web/.next");

/**
 * Spēles čaulas ieejas punkts klienta grafā.
 *
 * Publiskajām lapām tas NEDRĪKST parādīties. Pixi meklēšana chunk nosaukumos būtu tukša
 * pārbaude — tas ielādējas slinki un nav nevienā manifestā pat spēles maršrutam.
 *
 * Ko tas pierāda: spēles čaula nav publisko lapu klienta grafā. Tā kā smagais kods (Pixi,
 * AI bots, spēles stāvoklis) šodien dzīvo zem `AppShell`, ar to praksē pietiek. Ko tas
 * NEPIERĀDA: universālu "nekur nav smagā koda". Tiešs Pixi vai AI bota imports PAŠĀ publiskajā
 * lapā, apejot `AppShell`, šai pārbaudei paslīdētu garām.
 */
const GAME_SHELL_MARKER = "components/AppShell.tsx";

/** Publiskajā layout obligātā PWA reģistrācija (D5). */
const PWA_MARKER = "components/PwaRegister.tsx";

const problems = [];
const fail = (message) => problems.push(message);

if (!existsSync(nextDir)) {
  console.error("apps/web/.next nav atrasts — vispirms palaid `npm run build --workspace apps/web`.");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// 1. Statiskums: katra indeksējamā adrese ir priekšrenderēta un bez revalidācijas.
// ---------------------------------------------------------------------------

const prerender = JSON.parse(readFileSync(join(nextDir, "prerender-manifest.json"), "utf8"));

const indexableRoutes = [
  GAME_PATH,
  ...INDEXED_LOCALES.flatMap((locale) => PUBLIC_PAGES.map((page) => PUBLIC_ROUTES[locale][page]))
];

for (const route of indexableRoutes) {
  const entry = prerender.routes[route];
  if (!entry) {
    fail(`maršruts nav priekšrenderēts (nav statisks): ${route}`);
    continue;
  }
  // `false` = nav ISR. Jebkurš skaitlis nozīmētu, ka lapa laika gaitā pārģenerējas
  // serverī — plāns to sauc par "negaidīti dinamisku".
  if (entry.initialRevalidateSeconds !== false) {
    fail(`maršrutam ir revalidācija (${entry.initialRevalidateSeconds}): ${route}`);
  }
}

for (const file of ["/robots.txt", "/sitemap.xml"]) {
  if (!prerender.routes[file]) fail(`rāpotāju fails nav statisks: ${file}`);
}

// `dynamicParams = false` nozīmē, ka nezināms locale ir statisks 404, nevis SSR ceļš.
// Manifestā tas izpaužas kā `fallback: false` katrai `[locale]` veidnei.
//
// Vispirms tiek prasīts, ka veidnes VISPĀR eksistē: filtrējoša cikla pār tukšu vai
// pārdēvētu kopu izietu klusi un neko nepierādītu.
const localeTemplates = Object.entries(prerender.dynamicRoutes ?? {}).filter(([route]) =>
  route.startsWith("/[locale]")
);
if (localeTemplates.length !== PUBLIC_PAGES.length) {
  fail(
    `gaidītas ${PUBLIC_PAGES.length} [locale] veidnes, atrastas ${localeTemplates.length} ` +
      `(${localeTemplates.map(([route]) => route).join(", ") || "nevienas"})`
  );
}
for (const [route, entry] of localeTemplates) {
  if (entry.fallback !== false) {
    fail(`[locale] veidnei ir SSR fallback (${JSON.stringify(entry.fallback)}): ${route}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Klienta grafs: publiskajās lapās nav spēles čaulas, bet ir PWA reģistrācija.
// ---------------------------------------------------------------------------

/** Atrod visus `*_client-reference-manifest.js` zem dotās app apakšmapes. */
function manifestsUnder(relativeDir) {
  const root = join(nextDir, "server/app", relativeDir);
  if (!existsSync(root)) return [];

  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith("_client-reference-manifest.js")) found.push(full);
    }
  };
  walk(root);
  return found;
}

const publicManifests = manifestsUnder("(public)");
if (publicManifests.length !== PUBLIC_PAGES.length) {
  fail(
    `gaidīti ${PUBLIC_PAGES.length} publisko lapu klienta manifesti, atrasti ${publicManifests.length}`
  );
}

for (const file of publicManifests) {
  const source = readFileSync(file, "utf8");
  const label = file.slice(nextDir.length + 1).replace(/\\/g, "/");

  if (source.includes(GAME_SHELL_MARKER)) {
    fail(`publiskā lapa ievelk spēles čaulu (${GAME_SHELL_MARKER}): ${label}`);
  }
  if (!source.includes(PWA_MARKER)) {
    fail(`publiskajā lapā trūkst ${PWA_MARKER} (D5 prasība): ${label}`);
  }
}

// ENKURS. Bez šī iepriekšējā prombūtnes pārbaude kļūtu tukši patiesa, ja `AppShell` kādreiz
// tiktu pārdēvēts vai pārvietots: marķieris vairs nesakristu NEKUR, un tests joprojām būtu
// zaļš. Tāpēc spēles maršrutam tam pašam marķierim ir JĀBŪT.
const gameManifests = manifestsUnder("(game)");
if (gameManifests.length === 0) fail("nav atrasts neviens spēles maršruta klienta manifests");
if (!gameManifests.some((file) => readFileSync(file, "utf8").includes(GAME_SHELL_MARKER))) {
  fail(
    `spēles maršrutā nav ${GAME_SHELL_MARKER} — marķieris novecojis, tāpēc publisko lapu ` +
      `pārbaude vairs neko nepierāda`
  );
}

// ---------------------------------------------------------------------------

if (problems.length > 0) {
  console.error("SEO būves pārbaude NEIZDEVĀS:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `SEO būves pārbaude OK: ${indexableRoutes.length} statiskas indeksējamas adreses, ` +
    `${publicManifests.length} publiskie klienta manifesti bez spēles čaulas.`
);
