import { describe, expect, it } from "vitest";

import { defaultVolumeScenarios, runVolumeSuite } from "../src/runSimulations";

// Gate prasība: ≥10 000 pilnas spēles (ar solīšanu) sasniedz terminālu state un
// neizraisa nelegālu state. Noklusējumā 2500 spēles × 4 scenāriji = 10 000.
// Izstrādes ātrumam var samazināt: SIM_VOLUME=50 npm run test.
function resolvePerScenario(): number {
  const raw = Number.parseInt(process.env.SIM_VOLUME ?? "2500", 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 2500;
}

const perScenario = resolvePerScenario();
const totalGames = perScenario * defaultVolumeScenarios.length;

describe("volume gate (Phase 4.2)", () => {
  it(
    `runs ${totalGames} full games to a legal terminal state with no invariant violations`,
    () => {
      const summary = runVolumeSuite(perScenario, "volume-gate");

      expect(summary.total).toBe(totalGames);
      // assertInvariants pēc katras komandas izpildās dzinējā; jebkurš nelegāls
      // state vai neterminālā spēle parādītos kā failure ar paskaidrojumu.
      expect(summary.failures).toEqual([]);
      expect(summary.terminal).toBe(totalGames);

      // Mikss tiešām izmantoja timeout un disconnect ceļus pie mēroga.
      expect(summary.totalTimeouts).toBeGreaterThan(0);
      expect(summary.totalDisconnects).toBeGreaterThan(0);
    },
    600_000
  );
});
