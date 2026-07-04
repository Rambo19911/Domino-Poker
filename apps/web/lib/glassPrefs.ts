import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "./safeStorage";

/**
 * Dialogu STIKLA personalizācija — divi neatkarīgi pārslēdzēji, kas vada centralizēto
 * glass izskatu (`Dialog.tsx` → `.glass .glass-strong`; sk. `styles/glass.css` +
 * `styles/tokens.css`). Tāpat kā tēma (sk. `lib/theme.ts`), tas ir TĪRI CSS/DOM jēdziens:
 * pielieto caur `<html>` atribūtiem, ko lasa CSS; React uz to nereaģē. Stāvoklis dzīvo
 * `localStorage` + inline pre-paint bootstrap (FOUC novēršana), NE `AppShell`.
 *
 *  - "Dark Glass" (tumšais tonis): OFF (noklusējums) = bez toņa (dzidrs); ON
 *    (`data-dark-glass="on"`) = izteikts tumšs frosted tonis.
 *  - "Glass" (aizmiglojums/blur): OFF (noklusējums) = bez blur (caurspīdīgums paliek); ON
 *    (`data-glass="on"`) = `backdrop-filter` blur.
 *
 * Konvencija (spogulis tēmai, bet apgriezta noklusējuma dēļ): noklusējums (OFF) NEGLABĀ
 * atslēgu un NEUZLIEK atribūtu; glabājam tikai "on" — tā `localStorage` un DOM paliek
 * tīri, kad viss ir noklusējumā. Atribūta KLĀTBŪTNE (`="on"`) = funkcija ieslēgta.
 */
export const GLASS_STORAGE_KEY = "domino-poker-glass";
export const DARK_GLASS_STORAGE_KEY = "domino-poker-dark-glass";

/** Blur (aizmiglojums) ieslēgts? Noklusējums OFF; ON tikai ja glabāts tieši "on". */
export function readGlassEnabled(): boolean {
  return readLocalStorage(GLASS_STORAGE_KEY) === "on";
}

/** Tumšais tonis ieslēgts? Noklusējums OFF; ON tikai ja glabāts tieši "on". */
export function readDarkGlassEnabled(): boolean {
  return readLocalStorage(DARK_GLASS_STORAGE_KEY) === "on";
}

/** Pielieto blur pārslēgu uz `<html data-glass>` (OFF = atribūtu noņem = noklusējums). */
export function applyGlass(enabled: boolean): void {
  const root = document.documentElement;
  if (enabled) root.dataset.glass = "on";
  else delete root.dataset.glass;
}

/** Pielieto toņa pārslēgu uz `<html data-dark-glass>` (OFF = atribūtu noņem = noklusējums). */
export function applyDarkGlass(enabled: boolean): void {
  const root = document.documentElement;
  if (enabled) root.dataset.darkGlass = "on";
  else delete root.dataset.darkGlass;
}

/** Saglabā + pielieto blur izvēli (ON glabā "on"; OFF dzēš atslēgu). */
export function setGlassEnabled(enabled: boolean): void {
  if (enabled) writeLocalStorage(GLASS_STORAGE_KEY, "on");
  else removeLocalStorage(GLASS_STORAGE_KEY);
  applyGlass(enabled);
}

/** Saglabā + pielieto toņa izvēli (ON glabā "on"; OFF dzēš atslēgu). */
export function setDarkGlassEnabled(enabled: boolean): void {
  if (enabled) writeLocalStorage(DARK_GLASS_STORAGE_KEY, "on");
  else removeLocalStorage(DARK_GLASS_STORAGE_KEY);
  applyDarkGlass(enabled);
}

/**
 * Inline bootstrap (`beforeInteractive`): pielieto glabātos "on" stāvokļus PIRMS pirmās
 * krāsošanas, lai nav stikla mirgojuma. Ģenerēts no tām pašām atslēgām (nekas nav dublēts).
 * Neapstrādāts `localStorage` ar `try/catch` (nav React).
 */
export function getGlassBootstrapScript(): string {
  const glassKey = JSON.stringify(GLASS_STORAGE_KEY);
  const darkKey = JSON.stringify(DARK_GLASS_STORAGE_KEY);
  return (
    `(function(){var r=document.documentElement;try{` +
    `if(localStorage.getItem(${glassKey})==='on'){r.dataset.glass='on';}` +
    `if(localStorage.getItem(${darkKey})==='on'){r.dataset.darkGlass='on';}` +
    `}catch(e){}})();`
  );
}
