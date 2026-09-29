"use client";

import { useEffect, useState } from "react";

// Only same-origin relative paths are allowed as a post-login destination;
// "//evil.com" and "/\evil.com" are protocol-relative to browsers.
export function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

// Read from window.location after mount (rather than useSearchParams) so the
// login/register pages don't need a Suspense boundary to build statically.
export function useNextPath(): string | null {
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    setNext(safeNextPath(new URLSearchParams(window.location.search).get("next")));
  }, []);
  return next;
}
