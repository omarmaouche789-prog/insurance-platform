"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, describeApiError } from "./api";
import { useAuth } from "./auth-context";

export interface ApiQuery<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T)) => void;
}

// Loads an authenticated GET endpoint and re-fetches whenever the path
// changes. Pass null to wait (e.g. until a route param is known). A response
// for a path that's since changed is ignored, so fast filter changes can't
// render stale results.
export function useApiQuery<T>(path: string | null, fallbackError = "Couldn't load this page"): ApiQuery<T> {
  const { accessToken } = useAuth();
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!path || !accessToken) return;
    const id = ++latest.current;
    setLoading(true);
    apiFetch<T>(path, { accessToken })
      .then((res) => {
        if (id !== latest.current) return;
        setDataState(res);
        setError(null);
      })
      .catch((err) => {
        if (id !== latest.current) return;
        setError(describeApiError(err, fallbackError));
      })
      .finally(() => {
        if (id === latest.current) setLoading(false);
      });
  }, [path, accessToken, nonce, fallbackError]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setDataState((prev) => (typeof updater === "function" ? (updater as (p: T | null) => T)(prev) : updater));
  }, []);

  return { data, error, loading, reload, setData };
}

// Debounces a fast-changing value (search boxes) before it hits the API.
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
