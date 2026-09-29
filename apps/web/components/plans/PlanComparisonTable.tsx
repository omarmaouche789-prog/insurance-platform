import Link from "next/link";
import type { PlanDTO } from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { MetalTierBadge } from "./MetalTierBadge";

type CostKey =
  | "monthlyPremiumCents"
  | "deductibleCents"
  | "outOfPocketMaxCents"
  | "primaryCareCopayCents"
  | "specialistCopayCents"
  | "genericDrugCopayCents";

// Cost rows highlight the lowest value across the compared plans.
const COST_ROWS: Array<{ key: CostKey; label: string }> = [
  { key: "monthlyPremiumCents", label: "Monthly premium" },
  { key: "deductibleCents", label: "Deductible" },
  { key: "outOfPocketMaxCents", label: "Out-of-pocket max" },
  { key: "primaryCareCopayCents", label: "Primary care copay" },
  { key: "specialistCopayCents", label: "Specialist copay" },
  { key: "genericDrugCopayCents", label: "Generic drug copay" },
];

export function PlanComparisonTable({ plans }: { plans: PlanDTO[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse bg-white text-sm">
        <thead>
          <tr>
            <th className="w-48 border-b border-gray-200 p-3" />
            {plans.map((plan) => (
              <th key={plan.id} className="border-b border-gray-200 p-3 text-left align-top">
                <p className="text-xs font-normal uppercase tracking-wide text-gray-500">{plan.carrier.name}</p>
                <Link href={`/plans/${plan.id}`} className="font-semibold hover:underline">
                  {plan.name}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th className="border-b border-gray-100 p-3 text-left font-medium text-gray-600">Metal tier</th>
            {plans.map((plan) => (
              <td key={plan.id} className="border-b border-gray-100 p-3 text-xs">
                <MetalTierBadge tier={plan.metalTier} />
              </td>
            ))}
          </tr>
          <tr>
            <th className="border-b border-gray-100 p-3 text-left font-medium text-gray-600">Plan type</th>
            {plans.map((plan) => (
              <td key={plan.id} className="border-b border-gray-100 p-3">
                {plan.planType}
              </td>
            ))}
          </tr>
          {COST_ROWS.map(({ key, label }) => {
            const lowest = Math.min(...plans.map((p) => p[key]));
            return (
              <tr key={key}>
                <th className="border-b border-gray-100 p-3 text-left font-medium text-gray-600">{label}</th>
                {plans.map((plan) => (
                  <td
                    key={plan.id}
                    className={`border-b border-gray-100 p-3 tabular-nums ${
                      plan[key] === lowest ? "bg-green-50 font-semibold text-green-800" : ""
                    }`}
                  >
                    {formatCents(plan[key])}
                  </td>
                ))}
              </tr>
            );
          })}
          <tr>
            <th className="p-3 text-left font-medium text-gray-600">HSA eligible</th>
            {plans.map((plan) => (
              <td key={plan.id} className="p-3">
                {plan.hsaEligible ? "Yes" : "No"}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
