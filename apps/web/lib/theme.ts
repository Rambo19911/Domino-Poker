import type { AppStrings } from "./i18n";
import { readLocalStorage, removeLocalStorage } from "./safeStorage";

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
export type ThemeId =
  | "default"
  | "twilight"
  | "rain"
  | "pop-out"
  | "confetti"
  | "bubbles"
  | "luminous";

export const DEFAULT_THEME: ThemeId = "default";
export const THEME_STORAGE_KEY = "domino-poker-theme";

interface ThemeBase {
  readonly id: ThemeId;
  /** Veikala kataloga prece (`theme.<slug>`); nav bezmaksas Default tēmai. */
  readonly itemId?: string;
  /** Bezmaksas (vienmēr pieder). Default = true; pērkamās = false. */
  readonly free?: boolean;
}

/**
 * Tēmas nosaukums ir HIBRĪDS (diskriminēta union — tieši viens no diviem):
 * Default patur lokalizētu `labelKey`; pērkamās tēmas lieto EN literāli `name`
 * (tēmu nosaukumus NEtulkojam). Tā i18n parity netiek lauzta.
 */
export type ThemeOption =
  | (ThemeBase & { readonly labelKey: keyof AppStrings; readonly name?: never })
  | (ThemeBase & { readonly name: string; readonly labelKey?: never });

export const THEMES: readonly ThemeOption[] = [
  { id: "default", labelKey: "themeDefault", free: true },
  { id: "twilight", name: "Twilight", itemId: "theme.twilight", free: false },
  { id: "rain", name: "Rain Drops", itemId: "theme.rain", free: false },
  { id: "pop-out", name: "Pop Out", itemId: "theme.pop-out", free: false },
  { id: "confetti", name: "Confetti", itemId: "theme.confetti", free: false },
  { id: "bubbles", name: "Bubbles", itemId: "theme.bubbles", free: false },
  { id: "luminous", name: "Luminous", itemId: "theme.luminous", free: false }
];

/** Vai vērtība ir reģistrēts tēmas id (sargs pret bojātu/novecojušu localStorage). */
export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value != null && THEMES.some((theme) => theme.id === value);
}

/**
 * Vai tēma ir ATBLOĶĒTA (izvēlama) dotam piederošo preču (`itemId`) sarakstam: bezmaksas
 * (Default) VAI nopirkta (`itemId` ledger-atvasinātajā owned sarakstā, sk. `/store/owned`).
 * Fāze 5 — personalizācijas UI un sākuma-tēmas saskaņošana lieto ŠO, lai nesašķiras.
 */
export function isThemeUnlocked(option: ThemeOption, ownedItemIds: readonly string[]): boolean {
  return option.free === true || (option.itemId !== undefined && ownedItemIds.includes(option.itemId));
}

/**
 * Saskaņo GLABĀTO tēmu ar īpašumtiesībām (account-bound enforcement, P2). Ja glabātā tēma
 * nav derīga VAI nav atbloķēta dotajam owned sarakstam (anon → tukšs; nepiederoša maksas
 * tēma) → atstata uz Default (dzēš `localStorage` + noņem `data-theme`). Atgriež spēkā
 * esošo tēmu pēc saskaņošanas.
 *
 * Lieto DIVĀS vietās, lai semantika ir konsekventa: (1) `AppShell` uz katru auth identitātes
 * maiņu (login/logout/konta maiņa) — tā maksas tēma nepaliek aktīva bez īpašumtiesībām pat
 * tad, ja Personalization tabs netiek atvērts; (2) `PersonalizationPanel` pēc `/store/owned`.
 * Pre-paint bootstrap maksas tēmu pielieto optimistiski (FOUC novēršana); ŠĪ funkcija to
 * koriģē, tiklīdz īpašumtiesības ir zināmas.
 */
export function reconcileStoredTheme(ownedItemIds: readonly string[]): ThemeId {
  const stored = readLocalStorage(THEME_STORAGE_KEY);
  if (isThemeId(stored)) {
    const option = THEMES.find((theme) => theme.id === stored);
    if (option && isThemeUnlocked(option, ownedItemIds)) {
      return stored;
    }
  }
  // Nav derīga/atbloķēta glabātā tēma → Default (notīra atslēgu + noņem atribūtu).
  removeLocalStorage(THEME_STORAGE_KEY);
  applyTheme(DEFAULT_THEME);
  return DEFAULT_THEME;
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
  // Visas reģistrētās tēmas (pre-paint nevar pārbaudīt īpašumtiesības; nepiederošu glabāto
  // tēmu pēc `/store/owned` ielādes atstata `PersonalizationPanel` reconcile uz Default).
  const validIds = JSON.stringify(THEMES.map((theme) => theme.id));
  const key = JSON.stringify(THEME_STORAGE_KEY);
  const fallback = JSON.stringify(DEFAULT_THEME);
  // Otrā try: pre-paint veiktspējas heiristika (Fāze 5.5) — vājām/reduced-motion ierīcēm uzliek
  // `data-theme-motion="static"`, lai animētais fons atkrīt uz statisku posteri (sk. tokens.css).
  return (
    `(function(){var r=document.documentElement;` +
    `try{var t=localStorage.getItem(${key});if(t&&t!==${fallback}&&${validIds}.indexOf(t)!==-1){r.dataset.theme=t;}}catch(e){}` +
    `try{var w=(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)` +
    `||(navigator.deviceMemory&&navigator.deviceMemory<=2)` +
    `||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4);` +
    `if(w){r.dataset.themeMotion='static';}}catch(e){}})();`
  );
}

/**
 * Post-paint FPS zonde (Fāze 5.5): ja aktīva animēta tēma un kadru ātrums pirmajās ~1.5s
 * krīt zem sliekšņa, pārslēdz fonu uz statisku posteri (`data-theme-motion="static"`).
 * Papildina bootstrap pre-paint heiristikas (reduced-motion / deviceMemory / hardwareConcurrency).
 * No-op, ja statisks jau uzlikts vai animēta tēma nav aktīva. Drošs SSR (sargs pret nav-DOM).
 */
export function startMotionFpsProbe(): void {
  if (typeof document === "undefined" || typeof requestAnimationFrame === "undefined") return;
  const root = document.documentElement;
  if (root.dataset.themeMotion === "static") return; // jau statisks (heiristika)
  if (!root.dataset.theme) return; // animēta tēma nav aktīva → nav ko sargāt

  const DURATION_MS = 1500;
  const MIN_FPS = 40;
  let frames = 0;
  let start = -1;
  const tick = (now: number): void => {
    if (start < 0) start = now;
    frames += 1;
    const elapsed = now - start;
    if (elapsed >= DURATION_MS) {
      const fps = (frames / elapsed) * 1000;
      if (fps < MIN_FPS) root.dataset.themeMotion = "static";
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
