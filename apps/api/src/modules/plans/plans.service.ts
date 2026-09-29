import type { Carrier, Plan, Prisma } from "@prisma/client";
import type { MetalTier, PlanDTO, PlanSearchResponseDTO, PlanSort, PlanType } from "@insurance/shared";
import { MAX_COMPARE_PLANS } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { zipLookup } from "../../integrations/zipLookup";
import { HttpError } from "../../middleware/errorHandler";

export interface PlanSearchFilters {
  zipCode: string;
  metalTiers?: MetalTier[];
  planTypes?: PlanType[];
  carrierIds?: string[];
  maxPremiumCents?: number;
  hsaEligible?: boolean;
  sort: PlanSort;
  page: number;
  pageSize: number;
}

const SORT_COLUMNS: Record<PlanSort, keyof Plan> = {
  premium: "monthlyPremiumCents",
  deductible: "deductibleCents",
  outOfPocketMax: "outOfPocketMaxCents",
};

export function toPlanDTO(plan: Plan & { carrier: Carrier }): PlanDTO {
  return {
    id: plan.id,
    name: plan.name,
    planYear: plan.planYear,
    metalTier: plan.metalTier,
    planType: plan.planType,
    carrier: { id: plan.carrier.id, code: plan.carrier.code, name: plan.carrier.name },
    monthlyPremiumCents: plan.monthlyPremiumCents,
    deductibleCents: plan.deductibleCents,
    outOfPocketMaxCents: plan.outOfPocketMaxCents,
    primaryCareCopayCents: plan.primaryCareCopayCents,
    specialistCopayCents: plan.specialistCopayCents,
    genericDrugCopayCents: plan.genericDrugCopayCents,
    hsaEligible: plan.hsaEligible,
  };
}

// Only plans that are active, from an active carrier, sold in the ZIP.
function availableInZip(zipCode: string): Prisma.PlanWhereInput {
  return {
    isActive: true,
    carrier: { isActive: true },
    serviceAreas: { some: { zipCode } },
  };
}

// Pure so the filter → query mapping can be unit-tested without a database.
export function buildPlanSearchQuery(filters: PlanSearchFilters): {
  where: Prisma.PlanWhereInput;
  orderBy: Prisma.PlanOrderByWithRelationInput[];
} {
  const where: Prisma.PlanWhereInput = { ...availableInZip(filters.zipCode) };
  if (filters.metalTiers?.length) where.metalTier = { in: filters.metalTiers };
  if (filters.planTypes?.length) where.planType = { in: filters.planTypes };
  if (filters.carrierIds?.length) where.carrierId = { in: filters.carrierIds };
  if (filters.maxPremiumCents !== undefined) where.monthlyPremiumCents = { lte: filters.maxPremiumCents };
  if (filters.hsaEligible !== undefined) where.hsaEligible = filters.hsaEligible;

  // Secondary sort on id keeps pagination stable when the primary column ties.
  return { where, orderBy: [{ [SORT_COLUMNS[filters.sort]]: "asc" }, { id: "asc" }] };
}

export async function searchPlans(filters: PlanSearchFilters): Promise<PlanSearchResponseDTO> {
  const { where, orderBy } = buildPlanSearchQuery(filters);

  const [location, total, plans, carriers] = await Promise.all([
    zipLookup.lookup(filters.zipCode),
    prisma.plan.count({ where }),
    prisma.plan.findMany({
      where,
      orderBy,
      include: { carrier: true },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.carrier.findMany({
      where: { isActive: true, plans: { some: availableInZip(filters.zipCode) } },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return {
    zipCode: filters.zipCode,
    location,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    plans: plans.map(toPlanDTO),
    carriers,
  };
}

export async function getPlan(id: string): Promise<PlanDTO> {
  const plan = await prisma.plan.findFirst({
    where: { id, isActive: true, carrier: { isActive: true } },
    include: { carrier: true },
  });
  if (!plan) throw new HttpError(404, "Plan not found");
  return toPlanDTO(plan);
}

export async function comparePlans(ids: string[]): Promise<PlanDTO[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length < 2 || uniqueIds.length > MAX_COMPARE_PLANS) {
    throw new HttpError(400, `Compare between 2 and ${MAX_COMPARE_PLANS} plans`);
  }

  const plans = await prisma.plan.findMany({
    where: { id: { in: uniqueIds }, isActive: true, carrier: { isActive: true } },
    include: { carrier: true },
  });
  if (plans.length !== uniqueIds.length) throw new HttpError(404, "One or more plans not found");

  // Preserve the order the caller asked for, so columns match the selection order.
  const byId = new Map(plans.map((p) => [p.id, p]));
  return uniqueIds.map((id) => toPlanDTO(byId.get(id)!));
}
