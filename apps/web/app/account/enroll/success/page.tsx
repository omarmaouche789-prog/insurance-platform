"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ApplicationDTO } from "@insurance/shared";
import { DOCUMENT_TYPE_LABELS, formatCents } from "@insurance/shared";
import { useAuth } from "../../../../lib/auth-context";
import { apiFetch, describeApiError } from "../../../../lib/api";
import { ApplicationStatusBadge } from "../../../../components/applications/ApplicationStatusBadge";

function Confirmation() {
  const id = useSearchParams().get("id");
  const { accessToken } = useAuth();
  const [app, setApp] = useState<ApplicationDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !id) return;
    apiFetch<{ application: ApplicationDTO }>(`/api/applications/${encodeURIComponent(id)}`, { accessToken })
      .then((res) => setApp(res.application))
      .catch((err) => setError(describeApiError(err, "Couldn't load your application")));
  }, [accessToken, id]);

  if (!id) return <p className="text-sm text-gray-600">No application specified.</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!app) return <p className="text-sm text-gray-500">Loading...</p>;

  // Reached via a bookmark before submitting: send them back to finish.
  if (app.status === "DRAFT") {
    return (
      <p className="text-sm text-gray-600">
        This application hasn&apos;t been submitted yet.{" "}
        <Link href={`/account/enroll?planId=${app.plan.id}&applicationId=${app.id}`} className="underline">
          Continue enrollment
        </Link>
      </p>
    );
  }

  const accepted = app.submissionStatus === "ACCEPTED";

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className={`text-4xl ${accepted ? "text-green-600" : "text-red-600"}`} aria-hidden>
          {accepted ? "✓" : "!"}
        </p>
        <h1 className="mt-2 text-2xl font-bold">{accepted ? "Application submitted" : "Application declined"}</h1>
        {app.carrierMessage && <p className="mt-2 text-gray-600">{app.carrierMessage}</p>}
      </div>

      {app.carrierReference && (
        <div className="rounded border border-gray-200 bg-white p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-gray-500">Confirmation number</p>
          <p className="mt-1 font-mono text-xl font-semibold tracking-wider">{app.carrierReference}</p>
          <p className="mt-1 text-xs text-gray-500">Keep this for any calls with {app.plan.carrier.name}.</p>
        </div>
      )}

      <dl className="divide-y divide-gray-100 rounded border border-gray-200 bg-white text-sm">
        {[
          ["Status", <ApplicationStatusBadge key="s" status={app.status} submissionStatus={app.submissionStatus} />],
          ["Plan", app.plan.name],
          ["Carrier", app.plan.carrier.name],
          ["Monthly premium", formatCents(app.plan.monthlyPremiumCents)],
          ["Applicant", `${app.personal.firstName} ${app.personal.lastName}`],
          ["Documents", app.documents.map((d) => DOCUMENT_TYPE_LABELS[d.type]).join(", ")],
          ["Submitted", app.submittedAt ? new Date(app.submittedAt).toLocaleString() : "—"],
        ].map(([label, value]) => (
          <div key={label as string} className="flex justify-between gap-4 px-4 py-2">
            <dt className="text-gray-600">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex justify-center gap-4 text-sm">
        <Link href={`/account/applications/${app.id}`} className="rounded border border-gray-300 px-4 py-2">
          {accepted ? "View application" : "See what's needed"}
        </Link>
        <Link href="/account" className="rounded bg-gray-900 px-4 py-2 text-white">
          Go to my applications
        </Link>
      </div>
    </div>
  );
}

export default function EnrollSuccessPage() {
  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <Suspense fallback={<p className="text-sm text-gray-500">Loading...</p>}>
        <Confirmation />
      </Suspense>
    </div>
  );
}
