"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CommissionStatus, CommissionSummaryResponseDTO } from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../lib/api";

const TILES: Array<{ status: CommissionStatus; label: string; hint: string }> = [
  { status: "PENDING", label: "Pending", hint: "Carrier accepted, awaiting approval" },
  { status: "EARNED", label: "Earned", hint: "Approved by admin, awaiting payout" },
  { status: "PAID", label: "Paid", hint: "Paid out" },
];

const STATUS_STYLES: Record<CommissionStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900",
  EARNED: "bg-green-100 text-green-800",
  PAID: "bg-gray-100 text-gray-700",
  VOID: "bg-red-50 text-red-700 line-through",
};

export function CommissionWidget({ accessToken, refreshKey }: { accessToken: string; refreshKey?: number }) {
  const [data, setData] = useState<CommissionSummaryResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    apiFetch<CommissionSummaryResponseDTO>("/api/agent/commission?pageSize=10", { accessToken })
      .then(setData)
      .catch((err) => setError(describeApiError(err, "Couldn't load commissions")));
  }, [accessToken, refreshKey]);

  return (
    <section className="rounded border border-gray-200 bg-white p-4" aria-labelledby="commission-heading">
      <div className="flex items-baseline justify-between">
        <h2 id="commission-heading" className="font-semibold">
          Commissions
        </h2>
        {data && data.total > 0 && (
          <button onClick={() => setExpanded((e) => !e)} className="text-sm text-gray-600 hover:underline">
            {expanded ? "Hide recent" : `Show recent (${Math.min(data.total, 10)})`}
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {TILES.map(({ status, label, hint }) => (
          <div key={status} className="rounded bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xl font-semibold tabular-nums">{data ? formatCents(data.totals[status]) : "—"}</p>
            <p className="text-xs text-gray-500">{hint}</p>
          </div>
        ))}
      </div>

      {expanded && data && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="py-1 font-normal">Applicant</th>
                <th className="py-1 font-normal">Carrier</th>
                <th className="py-1 text-right font-normal">Premium</th>
                <th className="py-1 text-right font-normal">Rate</th>
                <th className="py-1 text-right font-normal">Commission</th>
                <th className="py-1 pl-3 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.commissions.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="py-1.5">
                    <Link href={`/agent/applications/${c.applicationId}`} className="hover:underline">
                      {c.applicantName}
                    </Link>
                  </td>
                  <td className="py-1.5">{c.carrierName}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatCents(c.premiumCents)}/mo</td>
                  <td className="py-1.5 text-right tabular-nums">{(c.rateBps / 100).toFixed(2)}%</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{formatCents(c.amountCents)}</td>
                  <td className="py-1.5 pl-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[c.status]}`}>{c.status.toLowerCase()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">Commission = monthly premium × 12 × carrier rate (placeholder rates).</p>
        </div>
      )}
    </section>
  );
}
