import { describe, expect, it } from "vitest";

import { serializeJsonLd } from "../components/JsonLd";
import {
  GAME_ENTITY_ID,
  gameStructuredData,
  type GameStructuredData
} from "../lib/gameStructuredData";
import { getHome, getScreenshots } from "../lib/publicContent";
import { GITHUB_REPO_URL, INDEXED_LOCALES, SITE_NAME, YOUTUBE_VIDEO_URL } from "../lib/site";

// Strukturētie dati ir APGALVOJUMI par entītiju. Nepatiess lauks te ir sliktāks par
// trūkstošu, tāpēc testi pārbauda ne tikai to, kas IR, bet arī to, kā NEDRĪKST būt
// (izdomāts vērtējums, `price` bez valūtas, YouTube kā profils).

const BOTH: readonly GameStructuredData[] = INDEXED_LOCALES.map((locale) =>
  gameStructuredData(locale)
);

/** Visas virknes struktūrā — dziļo lauku pārbaudēm. */
function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(allStrings);
  }
  return [];
}

function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, nested]) => [key, ...allKeys(nested)]);
  }
  return [];
}

describe("spēles strukturētie dati", () => {
  it("ir viena entītija ar stabilu, absolūtu @id abās valodās", () => {
    // Lokalizēts apraksts ar KOPĪGU `@id` ir tas, kas ļauj sistēmām sasaistīt valodu
    // versijas. Ja `@id` būtu lapas canonical, entītija sašķeltos divās.
    expect(GAME_ENTITY_ID).toBe("https://domino-poker.com/#game");
    for (const data of BOTH) {
      expect(data["@id"]).toBe(GAME_ENTITY_ID);
    }
  });

  it("apraksts ir lokalizēts un nāk no lapā REDZAMĀ teksta", () => {
    for (const locale of INDEXED_LOCALES) {
      expect(gameStructuredData(locale).description).toBe(getHome(locale).intro);
    }
    const [en, lv] = BOTH;
    expect(en!.description).not.toBe(lv!.description);
  });

  it("pārējie lauki abās valodās ir identiski", () => {
    // Viena entītija nedrīkst apgalvot pretrunīgas lietas atkarībā no lapas valodas.
    const [en, lv] = BOTH;
    const withoutDescription = (data: GameStructuredData) => {
      const { description: _description, ...rest } = data;
      return rest;
    };
    expect(withoutDescription(en!)).toEqual(withoutDescription(lv!));
  });

  it("tips ir gan VideoGame, gan WebApplication", () => {
    for (const data of BOTH) {
      expect(data["@type"]).toEqual(["VideoGame", "WebApplication"]);
      expect(data["@context"]).toBe("https://schema.org");
    }
  });

  it("nosaukums un adrese norāda uz spēli, nevis uz publisko lapu", () => {
    for (const data of BOTH) {
      expect(data.name).toBe(SITE_NAME);
      expect(data.url).toBe("https://domino-poker.com/");
    }
  });

  it("attēli ir absolūti un atbilst lapā redzamajiem ekrānattēliem", () => {
    const slugs = getScreenshots("en").map((image) => image.slug);
    for (const data of BOTH) {
      expect(data.image).toHaveLength(slugs.length);
      for (const [index, url] of data.image.entries()) {
        expect(url).toBe(`https://domino-poker.com/images/${slugs[index]}-1440.webp`);
        expect(new URL(url).protocol).toBe("https:");
      }
    }
  });

  it("operētājsistēma ir `Any`, nevis pārlūks", () => {
    for (const data of BOTH) {
      expect(data.applicationCategory).toBe("GameApplication");
      expect(data.operatingSystem).toBe("Any");
      // “web browser” nav operētājsistēma — tā ir bieža, bet nepareiza vērtība.
      expect(allStrings(data).join(" ").toLowerCase()).not.toContain("web browser");
    }
  });

  it("spēles režīmi ir abi kanoniskie GamePlayMode locekļi", () => {
    for (const data of BOTH) {
      expect(data.playMode).toEqual([
        "https://schema.org/SinglePlayer",
        "https://schema.org/MultiPlayer"
      ]);
    }
  });

  it("nesatur laukus, kuriem lapā nav redzama seguma", () => {
    // Kritērijs: patiess UN redzamajā saturā atbalstīts. `inLanguage` (21 spēles valoda)
    // un `subjectOf` (YouTube video) ir patiesi, bet publiskajā lapā nekur neparādās,
    // tāpēc tie ir apzināti izlaisti. Šis tests notur to lēmumu: pievienot drīkst tikai
    // kopā ar redzamu segumu tajā pašā lapā.
    for (const data of BOTH) {
      const keys = allKeys(data);
      expect(keys).not.toContain("inLanguage");
      expect(keys).not.toContain("subjectOf");
      expect(allStrings(data)).not.toContain(YOUTUBE_VIDEO_URL);
    }
  });

  it("bezmaksas piedāvājumam ir price UN obligātā valūta", () => {
    for (const data of BOTH) {
      expect(data.isAccessibleForFree).toBe(true);
      expect(data.offers).toEqual({
        "@type": "Offer",
        price: "0",
        priceCurrency: "EUR"
      });
      // `price` bez `priceCurrency` ir validācijas kļūda.
      expect(data.offers.priceCurrency.length).toBeGreaterThan(0);
    }
  });

  it("sameAs ir tikai oficiālais profils", () => {
    for (const data of BOTH) {
      // GitHub repozitorijs ir entītijas profils UN ir redzams About lapas faktos.
      expect(data.sameAs).toEqual([GITHUB_REPO_URL]);
      // Video nav profils, tāpēc pat tad, kad tas atgriezīsies, `sameAs` tam nav vieta.
      expect(data.sameAs).not.toContain(YOUTUBE_VIDEO_URL);
    }
  });

  it("nav izdomāta vērtējuma vai atsauksmju", () => {
    // Bez īstām, lietotājam redzamām atsauksmēm šie lauki būtu izdomāti dati.
    for (const data of BOTH) {
      const keys = allKeys(data).map((key) => key.toLowerCase());
      expect(keys).not.toContain("aggregaterating");
      expect(keys).not.toContain("review");
      expect(keys).not.toContain("ratingvalue");
    }
  });

  it("satur tikai paredzētos augšējā līmeņa laukus", () => {
    // Sargs pret klusi pievienotu, nepārbaudītu lauku.
    for (const data of BOTH) {
      expect(Object.keys(data).sort()).toEqual(
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

  it("izdzīvo pilnu JSON apgriezienu bez zudumiem", () => {
    // Apgrieziens, nevis `undefined` meklēšana tekstā: `JSON.stringify` KLUSI izmet
    // `undefined`, funkcijas un simbolus, tāpēc virknes pārbaude to nepamanītu, bet
    // vārda “undefined” meklēšana savukārt noraidītu derīgu tekstu.
    for (const data of BOTH) {
      expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
    }
  });
});

describe("JSON-LD serializācija", () => {
  it("aizstāj `<` ar \\u003c, tāpēc `</script>` nevar izkļūt no taga", () => {
    // Next.js drošības norādījums: `JSON.stringify` XSS neaizsargā.
    const payload = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(payload).not.toContain("</script>");
    expect(payload).not.toContain("<");
    expect(payload).toContain("\\u003c");
    // Aizvietojums notiek JSON virknes iekšienē, tāpēc rezultāts joprojām ir derīgs JSON
    // un atkodējas atpakaļ tieši sākotnējā vērtībā.
    expect(JSON.parse(payload)).toEqual({ name: "</script><script>alert(1)</script>" });
  });

  it("reālā spēles entītija serializējas bez `<`", () => {
    for (const data of BOTH) {
      expect(serializeJsonLd(data)).not.toContain("<");
    }
  });
});
