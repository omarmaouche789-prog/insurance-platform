"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { PublicStatusDTO } from "@insurance/shared";
import { SYSTEM_SETTINGS_DEFAULTS } from "@insurance/shared";
import { setDisplayPreferences } from "./format";

const POLL_MS = 60_000;
const CACHE_KEY = "siteSettings";

export const DEFAULT_PUBLIC_STATUS: PublicStatusDTO = {
  maintenance: { enabled: false, message: SYSTEM_SETTINGS_DEFAULTS.maintenance.maintenanceMessage },
  features: {
    twoFactorRequired: SYSTEM_SETTINGS_DEFAULTS.features.twoFactor,
    analytics: SYSTEM_SETTINGS_DEFAULTS.features.analytics,
    blog: SYSTEM_SETTINGS_DEFAULTS.features.blog,
  },
  general: SYSTEM_SETTINGS_DEFAULTS.general,
  localization: SYSTEM_SETTINGS_DEFAULTS.localization,
};

interface SiteSettingsValue {
  status: PublicStatusDTO;
  // False until the first response (or cached copy) arrives.
  loaded: boolean;
  refresh: () => Promise<void>;
}

const SiteSettingsContext = createContext<SiteSettingsValue>({ status: DEFAULT_PUBLIC_STATUS, loaded: false, refresh: async () => undefined });

function readCache(): PublicStatusDTO | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PublicStatusDTO) : null;
    // Never trust a cached maintenance flag: only the live answer counts.
    return parsed?.general && parsed.localization ? { ...parsed, maintenance: DEFAULT_PUBLIC_STATUS.maintenance } : null;
  } catch {
    return null;
  }
}

// The public half of System Settings (branding, date formats, which features
// are on, maintenance) for every visitor. Polls /api/status so a change
// reaches open tabs within a minute, and re-checks on focus and navigation.
export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<PublicStatusDTO>(DEFAULT_PUBLIC_STATUS);
  const [loaded, setLoaded] = useState(false);

  const apply = useCallback((next: PublicStatusDTO) => {
    setDisplayPreferences(next.localization);
    setStatus(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as PublicStatusDTO;
      apply(next);
      setLoaded(true);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        // Private mode: fine, just no cache for next time.
      }
    } catch {
      // The API being unreachable isn't maintenance; keep the last answer.
    }
  }, [apply]);

  useEffect(() => {
    const cached = readCache();
    if (cached) apply(cached);
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [apply, refresh]);

  // A page change right after a setting changes picks it up without waiting.
  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  return <SiteSettingsContext.Provider value={{ status, loaded, refresh }}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings(): SiteSettingsValue {
  return useContext(SiteSettingsContext);
}
