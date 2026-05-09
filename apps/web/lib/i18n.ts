import { en } from "./locales/en";
import { lv } from "./locales/lv";

export const defaultLocale = "en";

export type AppStrings = Record<keyof typeof en, string>;

export const appStrings = {
  en,
  lv
} as const satisfies Record<string, AppStrings>;

export type Locale = keyof typeof appStrings;

export const locales = [
  { code: "en", labelKey: "english" },
  { code: "lv", labelKey: "latvian" }
] as const satisfies readonly { readonly code: Locale; readonly labelKey: keyof AppStrings }[];

export function getAppStrings(locale: Locale = defaultLocale): AppStrings {
  return appStrings[locale];
}

export function isLocale(value: string): value is Locale {
  return value in appStrings;
}
