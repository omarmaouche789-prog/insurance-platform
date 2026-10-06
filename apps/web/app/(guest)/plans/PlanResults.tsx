"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Info, X } from "lucide-react";
import type { PlanDTO, PlanSearchResponseDTO, PlanSort } from "@insurance/shared";
import { formatCents, MAX_COMPARE_PLANS, PLAN_SORTS } from "@insurance/shared";
import { apiFetch, ApiError } from "../../../lib/api";
import { PlanCard } from "../../../components/plans/PlanCard";
import { PlanFilters, type PlanFilterValues } from "../../../components/plans/PlanFilters";
import { ZipSearchForm } from "../../../components/plans/ZipSearchForm";
import { PlanDetailsModal } from "../../../components/plans/PlanDetailsModal";
import { enrollHref } from "../../../components/plans/planInfo";
import { Button, ButtonLink } from "../../../components/ui/Button";

function listParam(params: URLSearchParams, key: string): string[] {
  return params.get(key)?.split(",").filter(Boolean) ?? [];
}

function filtersFromParams(params: URLSearchParams): PlanFilterValues {
  const sort = params.get("sort");
  return {
    metalTier: listParam(params, "metalTier"),
    planType: listParam(params, "planType"),
    carrierId: listParam(params, "carrierId"),
    maxPremium: params.get("maxPremium") ?? "",
    hsaEligible: params.get("hsaEligible") === "true",
    sort: PLAN_SORTS.includes(sort as PlanSort) ? (sort as PlanSort) : "premium",
  };
}

function paramsFromFilters(zip: string, f: PlanFilterValues, page = 1): URLSearchParams {
  const params = new URLSearchParams({ zip });
  if (f.metalTier.length) params.set("metalTier", f.metalTier.join(","));
  if (f.planType.length) params.set("planType", f.planType.join(","));
  if (f.carrierId.length) params.set("carrierId", f.carrierId.join(","));
  if (f.maxPremium) params.set("maxPremium", f.maxPremium);
  if (f.hsaEligible) params.set("hsaEligible", "true");
  if (f.sort !== "premium") params.set("sort", f.sort);
  if (page > 1) params.set("page", String(page));
  return params;
}

export function PlanResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const zip = searchParams.get("zip") ?? "";
  const page = Number(searchParams.get("page") ?? 1) || 1;
  const filters = filtersFromParams(searchParams);
  // Re-fetch keyed on the normalized query so equivalent URLs don't refetch.
  const queryKey = paramsFromFilters(zip, filters, page).toString();

  const [data, setData] = useState<PlanSearchResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Plans ticked for side-by-side comparison (up to MAX_COMPARE_PLANS).
  const [selected, setSelected] = useState<string[]>([]);
  // The single plan the shopper has picked to enroll in. Kept as the full
  // plan so the bottom bar still works after paging or filtering it away.
  const [chosen, setChosen] = useState<PlanDTO | null>(null);
  const [detailsPlan, setDetailsPlan] = useState<PlanDTO | null>(null);

  useEffect(() => {
    if (!zip) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<PlanSearchResponseDTO>(`/api/plans?${queryKey}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load plans");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [zip, queryKey]);

  function updateFilters(next: PlanFilterValues) {
    router.replace(`/plans?${paramsFromFilters(zip, next)}`, { scroll: false });
  }

  function goToPage(nextPage: number) {
    router.push(`/plans?${paramsFromFilters(zip, filters, nextPage)}`);
  }

  function toggleSelect(planId: string) {
    setSelected((prev) =>
      prev.includes(planId) ? prev.filter((id) => id !== planId) : [...prev, planId].slice(0, MAX_COMPARE_PLANS),
    );
  }

  if (!zip) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-xl font-semibold">Enter a ZIP code to see plans</h1>
        <div className="mt-4">
          <ZipSearchForm />
        </div>
      </div>
    );
  }

  const hasFilters =
    filters.metalTier.length + filters.planType.length + filters.carrierId.length > 0 ||
    Boolean(filters.maxPremium) ||
    filters.hsaEligible;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const place = data?.location ? [data.location.city, data.location.state].filter(Boolean).join(", ") : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 pb-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            Plans in {zip}
            {place && <span className="font-normal text-gray-500"> · {place}</span>}
          </h1>
          {data && (
            <p className="text-sm text-gray-500">
              {data.total} plan{data.total === 1 ? "" : "s"} found
            </p>
          )}
        </div>
        <ZipSearchForm key={zip} initialZip={zip} />
      </div>

      <div className="mt-6 grid gap-8 md:grid-cols-[14rem_1fr]">
        <PlanFilters values={filters} carriers={data?.carriers ?? []} onChange={updateFilters} />

        <section aria-busy={loading}>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {data && data.plans.length === 0 && !loading && (
            <p className="text-sm text-gray-600">
              {hasFilters ? "No plans match these filters. Try removing some." : "No plans are sold in this ZIP yet."}
            </p>
          )}
          {data && data.plans.length > 0 && (
            <p className="mb-3 text-sm text-gray-500">Click a plan to select it · double-click for full details</p>
          )}
          <div role="radiogroup" aria-label="Choose a plan" className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
            {data?.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                chosen={chosen?.id === plan.id}
                onChoose={setChosen}
                onShowDetails={setDetailsPlan}
                compared={selected.includes(plan.id)}
                compareDisabled={selected.length >= MAX_COMPARE_PLANS}
                onToggleCompare={toggleSelect}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="mt-6 flex items-center justify-between text-sm">
              <button disabled={page <= 1} onClick={() => goToPage(page - 1)} className="disabled:opacity-40">
                ← Previous
              </button>
              <span className="text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => goToPage(page + 1)} className="disabled:opacity-40">
                Next →
              </button>
            </nav>
          )}
        </section>
      </div>

      {(chosen || selected.length > 0) && (
        <div className="fixed inset-x-0 bottom-0 z-20 animate-slide-in border-t border-gray-200 bg-white/95 shadow-overlay backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            {chosen ? (
              <div className="flex min-w-0 items-center gap-3">
                <button type="button" onClick={() => setChosen(null)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Clear selected plan">
                  <X className="h-4 w-4" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Selected plan</p>
                  <p className="truncate font-medium text-gray-900">
                    {chosen.name} · <span className="tabular-nums">{formatCents(chosen.monthlyPremiumCents)}/mo</span>
                  </p>
                </div>
                <Button size="sm" variant="ghost" icon={<Info className="h-3.5 w-3.5" />} onClick={() => setDetailsPlan(chosen)}>
                  Details
                </Button>
                <ButtonLink href={enrollHref(chosen)} size="sm" variant="accent">
                  Enroll <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </ButtonLink>
              </div>
            ) : (
              <span className="text-gray-500">Select a plan to enroll</span>
            )}
            {selected.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-gray-600">
                  {selected.length} of {MAX_COMPARE_PLANS} to compare
                  <button onClick={() => setSelected([])} className="ml-2 text-gray-500 hover:underline">
                    Clear
                  </button>
                </span>
                {selected.length >= 2 ? (
                  <ButtonLink href={`/compare?ids=${selected.join(",")}`} size="sm" variant="primary">
                    Compare plans
                  </ButtonLink>
                ) : (
                  <span className="text-gray-400">Pick at least 2</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <PlanDetailsModal plan={detailsPlan} onClose={() => setDetailsPlan(null)} />
    </div>
  );
}
