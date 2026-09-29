"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PlanCompareResponseDTO, PlanDTO } from "@insurance/shared";
import { apiFetch, ApiError } from "../../../lib/api";
import { PlanComparisonTable } from "../../../components/plans/PlanComparisonTable";

function ComparePlans() {
  const router = useRouter();
  const ids = useSearchParams().get("ids") ?? "";
  const [plans, setPlans] = useState<PlanDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PlanCompareResponseDTO>(`/api/plans/compare?ids=${encodeURIComponent(ids)}`)
      .then((res) => setPlans(res.plans))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load plans"));
  }, [ids]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <button onClick={() => router.back()} className="text-sm text-gray-600 hover:underline">
        ← Back to results
      </button>
      <h1 className="mt-4 text-xl font-semibold">Compare plans</h1>
      <p className="text-sm text-gray-500">Lowest cost in each row is highlighted.</p>
      <div className="mt-6">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && !plans && <p className="text-sm text-gray-500">Loading...</p>}
        {plans && <PlanComparisonTable plans={plans} />}
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary for `next build`.
export default function ComparePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500">Loading...</div>}>
      <ComparePlans />
    </Suspense>
  );
}
