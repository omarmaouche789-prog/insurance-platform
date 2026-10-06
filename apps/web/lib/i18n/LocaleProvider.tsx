"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { DEFAULT_LOCALE, type Locale } from "@insurance/shared";
import { apiFetch } from "../api";
import { useAuth } from "../auth-context";
import i18n, { directionFor, readStoredLocale, storeLocale } from "./index";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function apply(locale: Locale) {
  void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  document.documentElement.dir = directionFor(locale);
}

// Owns the UI language. Saved in localStorage for every visitor and on the
// user's account when signed in. On sign-in the account's saved language
// wins, so it follows the user across devices.
export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  const switchTo = useCallback((next: Locale) => {
    apply(next);
    storeLocale(next);
    setLocaleState(next);
  }, []);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) switchTo(stored);
  }, [switchTo]);

  const accountLocale = user?.locale;
  useEffect(() => {
    if (accountLocale) switchTo(accountLocale);
  }, [user?.id, accountLocale, switchTo]);

  const setLocale = useCallback(
    (next: Locale) => {
      switchTo(next);
      if (accessToken) {
        // Best effort: the switch has already happened on screen.
        apiFetch("/api/users/me/preferences", { method: "PUT", accessToken, body: JSON.stringify({ locale: next }) }).catch(() => undefined);
      }
    },
    [accessToken, switchTo],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used inside LocaleProvider");
  return ctx;
}
