import { describe, expect, it } from "vitest";
import { buildPlanSearchQuery } from "../src/modules/plans/plans.service";
import { MockZipLookupAdapter } from "../src/integrations/zipLookup";

const base = { zipCode: "90001", sort: "premium" as const, page: 1, pageSize: 20 };

describe("buildPlanSearchQuery", () => {
  it("always scopes to active plans from active carriers sold in the ZIP", () => {
    const { where } = buildPlanSearchQuery(base);

    expect(where).toEqual({
      isActive: true,
      carrier: { isActive: true },
      serviceAreas: { some: { zipCode: "90001" } },
    });
  });

  it("maps every optional filter onto the where clause", () => {
    const { where } = buildPlanSearchQuery({
      ...base,
      metalTiers: ["SILVER", "GOLD"],
      planTypes: ["HMO"],
      carrierIds: ["c1"],
      maxPremiumCents: 50000,
      hsaEligible: false,
    });

    expect(where).toMatchObject({
      metalTier: { in: ["SILVER", "GOLD"] },
      planType: { in: ["HMO"] },
      carrierId: { in: ["c1"] },
      monthlyPremiumCents: { lte: 50000 },
      hsaEligible: false,
    });
  });

  it("ignores empty filter arrays instead of matching nothing", () => {
    const { where } = buildPlanSearchQuery({ ...base, metalTiers: [], planTypes: [], carrierIds: [] });

    expect(where).not.toHaveProperty("metalTier");
    expect(where).not.toHaveProperty("planType");
    expect(where).not.toHaveProperty("carrierId");
  });

  it("sorts by the chosen column with id as a stable tiebreaker", () => {
    expect(buildPlanSearchQuery({ ...base, sort: "deductible" }).orderBy).toEqual([
      { deductibleCents: "asc" },
      { id: "asc" },
    ]);
    expect(buildPlanSearchQuery({ ...base, sort: "outOfPocketMax" }).orderBy[0]).toEqual({
      outOfPocketMaxCents: "asc",
    });
  });
});

describe("MockZipLookupAdapter", () => {
  const adapter = new MockZipLookupAdapter();

  it("resolves a known ZIP to its city and state", async () => {
    expect(await adapter.lookup("10001")).toEqual({ zipCode: "10001", city: "New York", state: "NY" });
  });

  it("falls back to the prefix range for an unlisted ZIP", async () => {
    expect(await adapter.lookup("90210")).toEqual({ zipCode: "90210", city: null, state: "CA" });
  });

  it("returns null for malformed or unmapped ZIPs", async () => {
    expect(await adapter.lookup("1234")).toBeNull();
    expect(await adapter.lookup("abcde")).toBeNull();
    expect(await adapter.lookup("00501")).toBeNull();
  });
});
