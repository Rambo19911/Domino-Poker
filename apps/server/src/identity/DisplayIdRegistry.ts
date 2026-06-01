import { createSeededRng } from "@domino-poker/core/multiplayer";

/** Publiskā `displayId` forma: `#` + 5 cipari (piem. `#04217`). */
export const DISPLAY_ID_PATTERN = /^#\d{5}$/;

const DISPLAY_ID_SPACE = 100_000; // 00000..99999

/**
 * Piešķir un uztur publiskos `displayId` (`#?????`) spēlētājiem un botiem.
 *
 * - Atvasināts deterministiski no `playerId` (caur MP zonas seeded RNG), tāpēc
 *   tas pats `playerId` dod to pašu bāzes kandidātu.
 * - **Unikāls** reģistra ietvaros: sadursmē pārģenerē ar nākamo `salt`.
 * - **Stabils sesijā**: reiz piešķirtais `displayId` paliek nemainīgs, kamēr
 *   spēlētājs netiek atbrīvots.
 * - Boti izmanto **to pašu** formātu; AI atšķiršana (karogs) glabājas sēdvietu
 *   datos, ne pašā `displayId`.
 *
 * Pilns `playerId`/`clientId` netiek atklāts — citiem rāda tikai `displayId`.
 */
export class DisplayIdRegistry {
  private readonly byPlayer = new Map<string, string>();
  private readonly used = new Set<string>();

  /** Piešķir (vai atgriež jau piešķirto) `displayId` dotajam `playerId`. */
  assign(playerId: string): string {
    const key = playerId.trim();
    if (key === "") {
      throw new Error("DisplayIdRegistry.assign requires a non-empty playerId.");
    }

    const existing = this.byPlayer.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const displayId = this.deriveUnique(key);
    this.byPlayer.set(key, displayId);
    this.used.add(displayId);
    return displayId;
  }

  /** Atgriež jau piešķirto `displayId`, vai `undefined`, ja nav piešķirts. */
  get(playerId: string): string | undefined {
    return this.byPlayer.get(playerId.trim());
  }

  has(playerId: string): boolean {
    return this.byPlayer.has(playerId.trim());
  }

  /** Atbrīvo spēlētāja `displayId` (piem., kad viņš pamet); ļauj to atkārtoti izmantot. */
  release(playerId: string): void {
    const key = playerId.trim();
    const displayId = this.byPlayer.get(key);
    if (displayId === undefined) return;
    this.byPlayer.delete(key);
    this.used.delete(displayId);
  }

  size(): number {
    return this.byPlayer.size;
  }

  private deriveUnique(playerId: string): string {
    for (let salt = 0; salt < DISPLAY_ID_SPACE; salt += 1) {
      const candidate = formatDisplayId(deriveNumber(playerId, salt));
      if (!this.used.has(candidate)) {
        return candidate;
      }
    }
    throw new Error("DisplayIdRegistry exhausted the available displayId space.");
  }
}

function deriveNumber(playerId: string, salt: number): number {
  const rng = createSeededRng(`displayId:${playerId}:${salt}`);
  return Math.floor(rng() * DISPLAY_ID_SPACE);
}

function formatDisplayId(value: number): string {
  return `#${String(value).padStart(5, "0")}`;
}
