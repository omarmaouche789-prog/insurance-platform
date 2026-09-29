"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { PlanDTO } from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { apiFetch, ApiError } from "../../../../lib/api";
import { MetalTierBadge } from "../../../../components/plans/MetalTierBadge";

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ plan: PlanDTO }>(`/api/plans/${encodeURIComponent(id)}`)
      .then((res) => setPlan(res.plan))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load plan"));
  }, [id]);

  if (error) return <p className="p-8 text-sm text-red-600">{error}</p>;
  if (!plan) return <p className="p-8 text-sm text-gray-500">Loading...</p>;

  const rows: Array<[string, string]> = [
    ["Monthly premium", formatCents(plan.monthlyPremiumCents)],
    ["Deductible", formatCents(plan.deductibleCents)],
    ["Out-of-pocket maximum", formatCents(plan.outOfPocketMaxCents)],
    ["Primary care visit", `${formatCents(plan.primaryCareCopayCents)} copay`],
    ["Specialist visit", `${formatCents(plan.specialistCopayCents)} copay`],
    ["Generic drugs", `${formatCents(plan.genericDrugCopayCents)} copay`],
    ["HSA eligible", plan.hsaEligible ? "Yes" : "No"],
    ["Plan year", String(plan.planYear)],
  ];

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <button onClick={() => router.back()} className="text-sm text-gray-600 hover:underline">
        ← Back to results
      </button>
      <p className="mt-6 text-xs uppercase tracking-wide text-gray-500">{plan.carrier.name}</p>
      <h1 className="text-2xl font-bold">{plan.name}</h1>
      <div className="mt-2 flex gap-2 text-xs">
        <MetalTierBadge tier={plan.metalTier} />
        <span className="rounded bg-gray-100 px-2 py-0.5">{plan.planType}</span>
      </div>

      {/* Guests can start here; /account/* bounces them to log in or register first. */}
      <Link
        href={`/account/enroll?planId=${encodeURIComponent(plan.id)}`}
        className="mt-6 inline-block rounded bg-gray-900 px-4 py-2 text-white"
      >
        Enroll in this plan
      </Link>

      <dl className="mt-6 divide-y divide-gray-100 rounded border border-gray-200 bg-white">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between px-4 py-3 text-sm">
            <dt className="text-gray-600">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
