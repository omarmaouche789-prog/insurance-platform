"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ApplicationDTO, DocumentType } from "@insurance/shared";
import { DOCUMENT_TYPE_LABELS, formatCents } from "@insurance/shared";
import { useAuth } from "../../../../lib/auth-context";
import { apiFetch, describeApiError } from "../../../../lib/api";
import { ApplicationStatusBadge } from "../../../../components/applications/ApplicationStatusBadge";
import { DocumentUploadRow } from "../../../../components/applications/DocumentUploadRow";

// The applicant's view of an application after it leaves the wizard: status,
// their agent, and any documents the agent has asked for.
export default function ApplicationStatusPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const [app, setApp] = useState<ApplicationDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<{ application: ApplicationDTO }>(`/api/applications/${encodeURIComponent(id)}`, { accessToken })
      .then((res) => setApp(res.application))
      .catch((err) => setError(describeApiError(err, "Couldn't load your application")));
  }, [accessToken, id]);

  if (error) return <p className="p-8 text-sm text-red-600">{error}</p>;
  if (!app || !accessToken) return <p className="p-8 text-sm text-gray-500">Loading...</p>;

  const openRequests = app.documentRequests.filter((r) => !r.resolvedAt);
  const requestedTypes = [...new Set(openRequests.flatMap((r) => r.requestedTypes))] as DocumentType[];
  const documentsByType = new Map(app.documents.map((d) => [d.type, d]));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <Link href="/account" className="text-sm text-gray-600 hover:underline">
        ← My applications
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">{app.plan.carrier.name}</p>
          <h1 className="text-xl font-semibold">{app.plan.name}</h1>
          <p className="text-sm text-gray-600">{formatCents(app.plan.monthlyPremiumCents)}/month</p>
        </div>
        <ApplicationStatusBadge status={app.status} submissionStatus={app.submissionStatus} />
      </div>

      {app.status === "DRAFT" && (
        <p className="rounded bg-gray-100 px-4 py-3 text-sm">
          This application hasn&apos;t been submitted yet.{" "}
          <Link href={`/account/enroll?planId=${app.plan.id}&applicationId=${app.id}`} className="underline">
            Continue enrollment
          </Link>
        </p>
      )}

      {app.review?.decision === "APPROVED" && (
        <p className="rounded bg-green-50 px-4 py-3 text-sm text-green-900">
          <strong>Approved</strong> on {new Date(app.review.reviewedAt).toLocaleDateString()}. Your carrier has been
          notified to finalize coverage.
        </p>
      )}
      {app.review?.decision === "REJECTED" && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-900">
          <strong>Not approved</strong> on {new Date(app.review.reviewedAt).toLocaleDateString()}
          {app.review.reason && <>: {app.review.reason}</>}. Contact your agent about other plan options.
        </p>
      )}

      {app.carrierMessage && app.status !== "DRAFT" && !app.review && (
        <p
          className={`rounded px-4 py-3 text-sm ${
            app.status === "REJECTED" ? "bg-red-50 text-red-900" : "bg-gray-100 text-gray-800"
          }`}
        >
          <strong>Carrier update:</strong> {app.carrierMessage}
          {app.carrierReference && <span className="block text-xs">Confirmation {app.carrierReference}</span>}
        </p>
      )}

      {openRequests.length > 0 && (
        <section className="space-y-3 rounded border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Action needed: your agent requested documents</h2>
          {openRequests.map((r) => (
            <blockquote key={r.id} className="border-l-2 border-amber-400 pl-3 text-sm text-amber-900">
              “{r.message}”
              <span className="block text-xs text-amber-800">
                {r.agentName} · {new Date(r.createdAt).toLocaleDateString()}
              </span>
            </blockquote>
          ))}
          {requestedTypes.map((type) => (
            <DocumentUploadRow
              key={type}
              applicationId={app.id}
              type={type}
              existing={documentsByType.get(type)}
              accessToken={accessToken}
              onUploaded={setApp}
            />
          ))}
        </section>
      )}

      <section className="rounded border border-gray-200 bg-white">
        <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold">Details</h2>
        <dl className="divide-y divide-gray-100 text-sm">
          {[
            ["Applicant", `${app.personal.firstName} ${app.personal.lastName}`],
            ["Your agent", app.agent ? `${app.agent.firstName} ${app.agent.lastName} · ${app.agent.email}` : "Being assigned"],
            ["Documents", app.documents.map((d) => DOCUMENT_TYPE_LABELS[d.type]).join(", ") || "None yet"],
            ["Submitted", app.submittedAt ? new Date(app.submittedAt).toLocaleString() : "—"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-4 py-2">
              <dt className="text-gray-600">{label}</dt>
              <dd className="text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
