import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE } from "@insurance/shared";
import ar from "./ar";
import en, { type Messages } from "./en";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: Messages };
  }
}

// Every string is bundled, so init is synchronous and switching language is
// instant. The server always renders English; the client switches to the
// saved language right after hydration (see LocaleProvider).
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false }, // React already escapes
    initAsync: false,
    returnNull: false,
  });
}

export * from "./locale";
export default i18n;
