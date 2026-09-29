"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { AdminApplicationDTO } from "@insurance/shared";
import { DOCUMENT_TYPE_LABELS, HEALTH_CONDITION_LABELS, canApproveApplications, formatCents } from "@insurance/shared";
import { useAuth } from "../../../../lib/auth-context";
import { apiFetch, describeApiError } from "../../../../lib/api";
import { downloadWithAuth } from "../../../../lib/download";
import { ApplicationStatusBadge } from "../../../../components/applications/ApplicationStatusBadge";
import { formatBytes } from "../../../../components/applications/DocumentUploadRow";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-gray-200 bg-white">
      <h2 className="border-b border-gray-100 px-4 py-2 text-sm font-semibold">{title}</h2>
      <div className="px-4 py-3 text-sm">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="divide-y divide-gray-100">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-1.5">
          <dt className="text-gray-600">{label}</dt>
          <dd className="text-right">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, accessToken } = useAuth();
  const canDecide = canApproveApplications(user?.adminRole ?? null);

  const [app, setApp] = useState<AdminApplicationDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");

  const load = useCallback(() => {
    if (!accessToken) return;
    apiFetch<{ application: AdminApplicationDTO }>(`/api/admin/applications/${encodeURIComponent(id)}`, { accessToken })
      .then((res) => setApp(res.application))
      .catch((err) => setLoadError(describeApiError(err, "Couldn't load this application")));
  }, [accessToken, id]);

  useEffect(load, [load]);

  async function decide() {
    if (!mode) return;
    setBusy(mode);
    setActionError(null);
    try {
      const body = mode === "approve" ? { notes: notes.trim() || undefined } : { reason: notes.trim() };
      const res = await apiFetch<{ application: AdminApplicationDTO }>(`/api/admin/applications/${id}/${mode}`, {
        method: "POST",
        body: JSON.stringify(body),
        accessToken: accessToken!,
      });
      setApp(res.application);
      setMode(null);
      setNotes("");
    } catch (err) {
      setActionError(describeApiError(err));
      load(); // someone else may have decided it
    } finally {
      setBusy(null);
    }
  }

  if (loadError) return <p className="p-8 text-sm text-red-600">{loadError}</p>;
  if (!app || !accessToken) return <p className="p-8 text-sm text-gray-500">Loading...</p>;

  const health = app.healthInfo;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <Link href="/admin/applications/pending" className="text-sm text-gray-600 hover:underline">
        ← Applications
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {app.personal.firstName} {app.personal.lastName}
          </h1>
          <p className="text-sm text-gray-600">
            {app.plan.name} · {formatCents(app.plan.monthlyPremiumCents)}/month
          </p>
          <div className="mt-2">
            <ApplicationStatusBadge status={app.status} submissionStatus={app.submissionStatus} />
          </div>
        </div>
      </div>

      {app.review && (
        <div
          className={`rounded px-4 py-3 text-sm ${
            app.review.decision === "APPROVED" ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"
          }`}
        >
          <strong>{app.review.decision === "APPROVED" ? "Approved" : "Rejected"}</strong> by {app.reviewerName ?? "an admin"} on{" "}
          {new Date(app.review.reviewedAt).toLocaleString()}
          {app.reviewNotes && (
            <p className="mt-1">
              {app.review.decision === "APPROVED" ? "Internal notes" : "Reason"}: {app.reviewNotes}
            </p>
          )}
        </div>
      )}

      {app.awaitingDecision && canDecide && (
        <section className="rounded border border-gray-300 bg-gray-50 p-4 text-sm">
          <h2 className="font-semibold">Decision</h2>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setMode("approve")}
              className={`rounded px-3 py-1.5 ${mode === "approve" ? "bg-green-700 text-white" : "border border-gray-300 bg-white"}`}
            >
              Approve
            </button>
            <button
              onClick={() => setMode("reject")}
              className={`rounded px-3 py-1.5 ${mode === "reject" ? "bg-red-700 text-white" : "border border-gray-300 bg-white"}`}
            >
              Reject
            </button>
          </div>
          {mode && (
            <div className="mt-3 space-y-2">
              <label className="block">
                <span className="text-gray-600">
                  {mode === "approve"
                    ? "Notes (optional, internal to admins)"
                    : "Reason (required, shown to the applicant and agent)"}
                </span>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-3 py-2"
                />
              </label>
              <p className="text-xs text-gray-500">
                {mode === "approve"
                  ? "Approving notifies the carrier and moves the agent's commission to earned."
                  : "Rejecting voids the agent's pending commission and emails the agent and applicant."}
              </p>
              <button
                onClick={decide}
                disabled={busy !== null || (mode === "reject" && !notes.trim())}
                className="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50"
              >
                {busy ? "Saving..." : mode === "approve" ? "Confirm approval" : "Confirm rejection"}
              </button>
            </div>
          )}
        </section>
      )}
      {app.awaitingDecision && !canDecide && (
        <p className="text-sm text-gray-500">Awaiting a decision from an operations admin.</p>
      )}
      {actionError && <p className="rounded bg-red-50 px-4 py-2 text-sm text-red-700">{actionError}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Applicant">
          <Rows
            rows={[
              ["Email", app.applicant.email],
              ["Phone", app.applicant.phone],
              ["Date of birth", app.personal.dateOfBirth],
              ["ZIP code", app.personal.zipCode],
              ["SSN", `•••-••-${app.personal.ssnLast4}`],
            ]}
          />
        </Section>

        <Section title="Agent & carrier">
          <Rows
            rows={[
              ["Agent", app.agent ? `${app.agent.firstName} ${app.agent.lastName} (${app.agent.email})` : "Unassigned"],
              ["Carrier", app.plan.carrier.name],
              ["Reference", app.carrierReference],
              ["Carrier response", app.carrierMessage],
              ["Submission attempts", String(app.submissionAttempts)],
              ["Submitted", app.submittedAt && new Date(app.submittedAt).toLocaleString()],
              [
                "Commission",
                app.commission ? `${formatCents(app.commission.amountCents)} · ${app.commission.status.toLowerCase()}` : "None",
              ],
            ]}
          />
        </Section>

        <Section title="Health information">
          <Rows
            rows={[
              ["Conditions", health?.conditions.map((c) => HEALTH_CONDITION_LABELS[c]).join(", ") || "None reported"],
              ["Other", health?.otherConditions],
              [
                "Preferred doctors",
                health?.preferredDoctors.map((d) => (d.specialty ? `${d.name} (${d.specialty})` : d.name)).join(", "),
              ],
            ]}
          />
        </Section>

        <Section title="Documents">
          {app.documents.length === 0 ? (
            <p className="text-gray-500">No documents.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {app.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-4 py-1.5">
                  <span>
                    <span className="block">{DOCUMENT_TYPE_LABELS[d.type]}</span>
                    <span className="text-xs text-gray-500">
                      {d.fileName} · {formatBytes(d.sizeBytes)}
                    </span>
                  </span>
                  <button
                    onClick={async () => {
                      setBusy(`doc-${d.id}`);
                      try {
                        await downloadWithAuth(`/api/admin/applications/${app.id}/documents/${d.id}`, accessToken, d.fileName);
                      } catch (err) {
                        setActionError(describeApiError(err, "Download failed"));
                      } finally {
                        setBusy(null);
                      }
                    }}
                    disabled={busy !== null}
                    className="text-sm text-gray-700 hover:underline disabled:opacity-50"
                  >
                    {busy === `doc-${d.id}` ? "Downloading..." : "Download"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {app.documentRequests.length > 0 && (
        <Section title="Agent document requests">
          <ul className="divide-y divide-gray-100">
            {app.documentRequests.map((r) => (
              <li key={r.id} className="py-2">
                <span className="font-medium">{r.requestedTypes.map((t) => DOCUMENT_TYPE_LABELS[t]).join(", ")}</span>{" "}
                <span className="text-xs text-gray-500">
                  ({r.resolvedAt ? "fulfilled" : "open"}) · {r.agentName} · {new Date(r.createdAt).toLocaleDateString()}
                </span>
                <p className="text-gray-700">“{r.message}”</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
