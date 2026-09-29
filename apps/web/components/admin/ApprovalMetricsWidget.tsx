"use client";

import { useEffect, useState } from "react";
import type { ApprovalMetricsDTO } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../lib/api";

const WINDOWS = [7, 30, 90];

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

function ageSince(iso: string | null): string {
  if (!iso) return "none waiting";
  return `oldest waiting ${formatHours((Date.now() - new Date(iso).getTime()) / 3_600_000)}`;
}

export function ApprovalMetricsWidget({ accessToken, refreshKey }: { accessToken: string; refreshKey?: number }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ApprovalMetricsDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<ApprovalMetricsDTO>(`/api/admin/applications/metrics?days=${days}`, { accessToken })
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(describeApiError(err, "Couldn't load metrics")));
  }, [accessToken, days, refreshKey]);

  const decided = data ? data.approvedCount + data.rejectedCount : 0;
  const tiles = [
    { label: "Pending review", value: data ? String(data.pendingCount) : "—", hint: data ? ageSince(data.oldestPendingSubmittedAt) : "" },
    {
      label: "Approval rate",
      value: data?.approvalRate != null ? `${Math.round(data.approvalRate * 100)}%` : "—",
      hint: data ? `${data.approvedCount} approved · ${data.rejectedCount} rejected` : "",
    },
    { label: "Avg. review time", value: formatHours(data?.averageReviewHours ?? null), hint: `across ${decided} decisions` },
    { label: "Median review time", value: formatHours(data?.medianReviewHours ?? null), hint: "carrier acceptance → decision" },
  ];

  return (
    <section className="rounded border border-gray-200 bg-white p-4" aria-labelledby="metrics-heading">
      <div className="flex items-center justify-between">
        <h2 id="metrics-heading" className="font-semibold">
          Approval metrics
        </h2>
        <label className="text-sm text-gray-600">
          Last{" "}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded border border-gray-300 px-1 py-0.5"
            aria-label="Metrics window"
          >
            {WINDOWS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">{t.label}</p>
            <p className="text-xl font-semibold tabular-nums">{t.value}</p>
            <p className="text-xs text-gray-500">{t.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
