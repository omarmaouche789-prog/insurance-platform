"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { PlanDTO } from "@insurance/shared";
import { apiFetch, ApiError } from "../../../../lib/api";
import { MetalTierBadge } from "../../../../components/plans/MetalTierBadge";
import { PlanFacts } from "../../../../components/plans/PlanFacts";

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

      <div className="mt-6">
        <PlanFacts plan={plan} />
      </div>
    </div>
  );
}
