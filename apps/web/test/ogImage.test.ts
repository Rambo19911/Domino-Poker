import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { publicPageMetadata } from "../lib/publicPage";
import { PUBLIC_DOCUMENTS } from "../lib/publicDocuments";
import { INDEXED_LOCALES, OG_IMAGE, SITE_URL } from "../lib/site";

// Kopīgošanas attēls (10.3). Deklarētie izmēri tiek salīdzināti ar ĪSTO failu uz diska:
// `width`/`height` metadatos ir apgalvojums, un nepareizs izmērs liek kopīgošanas kartītei
// izskatīties salauztai, nevis vienkārši citādi.

const FILE = fileURLToPath(new URL(`../public${OG_IMAGE.path}`, import.meta.url));

/**
 * JPEG izmēri no SOF marķiera. Apzināti bez attēlu bibliotēkas: `sharp` nav apps/web
 * atkarība, un šai pārbaudei pietiek ar dažām baitu nolasēm.
 */
function jpegSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.readUInt16BE(0), "nav JPEG SOI marķiera").toBe(0xffd8);

  let offset = 2;
  while (offset < bytes.length) {
    expect(bytes[offset], "sagaidīts marķiera sākums").toBe(0xff);
    const marker = bytes[offset + 1]!;
    const length = bytes.readUInt16BE(offset + 2);
    // SOF0/1/2/9/10 satur izmērus; SOF4 (0xc4) un SOF8 (0xc8) ir citi segmenti.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG SOF marķieris nav atrasts");
}

describe("kopīgošanas attēls", () => {
  it("fails eksistē un ir tieši 1200×630", () => {
    const bytes = readFileSync(FILE);
    expect(jpegSize(bytes)).toEqual({ width: OG_IMAGE.width, height: OG_IMAGE.height });
    // Open Graph prasa 1200×630 lielajai kartītei.
    expect(OG_IMAGE.width).toBe(1200);
    expect(OG_IMAGE.height).toBe(630);
  });

  it("nav ne tukšs, ne absurdi liels", () => {
    // Facebook ierobežojums ir 8 MB; par mazu fails nozīmētu, ka ģenerēšana neizdevās.
    const { size } = statSync(FILE);
    expect(size).toBeGreaterThan(20_000);
    expect(size).toBeLessThan(2_000_000);
  });

  it("norāda uz atsevišķu failu, nevis atkārto ikonu", () => {
    // Šis pārbauda TIKAI ceļu — pārsauktu ikonu tas nenoķertu. Ka attēls patiešām nav
    // ikona, pierāda 1200×630 izmērs (augstāk) un vizuāla apskate, nevis šis tests.
    expect(OG_IMAGE.path).not.toContain("icon");
    expect(OG_IMAGE.path).not.toContain("favicon");
  });

  it("katrai indeksējamai valodai ir savs, jēgpilns alt", () => {
    const alts = INDEXED_LOCALES.map((locale) => OG_IMAGE.alt[locale]);
    for (const alt of alts) {
      expect(alt.trim().length).toBeGreaterThan(40);
      // `alt` apraksta attēlu, nevis atkārto faila nosaukumu.
      expect(alt.toLowerCase()).not.toContain(".jpg");
    }
    expect(new Set(alts).size).toBe(alts.length);
  });
});

describe("publisko lapu og:image", () => {
  it("visām lapām ir tieši viens absolūts attēls ar lokalizētu alt", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const images = publicPageMetadata(doc).openGraph?.images;
      expect(Array.isArray(images)).toBe(true);
      const list = images as ReadonlyArray<{
        url: string;
        width: number;
        height: number;
        alt: string;
      }>;

      expect(list).toHaveLength(1);
      const image = list[0]!;
      // Relatīvs ceļš kopīgošanas robotam nav atrisināms.
      expect(image.url).toBe(new URL(OG_IMAGE.path, SITE_URL).href);
      expect(new URL(image.url).origin).toBe(SITE_URL.origin);
      expect(image.width).toBe(OG_IMAGE.width);
      expect(image.height).toBe(OG_IMAGE.height);
      expect(image.alt).toBe(OG_IMAGE.alt[doc.locale]);
    }
  });
});
