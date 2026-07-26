/**
 * Domino Slots math (math v3) — ported from the standalone PixiJS game. Pure
 * logic only: no DOM, no Pixi, no balance persistence and no RNG implementation.
 * The server supplies a RandomSource and owns settlement; the web client uses
 * the same modules to render an outcome the server already decided.
 *
 * Comments below cite "docs/01" section numbers — that is the Latvian math
 * specification at docs/01-algoritmi-un-aprekini.md, ported verbatim from the
 * standalone game in integration phase 8 (T8.2). It is the authoritative source
 * for RTP and the combination rules; this code must not diverge from it.
 */
export * from "./domain/symbols";
export * from "./domain/domino";
export * from "./domain/money";
export * from "./domain/outcomes";
export * from "./domain/spin";
export * from "./config/gameConfig";
export * from "./config/mathConfig";
export * from "./config/paytable";
export * from "./math/RandomSource";
export * from "./math/randomInt";
export * from "./math/columnGenerator";
export * from "./math/lineEvaluator";
export * from "./math/scatterEvaluator";
export * from "./math/spinEvaluator";
