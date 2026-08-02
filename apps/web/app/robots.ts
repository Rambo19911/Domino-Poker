import type { MetadataRoute } from "next";

import { SITE_URL } from "../lib/site";

/**
 * Tehniskie same-origin maršruti, ko nav vērts rāpot (Fāze 5, 11.1).
 *
 * Atvasināts no REĀLĀ servera maršrutu inventāra (`apps/server/src/httpServer.ts`
 * dispatch + `net/wsTransport.ts`) — nevis no minējuma. Vai katrs no tiem tiešām ir
 * sasniedzams uz publiskā hosta, nosaka dzīvā Caddy konfigurācija, kas repozitorijā
 * NAV (`deploy/Caddyfile.example` pats atzīst, ka var atpalikt). Neproksēts ceļš šeit
 * ir nekaitīgs bezdarbīgs ieraksts, tāpēc saraksts ir apzināti pilns pēc servera, ne
 * pēc proksija; publiskā origin pārbaude paliek 14.1.
 *
 * Slīpsvītra beigās atbilst servera maršruta veidam: prefiksu maršrutus (`/auth/login`,
 * `/daily/tasks`, …) raksta ar to, bet vienceļa maršrutus (`/contact`, `/stats`, `/ws`,
 * `/health`, `/metrics`) — bez, lai prefiksa sakritība sedz arī pašu ceļu un tā query
 * variantus. APZINĀTA sekas: bez slīpsvītras aizliegums sedz arī brāļus ar to pašu
 * prefiksu (`/contact-us`, `/stats-2026`). `$` enkurs to novērstu, bet tad ceļš ar query
 * (`/stats?x=1`) vairs nesakristu; tādu publisku lapu nav un nav plānotu, tāpēc plašākā
 * sakritība ir izdevīgākais kompromiss.
 *
 * `/store` ir IZŅĒMUMS no slīpsvītras konvencijas, un tam ir mērīts iemesls. Servera
 * maršruti (`/store/buy`, `/store/owned`) ir prefiksu maršruti, tāpēc konvencija prasītu
 * `/store/`. Bet dzīvā Caddy proksē `/store*` — BEZ slīpsvītras — tāpēc uz publiskā
 * origin `/store` un `/store-x` arī aiziet līdz MP serverim (Fāze 8, 14.1 zonde
 * 2026-08-02: abi atgriež `application/json` 404, nevis Next.js catch-all 14 036 baitu
 * HTML). Ar `/store/` tie būtu sasniedzami, bet neuzskaitīti. `/store` bez slīpsvītras ir
 * strikts virskopums un noņem neatbilstību starp proksija un servera maršruta formu.
 *
 * ŠIS NAV DROŠĪBAS SLĀNIS: piekļuves kontrole un rate-limits ir gala punkta un proksija
 * atbildība, `robots.txt` nedod ne vienu, ne otru. Daļa šo ceļu (`/metrics`, `/health`)
 * autentifikāciju NEPRASA. Tieši tāpēc `/admin/*` šeit NAV: to publiski uzskaitīt
 * nozīmētu reklamēt administrācijas ceļu bez jebkāda rāpošanas budžeta ieguvuma, un
 * admin saskarne dzīvo uz atsevišķa origin.
 */
const TECHNICAL_PATHS = [
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

/**
 * robots.txt (→ /robots.txt).
 *
 * `OAI-SearchBot` APZINĀTI nav atsevišķa grupa. Pēc RFC 9309 rāpotājs sev veido VIENU
 * efektīvo noteikumu kopu: grupas ar vienu un to pašu nosaukumu tiek apvienotas, bet
 * `*` ir tikai rezerve, ko lieto TIKAI tad, ja nav nevienas sakrītošas nosauktas grupas.
 * Grupas ar dažādiem nosaukumiem NEMANTO viena otras noteikumus. Nosaukta
 * `OAI-SearchBot` grupa tāpēc prasītu atkārtot visu `TECHNICAL_PATHS` sarakstu un ar
 * laiku klusi novirzītos no `*`. Nebloķēšana jau nozīmē atļauju, tāpēc `OAI-SearchBot`
 * krīt uz `*` grupu un drīkst lasīt visu publisko saturu.
 *
 * `GPTBot` ir apmācības rāpotājs (nevis ChatGPT Search atrodamības avots), un pēc
 * īpašnieka lēmuma (2026-07-31, D4) tam ir pilns aizliegums. Šo NEDRĪKST attiecināt uz
 * `OAI-SearchBot`.
 *
 * `/_next/`, `/images/` un ikonas apzināti NAV bloķētas: rāpotājam jāredz lapas tā, kā
 * to redz lietotājs, un CSS/JS bloķēšana kropļo renderēšanu.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: TECHNICAL_PATHS
      },
      {
        userAgent: "GPTBot",
        disallow: "/"
      }
    ],
    sitemap: new URL("/sitemap.xml", SITE_URL).href
  };
}
