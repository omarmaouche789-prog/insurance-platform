"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AgentApplicationListResponseDTO, ApplicationStatus } from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { useAuth } from "../../../lib/auth-context";
import { apiFetch, describeApiError } from "../../../lib/api";
import { ApplicationStatusBadge } from "../../../components/applications/ApplicationStatusBadge";
import { CommissionWidget } from "../../../components/agent/CommissionWidget";

const TABS: Array<{ label: string; status: ApplicationStatus | null }> = [
  { label: "All", status: null },
  { label: "Draft", status: "DRAFT" },
  { label: "Submitted", status: "SUBMITTED" },
  { label: "Approved", status: "APPROVED" },
  { label: "Rejected", status: "REJECTED" },
];

const PAGE_SIZE = 20;

export default function AgentApplicationsPage() {
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [failedOnly, setFailedOnly] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AgentApplicationListResponseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!accessToken) return;
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    if (failedOnly) params.set("submissionStatus", "FAILED");
    if (search) params.set("search", search);

    let cancelled = false;
    setLoading(true);
    apiFetch<AgentApplicationListResponseDTO>(`/api/agent/applications?${params}`, { accessToken })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(describeApiError(err, "Couldn't load applications"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, status, failedOnly, search, page]);

  if (!accessToken) return null;

  const allCount = data ? Object.values(data.statusCounts).reduce((a, b) => a + b, 0) : null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <CommissionWidget accessToken={accessToken} />

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-xl font-semibold">Assigned applications</h1>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={failedOnly}
                onChange={(e) => {
                  setFailedOnly(e.target.checked);
                  setPage(1);
                }}
              />
              Failed submissions only
            </label>
            <input
              type="search"
              placeholder="Search name or confirmation #"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-64 rounded border border-gray-300 px-3 py-1.5"
              aria-label="Search applications"
            />
          </div>
        </div>

        <nav className="mt-4 flex gap-1 border-b border-gray-200 text-sm" aria-label="Filter by status">
          {TABS.map((tab) => {
            const active = tab.status === status;
            const count = tab.status ? data?.statusCounts[tab.status] : allCount;
            return (
              <button
                key={tab.label}
                onClick={() => {
                  setStatus(tab.status);
                  setPage(1);
                }}
                aria-pressed={active}
                className={`-mb-px border-b-2 px-3 py-2 ${
                  active ? "border-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {tab.label}
                {count !== undefined && count !== null && <span className="ml-1.5 text-xs text-gray-400 tabular-nums">{count}</span>}
              </button>
            );
          })}
        </nav>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {data && data.applications.length === 0 && (
          <p className="mt-6 text-sm text-gray-600">No applications match these filters.</p>
        )}

        {data && data.applications.length > 0 && (
          <div className={`mt-2 overflow-x-auto ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-gray-500">
                <tr>
                  <th className="py-2 font-normal">Applicant</th>
                  <th className="py-2 font-normal">Plan</th>
                  <th className="py-2 text-right font-normal">Premium</th>
                  <th className="py-2 pl-4 font-normal">Status</th>
                  <th className="py-2 font-normal">Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.applications.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="py-2.5">
                      <Link href={`/agent/applications/${a.id}`} className="font-medium hover:underline">
                        {a.applicantName}
                      </Link>
                    </td>
                    <td className="py-2.5">
                      <span className="block">{a.planName}</span>
                      <span className="text-xs text-gray-500">{a.carrierName}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatCents(a.monthlyPremiumCents)}</td>
                    <td className="py-2.5 pl-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <ApplicationStatusBadge status={a.status} submissionStatus={a.submissionStatus} />
                        {a.openDocumentRequests > 0 && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                            Awaiting docs ({a.openDocumentRequests})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-gray-500">{new Date(a.updatedAt).toLocaleDateString()}</td>
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
              Page {page} of {totalPages}
            </span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-40">
              Next →
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
