import type { ZipLocationDTO } from "@insurance/shared";

// Adapter boundary for ZIP validation / geocoding. The real implementation
// (USPS or SmartyStreets) lands in the Phase 6 integrations layer; until then
// the mock below resolves ZIPs from a static table.
export interface ZipLookupAdapter {
  lookup(zipCode: string): Promise<ZipLocationDTO | null>;
}

export const ZIP_CODE_PATTERN = /^\d{5}$/;

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

export const zipLookup: ZipLookupAdapter = new MockZipLookupAdapter();
