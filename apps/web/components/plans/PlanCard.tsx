import Link from "next/link";
import type { PlanDTO } from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { MetalTierBadge } from "./MetalTierBadge";

interface PlanCardProps {
  plan: PlanDTO;
  selected: boolean;
  selectDisabled: boolean;
  onToggleSelect: (planId: string) => void;
}

export function PlanCard({ plan, selected, selectDisabled, onToggleSelect }: PlanCardProps) {
  return (
    <article className="rounded border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">{plan.carrier.name}</p>
          <Link href={`/plans/${plan.id}`} className="font-semibold hover:underline">
            {plan.name}
          </Link>
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            <MetalTierBadge tier={plan.metalTier} />
            <span className="rounded bg-gray-100 px-2 py-0.5">{plan.planType}</span>
            {plan.hsaEligible && <span className="rounded bg-gray-100 px-2 py-0.5">HSA eligible</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{formatCents(plan.monthlyPremiumCents)}</p>
          <p className="text-xs text-gray-500">per month</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-gray-500">Deductible</dt>
          <dd className="tabular-nums">{formatCents(plan.deductibleCents)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Out-of-pocket max</dt>
          <dd className="tabular-nums">{formatCents(plan.outOfPocketMaxCents)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Primary care</dt>
          <dd className="tabular-nums">{formatCents(plan.primaryCareCopayCents)} copay</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected}
            disabled={selectDisabled && !selected}
            onChange={() => onToggleSelect(plan.id)}
          />
          Compare
        </label>
        <Link href={`/plans/${plan.id}`} className="text-gray-600 hover:underline">
          View details →
        </Link>
      </div>
    </article>
  );
}
