import { describe, expect, it } from "vitest";

import { serializeJsonLd } from "../components/JsonLd";
import { GAME_ENTITY_ID } from "../lib/gameStructuredData";
import { PUBLIC_DOCUMENTS } from "../lib/publicDocuments";
import { publicPageMetadata, publicPageStructuredData } from "../lib/publicPage";

// Lapas līmeņa strukturētie dati (10.2). Galvenā prasība: JSON-LD apraksta adrese
// VIENMĒR sakrīt ar tās lapas canonical. Tas ir nostiprināts struktūrā — abas vērtības
// nāk no viena `doc.url` —, un šie testi to arī pierāda.

describe("lapas strukturētie dati", () => {
  it("url sakrīt ar TĀS PAŠAS lapas canonical", () => {
    // Salīdzina pret reālo metadatu canonical, nevis pret atkārtoti ierakstītu adresi:
    // ja kāds nākotnē mainītu vienu no abiem avotiem, šis tests to noķertu.
    for (const doc of PUBLIC_DOCUMENTS) {
      const canonical = publicPageMetadata(doc).alternates?.canonical;
      expect(publicPageStructuredData(doc).url).toBe(canonical);
    }
  });

  it("aptver visas indeksējamās lapas ar unikālu @id", () => {
    const ids = PUBLIC_DOCUMENTS.map((doc) => publicPageStructuredData(doc)["@id"]);
    expect(ids).toHaveLength(PUBLIC_DOCUMENTS.length);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [index, doc] of PUBLIC_DOCUMENTS.entries()) {
      // Fragments atšķir LAPAS mezglu no spēles entītijas mezgla (`/#game`).
      expect(ids[index]).toBe(`${doc.url}#webpage`);
      expect(ids[index]).not.toBe(GAME_ENTITY_ID);
    }
  });

  it("nosaukums, apraksts un valoda nāk no lapas kontrakta", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const data = publicPageStructuredData(doc);
      expect(data["@type"]).toBe("WebPage");
      expect(data.name).toBe(doc.title);
      expect(data.description).toBe(doc.description);
      // Lapas valoda ir redzama un deklarēta `<html lang>` — atšķirībā no spēles
      // 21 valodas, kas publiskajā lapā nekur neparādās (sk. 10.1).
      expect(data.inLanguage).toBe(doc.locale);
    }
  });

  it("saista lapu ar spēles entītiju", () => {
    // Bez šīs saites `WebPage` mezgls tikai atkārtotu `<title>`, meta aprakstu un
    // canonical, kas HTML jau ir. Saite ir tā, kas padara vietnes grafu saskanīgu.
    for (const doc of PUBLIC_DOCUMENTS) {
      expect(publicPageStructuredData(doc).about).toEqual({ "@id": GAME_ENTITY_ID });
    }
  });

  it("nesatur BreadcrumbList, jo lapās nav redzamas breadcrumb navigācijas", () => {
    // Publiskajā čaulā ir PLAKANA brāļu-māsu navigācija (visas piecas lapas vienā
    // līmenī), nevis hierarhiska breadcrumb taka. Marķējums bez redzamas takas būtu
    // apgalvojums par navigāciju, kuras nav.
    for (const doc of PUBLIC_DOCUMENTS) {
      const serialized = serializeJsonLd(publicPageStructuredData(doc));
      expect(serialized).not.toContain("BreadcrumbList");
      expect(serialized).not.toContain("breadcrumb");
    }
  });

  it("nesatur FAQPage", () => {
    // `FAQPage` netiek likts redzamības cerībās; Google to jau sen ierobežoja līdz
    // autoritatīvām vietnēm, un jautājumu, kas lapā nav redzami, izdomāt nedrīkst.
    for (const doc of PUBLIC_DOCUMENTS) {
      expect(serializeJsonLd(publicPageStructuredData(doc))).not.toContain("FAQPage");
    }
  });

  it("satur tikai paredzētos laukus", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      expect(Object.keys(publicPageStructuredData(doc)).sort()).toEqual(
        ["@context", "@id", "@type", "about", "description", "inLanguage", "name", "url"].sort()
      );
    }
  });

  it("izdzīvo pilnu JSON apgriezienu bez zudumiem", () => {
    for (const doc of PUBLIC_DOCUMENTS) {
      const data = publicPageStructuredData(doc);
      expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
    }
  });
});
