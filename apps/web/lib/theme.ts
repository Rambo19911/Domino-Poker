import type { AppStrings } from "./i18n";

/**
 * Krāsu tēmas (vizuālā personalizācija). Tēma ir TĪRI CSS/DOM jēdziens — pielieto
 * caur `<html data-theme="<id>">`, kas pārraksta `tokens.css` tokenus; React nekas
 * uz to nereaģē. Tāpēc stāvoklis nedzīvo `AppShell`, bet ir pašpietiekams:
 * `PersonalizationPanel` (profila dialogā) lasa/raksta `localStorage` un pielieto
 * atribūtu; inline bootstrap (sk. `getThemeBootstrapScript`) to izdara pirms
 * krāsošanas (FOUC novēršana).
 *
 * Pagaidām eksistē tikai noklusējuma ("Default") tēma. Jaunu pievieno: (1) bloks
 * `[data-theme="<id>"]` `tokens.css`; (2) jauns `ThemeId` + ieraksts `THEMES` šeit;
 * (3) lokalizēts `labelKey`. UI saraksts un bootstrap atjaunojas automātiski.
 */
export type ThemeId = "default";

export const DEFAULT_THEME: ThemeId = "default";
export const THEME_STORAGE_KEY = "domino-poker-theme";

export interface ThemeOption {
  readonly id: ThemeId;
  /** Lokalizācijas atslēga tēmas nosaukumam. */
  readonly labelKey: keyof AppStrings;
}

export const THEMES: readonly ThemeOption[] = [{ id: "default", labelKey: "themeDefault" }];

/** Vai vērtība ir reģistrēts tēmas id (sargs pret bojātu/novecojušu localStorage). */
export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value != null && THEMES.some((theme) => theme.id === value);
}

/**
 * Pielieto tēmu uz `<html data-theme>`. Noklusējumam atribūtu NOŅEM (tad spēkā ir
 * `:root` = Default) — tīrāk nekā glabāt `data-theme="default"` bez atbilstoša bloka.
 */
export function applyTheme(id: ThemeId): void {
  const root = document.documentElement;
  if (id === DEFAULT_THEME) {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = id;
  }
}

/**
 * Inline bootstrap skripts (`beforeInteractive`): pielieto saglabāto tēmu PIRMS
 * pirmās krāsošanas, lai nav īslaicīga noklusējuma tēmas mirgojuma. Ģenerēts no
 * tām pašām konstantēm (atslēga, noklusējums, derīgie id), lai nekas nav dublēts.
 * Inline skriptā lieto neapstrādātu `localStorage` ar `try/catch` (nav React).
 */
export function getThemeBootstrapScript(): string {
  const validIds = JSON.stringify(THEMES.map((theme) => theme.id));
  const key = JSON.stringify(THEME_STORAGE_KEY);
  const fallback = JSON.stringify(DEFAULT_THEME);
  return `(function(){try{var t=localStorage.getItem(${key});if(t&&t!==${fallback}&&${validIds}.indexOf(t)!==-1){document.documentElement.dataset.theme=t;}}catch(e){}})();`;
}
