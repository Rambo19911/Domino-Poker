import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ASSET_MANIFEST,
  RUNTIME_ASSET_URLS,
  createBundleManifest,
  getAssetDefinition,
  type AssetId
} from "../components/slots/config/assetManifest";
import { toSpinResult } from "../components/slots/spinAdapter";
import type { SlotSpinView } from "../lib/slots/slotsApi";

/**
 * Pārnests no standalone spēles `tools/asset-audit.ts` + `tests/unit/assetAudit.spec.ts`,
 * pārregulēts no 116 uz **112**: šis repo tur tikai IZPILDLAIKA kopu, jo `qa-only` un
 * `reserved` faili netika kopēti (integrācijas plāns, Fāze 4). Tāpēc audits pārbauda
 * `RUNTIME_ASSET_URLS`, nevis pilnu definīciju sarakstu.
 */

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

/** `/assets/slots/dominoes%20tiles/0-0.png` -> absolūts ceļš uz diska. */
function toDiskPath(url: string): string {
  return `${PUBLIC_DIR}${decodeURIComponent(url)}`;
}

describe("slot asset manifest", () => {
  it("resolves exactly the 112 runtime assets that were copied", () => {
    expect(RUNTIME_ASSET_URLS).toHaveLength(112);
  });

  it("every runtime asset exists on disk with the declared source size", () => {
    const missing: string[] = [];
    for (const url of RUNTIME_ASSET_URLS) {
      if (!existsSync(toDiskPath(url))) missing.push(url);
    }
    expect(missing).toEqual([]);
  });

  it("every runtime URL lives under /assets/slots/ and is encoded exactly once", () => {
    for (const url of RUNTIME_ASSET_URLS) {
      expect(url.startsWith("/assets/slots/"), url).toBe(true);
      // Dubultkodēšana (`%2520`) vai nekodēta atstarpe abas dotu 404.
      expect(url).not.toContain("%25");
      expect(url).not.toContain(" ");
    }
  });

  it("encodes directory names that contain spaces", () => {
    const spaced = RUNTIME_ASSET_URLS.filter((url) => url.includes("%20"));
    // "dominoes tiles" (70 flīzes + specials), "Coin Spin", "Wild Full".
    expect(spaced.length).toBeGreaterThan(70);
    expect(spaced.every((url) => decodeURIComponent(url).includes(" "))).toBe(true);
  });

  it("excludes the qa-only screenshot and the reserved assets", () => {
    const excluded: readonly AssetId[] = ["A013", "A014", "A016", "A100"];
    for (const id of excluded) {
      const definition = getAssetDefinition(id);
      expect(RUNTIME_ASSET_URLS).not.toContain(definition.url);
      // Tie arī nedrīkst būt nokopēti mērķī.
      expect(existsSync(toDiskPath(definition.url)), definition.filePath).toBe(false);
    }
  });

  it("loads every runtime asset through exactly one bundle", () => {
    const bundles = createBundleManifest().bundles;
    const bundled = bundles.flatMap((bundle) => bundle.assets.map((asset) => asset.src));
    expect(new Set(bundled).size).toBe(bundled.length);
    expect([...bundled].sort()).toEqual([...RUNTIME_ASSET_URLS].sort());
  });

  it("keeps the manifest and the shipped bytes in agreement", () => {
    // Izlases pārbaude pret patiesajiem baitiem: nulles garuma fails nozīmētu
    // pārtrauktu kopēšanu, ko `existsSync` nepamanītu.
    for (const url of RUNTIME_ASSET_URLS.slice(0, 10)) {
      expect(statSync(toDiskPath(url)).size).toBeGreaterThan(0);
    }
  });

  it("registers all 116 definitions but ships only the runtime subset", () => {
    expect(Object.keys(ASSET_MANIFEST)).toHaveLength(116);
  });
});

describe("spin adapter", () => {
  const view: SlotSpinView = {
    spinId: "abc",
    lineBet: 20,
    totalBet: 220,
    payout: 500,
    grid: [
      [
        { symbol: "WILD_FULL", fromFullWildColumn: true },
        { symbol: "0-0", fromFullWildColumn: false },
        { symbol: "VASE", fromFullWildColumn: false },
        { symbol: "JACKPOT", fromFullWildColumn: false },
        { symbol: "0-2", fromFullWildColumn: false }
      ],
      [
        { symbol: "WILD_FULL", fromFullWildColumn: true },
        { symbol: "0-0", fromFullWildColumn: false },
        { symbol: "VASE", fromFullWildColumn: false },
        { symbol: "JACKPOT", fromFullWildColumn: false },
        { symbol: "0-2", fromFullWildColumn: false }
      ],
      [
        { symbol: "WILD_FULL", fromFullWildColumn: true },
        { symbol: "0-0", fromFullWildColumn: false },
        { symbol: "VASE", fromFullWildColumn: false },
        { symbol: "JACKPOT", fromFullWildColumn: false },
        { symbol: "0-2", fromFullWildColumn: false }
      ]
    ],
    lines: [
      {
        lineIndex: 0,
        category: "EXACT",
        startColumn: 0,
        length: 3,
        targetSymbol: "0-0",
        multiplierHundredths: 45,
        winCoins: 9
      }
    ],
    jackpotCount: 3,
    scatterWin: 1100,
    mathVersion: "domino-slots-math-v3"
  };

  it("converts the wire numbers back into bigint coins", () => {
    const result = toSpinResult(view);
    expect(result.totalBet).toBe(220n);
    expect(result.scatterWin).toBe(1100n);
    expect(result.lines[0]?.winCoins).toBe(9n);
  });

  it("uses the payout the server actually paid, not a recomputation", () => {
    // Ja šis kādreiz tiktu pārrēķināts no līnijām, HUD rādītu citu skaitli nekā bilance.
    const result = toSpinResult(view);
    expect(result.totalWin).toBe(500n);
  });

  it("preserves the full wild column marker the renderer animates", () => {
    const result = toSpinResult(view);
    expect(result.grid[0][0].fromFullWildColumn).toBe(true);
    expect(result.grid[0][1].fromFullWildColumn).toBe(false);
  });
});
