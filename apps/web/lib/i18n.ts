import { en } from "./locales/en";
import { lv } from "./locales/lv";
import { et } from "./locales/et";
import { lt } from "./locales/lt";
import { pl } from "./locales/pl";
import { de } from "./locales/de";
import { fr } from "./locales/fr";
import { es } from "./locales/es";
import { sv } from "./locales/sv";
import { no } from "./locales/no";
import { fi } from "./locales/fi";
import { da } from "./locales/da";
import { it } from "./locales/it";
import { nl } from "./locales/nl";
import { cs } from "./locales/cs";
import { uk } from "./locales/uk";
import { ro } from "./locales/ro";
import { pt } from "./locales/pt";
import { sk } from "./locales/sk";
import { hu } from "./locales/hu";
import { be } from "./locales/be";

export const defaultLocale = "en";

export type AppStrings = Record<keyof typeof en, string>;

export const appStrings = {
  en,
  lv,
  et,
  lt,
  pl,
  de,
  fr,
  es,
  sv,
  no,
  fi,
  da,
  it,
  nl,
  cs,
  uk,
  ro,
  pt,
  sk,
  hu,
  be
} as const satisfies Record<string, AppStrings>;

export type Locale = keyof typeof appStrings;

export const locales = [
  { code: "en", labelKey: "english" },
  { code: "lv", labelKey: "latvian" },
  { code: "et", labelKey: "estonian" },
  { code: "lt", labelKey: "lithuanian" },
  { code: "pl", labelKey: "polish" },
  { code: "de", labelKey: "german" },
  { code: "fr", labelKey: "french" },
  { code: "es", labelKey: "spanish" },
  { code: "sv", labelKey: "swedish" },
  { code: "no", labelKey: "norwegian" },
  { code: "fi", labelKey: "finnish" },
  { code: "da", labelKey: "danish" },
  { code: "it", labelKey: "italian" },
  { code: "nl", labelKey: "dutch" },
  { code: "cs", labelKey: "czech" },
  { code: "uk", labelKey: "ukrainian" },
  { code: "ro", labelKey: "romanian" },
  { code: "pt", labelKey: "portuguese" },
  { code: "sk", labelKey: "slovak" },
  { code: "hu", labelKey: "hungarian" },
  { code: "be", labelKey: "belarusian" }
] as const satisfies readonly { readonly code: Locale; readonly labelKey: keyof AppStrings }[];

export function getAppStrings(locale: Locale = defaultLocale): AppStrings {
  return appStrings[locale];
}

export function isLocale(value: string): value is Locale {
  return value in appStrings;
}

/**
 * Sašaurina jebkuru UI valodu uz e-pasta lokāli. Sistēmas e-pasti (paroles
 * atjaunošana, kontaktforma, bana paziņojums) ir tikai LV/EN (`EmailLocale`
 * serverī), tāpēc visas pārējās valodas grimst uz `en`. Viens kartēšanas avots,
 * lai nedublētu trijus ternārus.
 */
export function emailLocale(locale: Locale): "lv" | "en" {
  return locale === "lv" ? "lv" : "en";
}
