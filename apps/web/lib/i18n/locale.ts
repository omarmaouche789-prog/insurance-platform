import { isLocale, RTL_LOCALES, type Locale } from "@insurance/shared";

// Plain helpers with no React or i18next import, so the server-rendered root
// layout can use LOCALE_INIT_SCRIPT.

export const LOCALE_STORAGE_KEY = "locale";

export const LOCALE_OPTIONS: { value: Locale; label: string; flag: string }[] = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "ar", label: "العربية", flag: "🇸🇦" },
];

export function directionFor(locale: Locale): "rtl" | "ltr" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

export function readStoredLocale(): Locale | null {
  try {
    const value = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable (private mode); the choice just won't persist.
  }
}

// Runs before React hydrates (inlined in the root layout) so a right-to-left
// page never paints left-to-right first.
export const LOCALE_INIT_SCRIPT = `(function(){try{var l=localStorage.getItem("${LOCALE_STORAGE_KEY}");if(l==="ar"){document.documentElement.lang="ar";document.documentElement.dir="rtl";}}catch(e){}})();`;

