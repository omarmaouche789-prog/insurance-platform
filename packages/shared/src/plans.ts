export const METAL_TIERS = ["CATASTROPHIC", "BRONZE", "SILVER", "GOLD", "PLATINUM"] as const;
export type MetalTier = (typeof METAL_TIERS)[number];

export const PLAN_TYPES = ["HMO", "PPO", "EPO", "POS"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const PLAN_SORTS = ["premium", "deductible", "outOfPocketMax"] as const;
export type PlanSort = (typeof PLAN_SORTS)[number];

export const MAX_COMPARE_PLANS = 4;

export interface CarrierDTO {
  id: string;
  code: string;
  name: string;
}

// Money fields are integer cents.
export interface PlanDTO {
  id: string;
  name: string;
  planYear: number;
  metalTier: MetalTier;
  planType: PlanType;
  carrier: CarrierDTO;
  monthlyPremiumCents: number;
  deductibleCents: number;
  outOfPocketMaxCents: number;
  primaryCareCopayCents: number;
  specialistCopayCents: number;
  genericDrugCopayCents: number;
  hsaEligible: boolean;
}

export interface ZipLocationDTO {
  zipCode: string;
  state: string;
  city: string | null;
}

export interface PlanSearchResponseDTO {
  zipCode: string;
  location: ZipLocationDTO | null;
  total: number;
  page: number;
  pageSize: number;
  plans: PlanDTO[];
  // Carriers that sell at least one plan in this ZIP, for the filter UI.
  carriers: CarrierDTO[];
}

export interface PlanCompareResponseDTO {
  plans: PlanDTO[];
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}
