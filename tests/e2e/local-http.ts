import { expect, test, type APIRequestContext } from "@playwright/test";

// Kopīgs lokālā pieprasījuma slānis metadatu un strukturēto datu testiem.
//
// Šeit ir iekapsulēta viena drošības garantija: SEO testi salīdzina absolūtas produkcijas
// adreses, bet nedrīkst nevienu no tām IELĀDĒT. Divas kopijas nozīmētu, ka labojums
// jāizdara divreiz, tāpēc garantija dzīvo vienā vietā.
//
// Fails nav `*.spec.ts`, tāpēc Playwright to nesavāc kā testu.

export const LOCAL_HOSTNAME = "127.0.0.1";

/**
 * Ceļam jābūt lokālam JAU PIRMS izsūtīšanas. `//host/ceļš` ir shēmrelatīvs URL: Playwright
 * to atrisinātu pret ĀRĒJU resursdatoru, un atbildes pārbaude notiktu par vēlu — dati jau
 * būtu aizgājuši. Tāpēc lokalitāti pārbauda pirms `request.get()`, ne pēc tā.
 */
export function expectLocalPath(path: string): void {
  expect(path.startsWith("/"), `${path} nav absolūts ceļš`).toBe(true);
  expect(path.startsWith("//"), `${path} ir shēmrelatīvs URL`).toBe(false);
  expect(new URL(path, `http://${LOCAL_HOSTNAME}`).hostname, `${path} resursdators`).toBe(
    LOCAL_HOSTNAME
  );
}

/**
 * Lokāls `GET` bez pāradresācijām. Atgriež `200` vai krīt.
 *
 * Adrese tiek uzbūvēta PILNĪBĀ un pārbaudīta pirms izsūtīšanas, nevis atstāta kā relatīvs
 * ceļš, ko atrisina `baseURL`: tā garantija ir pašā funkcijā, nevis konfigurācijā, un
 * `playwright.config.ts` maiņa uz ārēju izcelsmi to vairs nevar klusi apiet.
 */
export async function getLocal(
  request: APIRequestContext,
  path: string,
  headers?: Record<string, string>
) {
  expectLocalPath(path);

  const baseURL = test.info().project.use.baseURL;
  expect(baseURL, "baseURL nav iestatīts").toBeTruthy();
  expect(new URL(baseURL!).hostname, "baseURL resursdators").toBe(LOCAL_HOSTNAME);

  const target = new URL(path, baseURL).href;
  expect(new URL(target).hostname, `${path} mērķa resursdators`).toBe(LOCAL_HOSTNAME);

  // `headers` ļauj pieprasīt to pašu lapu ar rāpotāja `User-Agent`. Lokalitātes garantija
  // no tā nemainās — mainās tikai tas, KĀ serveris pieprasījumu redz.
  const response = await request.get(target, { maxRedirects: 0, headers });
  // Ar noklusējumu Playwright seko līdz 20 pāradresācijām — pāradresācija varētu aizvest
  // līdz produkcijai un atgriezt tās `200` kā mūsējo. Ar `maxRedirects: 0` atgriežas pats
  // `3xx`, un šis apgalvojums to noraida.
  expect(response.status(), `${path} HTTP statuss`).toBe(200);
  expect(new URL(response.url()).hostname, `${path} atbildes resursdators`).toBe(LOCAL_HOSTNAME);
  return response;
}
