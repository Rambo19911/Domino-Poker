/**
 * Koplietota `matches.players_json` anonimizācijas loģika (Fāze 4B.2, D5) — lieto GAN
 * `SqliteStorage` (TEXT), GAN `PostgresStorage` (JSONB). Noņem (DZĒŠ) dzēstā lietotāja
 * `userId` + `clientId` no viņa sēdvietām; saglabā `seatIndex/corePlayerId/kind/displayId`
 * replay integritātei. Lauki tiek DZĒSTI (nevis null), lai atbilstu `string | undefined`
 * tipam un `!== undefined` patērētājiem (piem. `MatchPayoutService`).
 */

/**
 * Skrubo sēdvietu masīvu. `input` var būt JSON virkne (SQLite) vai jau parsēts masīvs (PG JSONB).
 * Atgriež jauno sēdvietu masīvu, JA kaut kas mainījās; citādi `undefined` (izsaucējs izlaiž UPDATE).
 */
export function scrubSeats(input: unknown, userId: string): readonly Record<string, unknown>[] | undefined {
  const seats = parseSeats(input);
  if (seats === undefined) {
    return undefined;
  }
  let changed = false;
  const result = seats.map((seat) => {
    if (seat !== null && typeof seat === "object" && (seat as Record<string, unknown>).userId === userId) {
      const { userId: _u, clientId: _c, ...rest } = seat as Record<string, unknown>;
      changed = true;
      return rest;
    }
    return seat as Record<string, unknown>;
  });
  return changed ? result : undefined;
}

/** Parsē players_json (virkne vai masīvs) → sēdvietu masīvs vai `undefined`, ja forma neder. */
function parseSeats(input: unknown): readonly unknown[] | undefined {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return undefined;
    }
  }
  return Array.isArray(value) ? value : undefined;
}
