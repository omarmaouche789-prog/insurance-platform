"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LOCALE_OPTIONS } from "../lib/i18n";
import { useLocale } from "../lib/i18n/LocaleProvider";
import { cn } from "./ui/cn";

// Navbar language picker. Switching is instant (all strings are bundled);
// the choice is saved locally and, when signed in, on the account.
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = LOCALE_OPTIONS.find((o) => o.value === locale) ?? LOCALE_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    root.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("language.choose")}: ${current.label}`}
        title={t("language.label")}
      >
        <span className="text-base leading-none" aria-hidden>
          {current.flag}
        </span>
        <span className="hidden font-medium lg:inline">{current.label}</span>
        <Languages className="h-4 w-4 lg:hidden" aria-hidden />
        <ChevronDown className="hidden h-3.5 w-3.5 text-gray-400 lg:block" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t("language.label")}
          className="absolute end-0 z-40 mt-2 w-48 animate-pop-in overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-overlay"
        >
          <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-gray-400">{t("language.label")}</p>
          {LOCALE_OPTIONS.map((o) => {
            const active = o.value === locale;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                lang={o.value}
                dir={o.value === "ar" ? "rtl" : "ltr"}
                onClick={() => {
                  setLocale(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none",
                  active ? "font-medium text-gray-900" : "text-gray-700",
                )}
              >
                <span className="text-base leading-none" aria-hidden>
                  {o.flag}
                </span>
                <span className="flex-1 text-start">{o.label}</span>
                {active && <Check className="h-4 w-4 text-indigo-600" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
