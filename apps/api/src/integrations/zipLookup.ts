import type { ZipLocationDTO } from "@insurance/shared";
import { env } from "../lib/env";
import { fetchWithRetry, type FetchLike } from "../lib/http";

// Adapter boundary for ZIP validation / geocoding. SmartyStreets when
// SMARTY_AUTH_ID/SMARTY_AUTH_TOKEN are set, else the static table below.
export interface ZipLookupAdapter {
  lookup(zipCode: string): Promise<ZipLocationDTO | null>;
}

export const ZIP_CODE_PATTERN = /^\d{5}$/;

// ─── Static table ────────────────────────────────────────────────────────────

// ZIPs the seed data sells plans in, so the UI can show a city name for them.
const KNOWN_ZIPS: Record<string, { city: string; state: string }> = {
  "90001": { city: "Los Angeles", state: "CA" },
  "94103": { city: "San Francisco", state: "CA" },
  "10001": { city: "New York", state: "NY" },
  "11201": { city: "Brooklyn", state: "NY" },
  "78701": { city: "Austin", state: "TX" },
  "33101": { city: "Miami", state: "FL" },
};

// Inclusive 3-digit ZIP prefix ranges → state, for ZIPs not in the table above.
const PREFIX_RANGES: Array<[number, number, string]> = [
  [100, 149, "NY"],
  [320, 349, "FL"],
  [600, 629, "IL"],
  [750, 799, "TX"],
  [900, 961, "CA"],
];

// Used in dev/tests, and as the degraded-mode fallback when Smarty is down.
export class MockZipLookupAdapter implements ZipLookupAdapter {
  async lookup(zipCode: string): Promise<ZipLocationDTO | null> {
    if (!ZIP_CODE_PATTERN.test(zipCode)) return null;

    const known = KNOWN_ZIPS[zipCode];
    if (known) return { zipCode, ...known };

    const prefix = Number(zipCode.slice(0, 3));
    const range = PREFIX_RANGES.find(([lo, hi]) => prefix >= lo && prefix <= hi);
    return range ? { zipCode, state: range[2], city: null } : null;
  }
}

// ─── SmartyStreets ───────────────────────────────────────────────────────────

interface SmartyZipResult {
  status?: string;
  reason?: string;
  city_states?: Array<{ city: string; state_abbreviation: string }>;
}

export interface SmartyOptions {
  authId: string;
  authToken: string;
  fallback: ZipLookupAdapter;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
}

// Wraps Smarty's US ZIP Code API. Lookups sit on hot paths (plan search, agent
// assignment), so results — including "invalid ZIP" — are cached, and any
// outage or auth problem degrades to the fallback instead of failing the
// request. That keeps agent assignment working (by state) during an outage.
export class SmartyZipLookupAdapter implements ZipLookupAdapter {
  static readonly ENDPOINT = "https://us-zipcode.api.smarty.com/lookup";
  private readonly cache = new Map<string, { value: ZipLocationDTO | null; expires: number }>();

  constructor(private readonly opts: SmartyOptions) {}

  async lookup(zipCode: string): Promise<ZipLocationDTO | null> {
    if (!ZIP_CODE_PATTERN.test(zipCode)) return null;

    const cached = this.cache.get(zipCode);
    if (cached && cached.expires > Date.now()) return cached.value;

    try {
      const value = await this.fetchFromSmarty(zipCode);
      this.remember(zipCode, value);
      return value;
    } catch (err) {
      console.warn(`ZIP lookup via Smarty failed; using fallback: ${err instanceof Error ? err.message : err}`);
      return this.opts.fallback.lookup(zipCode);
    }
  }

  private async fetchFromSmarty(zipCode: string): Promise<ZipLocationDTO | null> {
    const params = new URLSearchParams({ "auth-id": this.opts.authId, "auth-token": this.opts.authToken, zipcode: zipCode });
    const { response } = await fetchWithRetry(
      `${SmartyZipLookupAdapter.ENDPOINT}?${params}`,
      { method: "GET", headers: { Accept: "application/json" } },
      { maxAttempts: 2, timeoutMs: 3_000, baseDelayMs: 200, fetchImpl: this.opts.fetchImpl, sleep: this.opts.sleep },
    );
    if (!response.ok) throw new Error(`Smarty responded ${response.status}`);

    const body = (await response.json()) as SmartyZipResult[];
    const result = Array.isArray(body) ? body[0] : undefined;
    if (!result) throw new Error("Smarty returned an unexpected response");
    // e.g. { status: "invalid_zipcode", reason: "Invalid ZIP Code." } — a real
    // answer, not an outage.
    if (result.status) return null;

    const primary = result.city_states?.[0];
    return primary ? { zipCode, city: primary.city, state: primary.state_abbreviation } : null;
  }

  private remember(zipCode: string, value: ZipLocationDTO | null): void {
    const max = this.opts.maxCacheEntries ?? 10_000;
    if (this.cache.size >= max) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(zipCode, { value, expires: Date.now() + (this.opts.cacheTtlMs ?? 24 * 60 * 60 * 1000) });
  }
}

function createZipLookup(): ZipLookupAdapter {
  const fallback = new MockZipLookupAdapter();
  return env.smarty ? new SmartyZipLookupAdapter({ ...env.smarty, fallback }) : fallback;
}

export const zipLookup: ZipLookupAdapter = createZipLookup();
