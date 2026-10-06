import type { MetalTier, PlanDTO, PlanType } from "@insurance/shared";
import { formatCents } from "@insurance/shared";

export const enrollHref = (plan: Pick<PlanDTO, "id">) => `/account/enroll?planId=${encodeURIComponent(plan.id)}`;

// Standard ACA metal-tier meanings: the share of average covered costs the
// plan pays (actuarial value). Catastrophic plans are a special case.
export const METAL_TIER_NOTES: Record<MetalTier, string> = {
  CATASTROPHIC: "Very low premium and a very high deductible; mainly protects against worst-case costs. Generally for people under 30 or with a hardship exemption.",
  BRONZE: "Pays about 60% of average covered costs. Lowest premiums of the metal tiers, highest costs when you get care.",
  SILVER: "Pays about 70% of average covered costs. A middle ground — and the tier that can qualify for extra cost-sharing savings.",
  GOLD: "Pays about 80% of average covered costs. Higher premium, lower costs when you see a doctor.",
  PLATINUM: "Pays about 90% of average covered costs. Highest premium, lowest costs when you get care.",
};

export const PLAN_TYPE_NOTES: Record<PlanType, string> = {
  HMO: "Use doctors in the plan's network; you usually need a referral from your primary care doctor to see a specialist.",
  PPO: "See in-network or out-of-network providers without referrals; staying in network costs less.",
  EPO: "Use the plan's network (except emergencies), but no referrals are needed for specialists.",
  POS: "Pick a primary care doctor and get referrals for specialists; some out-of-network coverage at a higher cost.",
};

export interface FactGroup {
  title: string;
  rows: Array<[label: string, value: string, hint?: string]>;
}

// Everything we know about a plan, grouped for the details modal and page.
export function planFactGroups(plan: PlanDTO): FactGroup[] {
  const copay = (cents: number) => (cents === 0 ? "No charge" : `${formatCents(cents)} copay`);
  return [
    {
      title: "Costs",
      rows: [
        ["Monthly premium", formatCents(plan.monthlyPremiumCents)],
        ["Yearly premium", formatCents(plan.monthlyPremiumCents * 12), "12 monthly payments"],
        ["Deductible", formatCents(plan.deductibleCents), "What you pay for covered care before the plan starts paying"],
        ["Out-of-pocket maximum", formatCents(plan.outOfPocketMaxCents), "The most you'd pay for covered care in a year"],
      ],
    },
    {
      title: "Copays",
      rows: [
        ["Primary care visit", copay(plan.primaryCareCopayCents)],
        ["Specialist visit", copay(plan.specialistCopayCents)],
        ["Generic prescriptions", copay(plan.genericDrugCopayCents)],
      ],
    },
    {
      title: "Plan details",
      rows: [
        ["Carrier", plan.carrier.name],
        ["Metal tier", plan.metalTier.charAt(0) + plan.metalTier.slice(1).toLowerCase()],
        ["Network type", plan.planType],
        ["HSA eligible", plan.hsaEligible ? "Yes" : "No", plan.hsaEligible ? "Can be paired with a tax-advantaged Health Savings Account" : undefined],
        ["Plan year", String(plan.planYear)],
      ],
    },
  ];
}
