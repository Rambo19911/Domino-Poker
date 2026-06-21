import { jsonInit, requestJson, type AuthResult } from "../auth/authApi";

/**
 * Kontaktformas klienta API (pret servera `POST /contact`). Nevajag tokenu —
 * jebkurš apmeklētājs var nosūtīt ziņu. Serveris validē, rate-limito pēc IP un
 * pārsūta uz īpašnieka e-pastu. `503/404` → funkcija serverī nav konfigurēta.
 */
export function apiContact(
  email: string,
  message: string,
  locale: "lv" | "en"
): Promise<AuthResult<{ ok: true }>> {
  return requestJson<{ ok: true }>("/contact", jsonInit("POST", { email, message, locale }));
}
