"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { AgentApplicationDTO, DocumentType } from "@insurance/shared";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, HEALTH_CONDITION_LABELS, formatCents } from "@insurance/shared";
import { useAuth } from "../../../../lib/auth-context";
import { apiFetch, describeApiError } from "../../../../lib/api";
import { downloadWithAuth } from "../../../../lib/download";
import { ApplicationStatusBadge } from "../../../../components/applications/ApplicationStatusBadge";
import { formatBytes } from "../../../../components/applications/DocumentUploadRow";

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {actions}
      </div>
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

export default function AgentApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const [app, setApp] = useState<AgentApplicationDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"resubmit" | "request" | "pdf" | string | null>(null);

  const [requestTypes, setRequestTypes] = useState<DocumentType[]>([]);
  const [requestMessage, setRequestMessage] = useState("");

  const load = useCallback(() => {
    if (!accessToken) return;
    apiFetch<{ application: AgentApplicationDTO }>(`/api/agent/applications/${encodeURIComponent(id)}`, { accessToken })
      .then((res) => setApp(res.application))
      .catch((err) => setLoadError(describeApiError(err, "Couldn't load this application")));
  }, [accessToken, id]);

  useEffect(load, [load]);

  async function run(kind: string, action: () => Promise<void>) {
    setBusy(kind);
    setActionError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setActionError(describeApiError(err));
      load(); // pick up any state the failed action recorded (e.g. FAILED)
    } finally {
      setBusy(null);
    }
  }

  const resubmit = () =>
    run("resubmit", async () => {
      const res = await apiFetch<{ application: AgentApplicationDTO }>(`/api/agent/applications/${id}/resubmit`, {
        method: "POST",
        accessToken: accessToken!,
      });
      setApp(res.application);
      setNotice(
        res.application.submissionStatus === "ACCEPTED"
          ? `Accepted by the carrier. Confirmation ${res.application.carrierReference}.`
          : `The carrier rejected it again: ${res.application.carrierMessage}`,
      );
    });

  const sendRequest = (e: React.FormEvent) => {
    e.preventDefault();
    void run("request", async () => {
      const res = await apiFetch<{ application: AgentApplicationDTO }>(`/api/agent/applications/${id}/request-documents`, {
        method: "POST",
        body: JSON.stringify({ requestedTypes: requestTypes, message: requestMessage }),
        accessToken: accessToken!,
      });
      setApp(res.application);
      setRequestTypes([]);
      setRequestMessage("");
      setNotice("Request sent. The applicant has been emailed.");
    });
  };

  if (loadError) return <p className="p-8 text-sm text-red-600">{loadError}</p>;
  if (!app || !accessToken) return <p className="p-8 text-sm text-gray-500">Loading...</p>;

  const health = app.healthInfo;
  const canRequest = !app.review && app.submissionStatus !== "PENDING";

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <Link href="/agent/applications" className="text-sm text-gray-600 hover:underline">
        ← All applications
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
        <div className="flex gap-2">
          <button
            onClick={() =>
              run("pdf", () => downloadWithAuth(`/api/agent/applications/${app.id}/pdf`, accessToken, `application-${app.id}.pdf`))
            }
            disabled={busy !== null}
            className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "pdf" ? "Preparing..." : "Download PDF"}
          </button>
          {app.canResubmit && (
            <button
              onClick={resubmit}
              disabled={busy !== null}
              className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy === "resubmit" ? "Resubmitting..." : "Resubmit to carrier"}
            </button>
          )}
        </div>
      </div>

      {app.review && (
        <p
          className={`rounded px-4 py-2 text-sm ${
            app.review.decision === "APPROVED" ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"
          }`}
        >
          <strong>{app.review.decision === "APPROVED" ? "Approved" : "Rejected"} by admin</strong> on{" "}
          {new Date(app.review.reviewedAt).toLocaleString()}
          {app.review.reason && <>: {app.review.reason}</>}
        </p>
      )}
      {notice && <p className="rounded bg-green-50 px-4 py-2 text-sm text-green-800">{notice}</p>}
      {actionError && <p className="rounded bg-red-50 px-4 py-2 text-sm text-red-700">{actionError}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Applicant">
          <Rows
            rows={[
              ["Email", <a key="e" href={`mailto:${app.applicant.email}`} className="underline">{app.applicant.email}</a>],
              ["Phone", app.applicant.phone],
              ["Date of birth", app.personal.dateOfBirth],
              ["ZIP code", app.personal.zipCode],
              ["SSN", `•••-••-${app.personal.ssnLast4}`],
            ]}
          />
        </Section>

        <Section title="Carrier submission">
          <Rows
            rows={[
              ["Carrier", app.plan.carrier.name],
              ["Attempts", String(app.submissionAttempts)],
              ["Reference", app.carrierReference],
              ["Last response", app.carrierMessage],
              ["Submitted", app.submittedAt && new Date(app.submittedAt).toLocaleString()],
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
            <p className="text-gray-500">No documents uploaded yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {app.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-4 py-1.5">
                  <span>
                    <span className="block">{DOCUMENT_TYPE_LABELS[d.type]}</span>
                    <span className="text-xs text-gray-500">
                      {d.fileName} · {formatBytes(d.sizeBytes)} · {new Date(d.uploadedAt).toLocaleDateString()}
                    </span>
                  </span>
                  <button
                    onClick={() =>
                      run(`doc-${d.id}`, () =>
                        downloadWithAuth(`/api/agent/applications/${app.id}/documents/${d.id}`, accessToken, d.fileName),
                      )
                    }
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

      <Section title="Document requests">
        {canRequest && (
          <form onSubmit={sendRequest} className="space-y-3 border-b border-gray-100 pb-4">
            <fieldset>
              <legend className="text-gray-600">Ask the applicant for:</legend>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {DOCUMENT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={requestTypes.includes(t)}
                      onChange={() =>
                        setRequestTypes((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]))
                      }
                    />
                    {DOCUMENT_TYPE_LABELS[t]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="text-gray-600">Message (shown in their account; the email only says documents are needed)</span>
              <textarea
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                rows={3}
                maxLength={2000}
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                placeholder="e.g. The carrier couldn't verify your identity — please upload a clearer photo ID."
              />
            </label>
            <button
              type="submit"
              disabled={busy !== null || requestTypes.length === 0 || !requestMessage.trim()}
              className="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50"
            >
              {busy === "request" ? "Sending..." : "Send request"}
            </button>
          </form>
        )}

        {app.documentRequests.length === 0 ? (
          <p className="pt-3 text-gray-500">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 pt-1">
            {app.documentRequests.map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{r.requestedTypes.map((t) => DOCUMENT_TYPE_LABELS[t]).join(", ")}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${r.resolvedAt ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}
                  >
                    {r.resolvedAt ? `Fulfilled ${new Date(r.resolvedAt).toLocaleDateString()}` : "Waiting on applicant"}
                  </span>
                </div>
                <p className="mt-1 text-gray-700">“{r.message}”</p>
                <p className="text-xs text-gray-500">
                  {r.agentName} · {new Date(r.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
