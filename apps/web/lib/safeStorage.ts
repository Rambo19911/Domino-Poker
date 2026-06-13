export function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalStorage(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Dzēš atslēgu (drošs, ja localStorage nav pieejams). Lieto "atpakaļ uz noklusējumu". */
export function removeLocalStorage(key: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sesijas glabātuve (`sessionStorage`): pārdzīvo tās pašas cilnes refresh, BET
 * NE jaunu cilni / pārlūka aizvēršanu. Piemērota īslaicīgam UI stāvoklim, kas
 * jāatjauno pēc pārlādes, bet nedrīkst kļūt par pastāvīgu noklusējumu (piem.
 * "atgriezties MP lobby pēc refresh" — sk. AppShell screen restore).
 */
export function readSessionStorage(key: string): string | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionStorage(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
