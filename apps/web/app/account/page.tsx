"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ApplicationSummaryDTO } from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { useAuth } from "../../lib/auth-context";
import { apiFetch, describeApiError } from "../../lib/api";
import { ApplicationStatusBadge } from "../../components/applications/ApplicationStatusBadge";

export default function AccountDashboardPage() {
  const { user, accessToken } = useAuth();
  const [applications, setApplications] = useState<ApplicationSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<{ applications: ApplicationSummaryDTO[] }>("/api/applications", { accessToken })
      .then((res) => setApplications(res.applications))
      .catch((err) => setError(describeApiError(err, "Couldn't load your applications")));
  }, [accessToken]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Welcome back{user ? `, ${user.firstName}` : ""}</h1>
        <Link href="/plans" className="rounded bg-gray-900 px-4 py-2 text-sm text-white">
          Browse plans
        </Link>
      </div>

      <h2 className="mt-8 font-semibold">My applications</h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {!error && !applications && <p className="mt-2 text-sm text-gray-500">Loading...</p>}
      {applications?.length === 0 && (
        <p className="mt-2 text-sm text-gray-600">
          You haven&apos;t started any applications yet. Find a plan and choose &ldquo;Enroll&rdquo; to begin.
        </p>
      )}
      {applications && applications.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 rounded border border-gray-200 bg-white">
          {applications.map((a) => {
            const href =
              a.status === "DRAFT"
                ? `/account/enroll?applicationId=${a.id}&planId=${encodeURIComponent(a.planId)}`
                : `/account/applications/${a.id}`;
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{a.carrierName}</p>
                  <p className="font-medium">{a.planName}</p>
                  <p className="text-sm text-gray-500">
                    {formatCents(a.monthlyPremiumCents)}/month
                    {a.carrierReference && <> · Confirmation {a.carrierReference}</>}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {a.openDocumentRequests > 0 && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                      Action needed
                    </span>
                  )}
                  <ApplicationStatusBadge status={a.status} submissionStatus={a.submissionStatus} />
                  <Link href={href} className="text-sm text-gray-700 hover:underline">
                    {a.status === "DRAFT" ? "Continue →" : "View →"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
