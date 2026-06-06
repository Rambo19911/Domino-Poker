import { readLocalStorage, writeLocalStorage } from "../safeStorage";

/** localStorage atslēga stabilajam klienta identifikatoram. */
export const CLIENT_ID_STORAGE_KEY = "domino-poker-client-id";

/**
 * Atgriež stabilu `clientId` šim pārlūkam. Pirmajā atvēršanā ģenerē UUID un
 * saglabā `safeStorage`; turpmāk atgriež to pašu. `clientId` ir privātais
 * savienojuma identifikators (sūtīts `HELLO`); publiski tiek rādīts tikai
 * servera `displayId`.
 */
export function getOrCreateClientId(): string {
  const existing = readLocalStorage(CLIENT_ID_STORAGE_KEY);
  if (existing !== null && existing.trim() !== "") {
    return existing;
  }
  const created = generateClientId();
  writeLocalStorage(CLIENT_ID_STORAGE_KEY, created);
  return created;
}

function generateClientId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (randomUUID) {
    return randomUUID.call(globalThis.crypto);
  }
  // Defensīvs fallback (praksē visi mērķpārlūki atbalsta crypto.randomUUID).
  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
