import { beforeAll, describe, expect, it } from "vitest";

import { runExactAudit, type ExactAuditResult } from "./mathAudit";

/**
 * Exact expected values fixed in docs/01 sections 9.1-9.4 (math v3: 11 lines,
 * floating runs, major boosters). The line/scatter/total RTP values are exact
 * enumerations with the production evaluator; the mc* metrics are a seeded,
 * fully deterministic Monte Carlo over the production grid generator, so every
 * digit below must match too.
 *
 * These numbers must NOT move when the line bet steps are rescaled — RTP is a
 * ratio of payout to bet. A change here means the paytable or the symbol
 * weights moved, which is an economy decision, not a refactor.
 *
 * Slow (full 128^5 enumeration + 1M seeded spins), so it is excluded from the
 * default `npm test` run and lives behind `npm run test:math`.
 */
describe("exact math audit", () => {
  const digits = 10;
  let audit: ExactAuditResult;

  beforeAll(() => {
    audit = runExactAudit();
  }, 600_000);

  it("line outcome family probabilities match docs/01 section 9.1", () => {
    const expected: Record<string, number> = {
      nowin: 0.904742536135,
      trumpcombo: 0.025989326066,
      acecombo: 0.011307247623,
      "tiercombo:high-regular": 0.011307247623,
      "tiercombo:mid-regular": 0.006571092526,
      "tiercombo:low-regular": 0.001358919719,
      "exact:ace": 0.007892867317,
      "exact:high-regular": 0.007885908242,
      "exact:mid-regular": 0.006845521275,
      "exact:low-regular": 0.004442298407,
      "exact:low-trump": 0.003620743286,
      "exact:high-trump": 0.003620743286,
      "exact:royal-trump": 0.002646769281,
      allwild: 0.001768779213
    };
    for (const [family, probability] of Object.entries(expected)) {
      expect(audit.lineFamilies.get(family) ?? 0, family).toBeCloseTo(probability, digits);
    }
    // Majors no longer form their own paying families (math v3).
    expect(audit.lineFamilies.has("exact:vase")).toBe(false);
    expect(audit.lineFamilies.has("exact:scarab")).toBe(false);
  });

  it("line hit rate and line RTP match", () => {
    expect(audit.lineHitRate).toBeCloseTo(0.095257463865, digits);
    expect(audit.lineRtp).toBeCloseTo(0.927853851288, digits);
  });

  it("jackpot scatter distribution matches docs/01 section 9.2", () => {
    expect(audit.jackpotDistribution[0]).toBeCloseTo(0.700846043821, digits);
    expect(audit.jackpotDistribution[1]).toBeCloseTo(0.251899911755, digits);
    expect(audit.jackpotDistribution[2]).toBeCloseTo(0.042460861492, digits);
    expect(audit.jackpotDistribution[3]).toBeCloseTo(0.004450748069, digits);
    expect(audit.jackpotDistribution[4]).toBeCloseTo(0.000324308806, digits);
    expect(audit.jackpotDistribution[5]).toBeCloseTo(0.000017394011, digits);
    expect(audit.jackpotTriggerRate).toBeCloseTo(0.004793182932, digits);
  });

  it("RTP splits match docs/01 section 9.3", () => {
    expect(audit.scatterRtp).toBeCloseTo(0.032174066187, digits);
    expect(audit.totalRtp).toBeCloseTo(0.960027917475, digits);
    expect(audit.houseEdge).toBeCloseTo(0.039972082525, digits);
  });

  it("the highest boosted single-line win matches docs/01 section 9.4", () => {
    // Exact royal trump 5 (53.5x) from a royal pair plus three Scarab
    // boosters: x(1 + 6) = 374.5x the line bet. Larger than All Wild 5.
    expect(audit.maxLineWinLineBetMultiple).toBeCloseTo(374.5, digits);
  });

  it("seeded Monte Carlo sanity metrics match docs/01 section 9.5", () => {
    expect(audit.mcSpins).toBe(1_000_000);
    expect(audit.mcHitRate).toBeCloseTo(0.568425, digits);
    expect(audit.mcProfitRate).toBeCloseTo(0.227377, digits);
    expect(audit.mcPushRate).toBeCloseTo(0.002663, digits);
    expect(audit.mcRtp).toBeCloseTo(0.960426204545, digits);
    // Broad sanity threshold: the seeded estimate must land near the exact
    // RTP; the exact value above is the authoritative number.
    expect(Math.abs(audit.mcRtp - audit.totalRtp)).toBeLessThan(0.02);
  });

  it("line family probabilities sum to 1", () => {
    const sum = [...audit.lineFamilies.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 12);
  });

  it("per-family RTP contributions sum to the line RTP", () => {
    const sum = [...audit.lineFamilyRtp.values()].reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(audit.lineRtp, 12);
  });
});
