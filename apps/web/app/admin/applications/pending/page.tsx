"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  AdminQueueItemDTO,
  AdminQueueResponseDTO,
  AdminQueueSort,
  ApplicationStatus,
  BulkDecisionResponseDTO,
} from "@insurance/shared";
import { canApproveApplications, formatCents } from "@insurance/shared";
import { useAuth } from "../../../../lib/auth-context";
import { apiFetch, describeApiError } from "../../../../lib/api";
import { ApplicationStatusBadge } from "../../../../components/applications/ApplicationStatusBadge";
import { ApprovalMetricsWidget } from "../../../../components/admin/ApprovalMetricsWidget";

const TABS: Array<{ label: string; status: ApplicationStatus | null }> = [
  { label: "Pending review", status: "SUBMITTED" },
  { label: "Approved", status: "APPROVED" },
  { label: "Rejected", status: "REJECTED" },
  { label: "All", status: null },
];

const SORTS: Array<{ value: AdminQueueSort; label: string }> = [
  { value: "submittedAt", label: "Submitted" },
  { value: "updatedAt", label: "Last updated" },
  { value: "premium", label: "Premium" },
  { value: "applicant", label: "Applicant" },
];

const PAGE_SIZE = 25;

const isAwaiting = (a: AdminQueueItemDTO) => a.status === "SUBMITTED" && a.submissionStatus === "ACCEPTED";

function waitingFor(iso: string | null): string {
  if (!iso) return "—";
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return hours < 24 ? `${Math.max(1, Math.round(hours))}h` : `${Math.floor(hours / 24)}d`;
}

export default function AdminPendingApplicationsPage() {
  const { user, accessToken } = useAuth();
  const canDecide = canApproveApplications(user?.adminRole ?? null);

  const [status, setStatus] = useState<ApplicationStatus | null>("SUBMITTED");
  const [sort, setSort] = useState<AdminQueueSort>("submittedAt");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminQueueResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<"approve" | "reject" | null>(null);
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const params = new URLSearchParams({ sort, direction, page: String(page), pageSize: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    let cancelled = false;
    apiFetch<AdminQueueResponseDTO>(`/api/admin/applications/queue?${params}`, { accessToken })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err, "Couldn't load applications"));
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, status, sort, direction, page, refreshKey]);

  // Selection only makes sense within the current view.
  useEffect(() => setSelected(new Set()), [status, sort, direction, page]);

  if (!accessToken) return null;

  const selectable = data?.items.filter(isAwaiting) ?? [];
  const allSelected = selectable.length > 0 && selectable.every((a) => selected.has(a.id));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk() {
    if (!bulkMode) return;
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const res = await apiFetch<BulkDecisionResponseDTO>("/api/admin/applications/bulk", {
        method: "POST",
        body: JSON.stringify({ action: bulkMode, ids: [...selected], notes: bulkNotes.trim() || undefined }),
        accessToken: accessToken!,
      });
      const failed = res.results.filter((r) => !r.ok);
      const verb = bulkMode === "approve" ? "Approved" : "Rejected";
      setBulkResult(
        `${verb} ${res.results.length - failed.length} of ${res.results.length}.` +
          (failed.length ? ` Skipped: ${failed.map((f) => `${f.id.slice(0, 8)}… (${f.error})`).join("; ")}` : ""),
      );
      setSelected(new Set());
      setBulkMode(null);
      setBulkNotes("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setBulkResult(describeApiError(err, "Bulk action failed"));
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <ApprovalMetricsWidget accessToken={accessToken} refreshKey={refreshKey} />

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-xl font-semibold">Applications</h1>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-gray-600" htmlFor="sort">
              Sort by
            </label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as AdminQueueSort);
                setPage(1);
              }}
              className="rounded border border-gray-300 px-2 py-1"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setDirection((d) => (d === "asc" ? "desc" : "asc"));
                setPage(1);
              }}
              className="rounded border border-gray-300 px-2 py-1"
              aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`}
            >
              {direction === "asc" ? "↑ Asc" : "↓ Desc"}
            </button>
          </div>
        </div>

        <nav className="mt-4 flex gap-1 border-b border-gray-200 text-sm" aria-label="Filter by status">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => {
                setStatus(tab.status);
                setPage(1);
              }}
              aria-pressed={tab.status === status}
              className={`-mb-px border-b-2 px-3 py-2 ${
                tab.status === status ? "border-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {canDecide && selected.size > 0 && (
          <div className="mt-4 space-y-3 rounded border border-gray-300 bg-gray-50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{selected.size} selected</span>
              <button
                onClick={() => setBulkMode("approve")}
                className={`rounded px-3 py-1.5 ${bulkMode === "approve" ? "bg-green-700 text-onaccent" : "border border-gray-300 bg-white"}`}
              >
                Approve selected
              </button>
              <button
                onClick={() => setBulkMode("reject")}
                className={`rounded px-3 py-1.5 ${bulkMode === "reject" ? "bg-red-700 text-onaccent" : "border border-gray-300 bg-white"}`}
              >
                Reject selected
              </button>
              <button onClick={() => setSelected(new Set())} className="text-gray-600 hover:underline">
                Clear
              </button>
            </div>
            {bulkMode && (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={bulkNotes}
                  onChange={(e) => setBulkNotes(e.target.value)}
                  placeholder={
                    bulkMode === "reject"
                      ? "Rejection reason (required; shown to applicants and agents)"
                      : "Approval notes (optional; internal)"
                  }
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  aria-label={bulkMode === "reject" ? "Rejection reason" : "Approval notes"}
                />
                <button
                  onClick={runBulk}
                  disabled={bulkBusy || (bulkMode === "reject" && !bulkNotes.trim())}
                  className="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50"
                >
                  {bulkBusy ? "Working..." : `Confirm ${bulkMode} ${selected.size}`}
                </button>
              </div>
            )}
          </div>
        )}
        {bulkResult && <p className="mt-3 rounded bg-blue-50 px-3 py-2 text-sm text-blue-900">{bulkResult}</p>}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {data && data.items.length === 0 && <p className="mt-6 text-sm text-gray-600">Nothing here.</p>}

        {data && data.items.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  {canDecide && (
                    <th className="w-8 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={selectable.length === 0}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((a) => a.id)))}
                        aria-label="Select all pending on this page"
                      />
                    </th>
                  )}
                  <th className="py-2 font-normal">Applicant</th>
                  <th className="py-2 font-normal">Agent</th>
                  <th className="py-2 font-normal">Plan</th>
                  <th className="py-2 text-right font-normal">Premium</th>
                  <th className="py-2 pl-4 font-normal">Status</th>
                  <th className="py-2 text-right font-normal">Waiting</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50">
                    {canDecide && (
                      <td className="py-2.5">
                        {isAwaiting(a) && (
                          <input
                            type="checkbox"
                            checked={selected.has(a.id)}
                            onChange={() => toggle(a.id)}
                            aria-label={`Select ${a.applicantName}`}
                          />
                        )}
                      </td>
                    )}
                    <td className="py-2.5">
                      <Link href={`/admin/applications/${a.id}`} className="font-medium hover:underline">
                        {a.applicantName}
                      </Link>
                      {a.carrierReference && <span className="block text-xs text-gray-500">{a.carrierReference}</span>}
                    </td>
                    <td className="py-2.5">{a.agentName ?? <span className="text-gray-400">Unassigned</span>}</td>
                    <td className="py-2.5">
                      <span className="block">{a.planName}</span>
                      <span className="text-xs text-gray-500">{a.carrierName}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatCents(a.monthlyPremiumCents)}</td>
                    <td className="py-2.5 pl-4">
                      <ApplicationStatusBadge status={a.status} submissionStatus={a.submissionStatus} />
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-gray-600">
                      {isAwaiting(a) ? waitingFor(a.submittedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <nav className="mt-4 flex items-center justify-between text-sm">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-40">
              ← Previous
            </button>
            <span className="text-gray-500">
              Page {page} of {totalPages} · {data?.total} total
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40">
              Next →
            </button>
          </nav>
        )}
        {!canDecide && (
          <p className="mt-4 text-xs text-gray-500">Your admin role can view applications but not approve or reject them.</p>
        )}
      </section>
    </div>
  );
}
