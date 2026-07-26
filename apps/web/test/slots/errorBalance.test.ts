import { describe, expect, it } from "vitest";

import { readErrorBalance } from "../../lib/slots/slotsApi";

/**
 * T7.7 — 402 korpusa lasītājs. Šis ir vienīgais ceļš, pa kuru autoritatīvā bilance
 * ienāk pēc NORAIDĪTA grieziena, tāpēc tas tiek pārbaudīts tieši, ne tikai caur jau
 * normalizētu `SpinFailure`: kļūdas korpuss nekad nedrīkst kļūt par bojātu bilanci.
 */

describe("readErrorBalance (402 korpuss)", () => {
  it("nolasa derīgu veselu bilanci", () => {
    expect(readErrorBalance({ error: "insufficient_coins", balance: 4_780 })).toBe(4_780);
  });

  it("pieņem nulli — tukšs konts ir derīga autoritatīva atbilde", () => {
    expect(readErrorBalance({ error: "insufficient_coins", balance: 0 })).toBe(0);
  });

  it.each([
    ["trūkst lauka", { error: "insufficient_coins" }],
    ["daļskaitlis", { balance: 12.5 }],
    ["negatīvs", { balance: -1 }],
    ["ārpus droša veselā", { balance: Number.MAX_SAFE_INTEGER + 2 }],
    ["NaN", { balance: Number.NaN }],
    ["bezgalība", { balance: Number.POSITIVE_INFINITY }],
    ["virkne", { balance: "5000" }],
    ["null korpuss", null],
    ["nav objekts", "insufficient_coins"],
    ["undefined (nebija JSON)", undefined]
  ])("atmet: %s", (_name, body) => {
    expect(readErrorBalance(body)).toBeUndefined();
  });
});
