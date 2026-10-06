import { Info } from "lucide-react";
import type { PlanDTO } from "@insurance/shared";
import { METAL_TIER_NOTES, PLAN_TYPE_NOTES, planFactGroups } from "./planInfo";

// Full plan information, shared by the details modal and the details page.
export function PlanFacts({ plan }: { plan: PlanDTO }) {
  return (
    <div className="space-y-5">
      {planFactGroups(plan).map((group) => (
        <section key={group.title}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.title}</h3>
          <dl className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {group.rows.map(([label, value, hint]) => (
              <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
                <dt className="text-gray-600">
                  {label}
                  {hint && <span className="block text-xs text-gray-400">{hint}</span>}
                </dt>
                <dd className="shrink-0 text-right font-medium tabular-nums text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <section className="space-y-2 rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
        <p className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          <span>
            <strong className="text-gray-900">{plan.metalTier.charAt(0) + plan.metalTier.slice(1).toLowerCase()}:</strong> {METAL_TIER_NOTES[plan.metalTier]}
          </span>
        </p>
        <p className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          <span>
            <strong className="text-gray-900">{plan.planType}:</strong> {PLAN_TYPE_NOTES[plan.planType]}
          </span>
        </p>
      </section>
    </div>
  );
}
