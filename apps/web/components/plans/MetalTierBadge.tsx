import type { MetalTier } from "@insurance/shared";

const TIER_STYLES: Record<MetalTier, string> = {
  CATASTROPHIC: "bg-gray-200 text-gray-800",
  BRONZE: "bg-orange-100 text-orange-900",
  SILVER: "bg-slate-200 text-slate-800",
  GOLD: "bg-yellow-100 text-yellow-900",
  PLATINUM: "bg-indigo-100 text-indigo-900",
};

export function MetalTierBadge({ tier }: { tier: MetalTier }) {
  return (
    <span className={`rounded px-2 py-0.5 ${TIER_STYLES[tier]}`}>
      {tier.charAt(0) + tier.slice(1).toLowerCase()}
    </span>
  );
}
