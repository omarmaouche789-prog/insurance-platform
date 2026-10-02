"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, Eye, FileText, HeartPulse, Mail, Phone, RotateCcw, Send, User } from "lucide-react";
import type { AgentApplicationDTO, ApplicationDocumentDTO } from "@insurance/shared";
import { DOCUMENT_TYPE_LABELS, HEALTH_CONDITION_LABELS, formatCents } from "@insurance/shared";
import { useAuth } from "../../../../lib/auth-context";
import { apiFetch, describeApiError } from "../../../../lib/api";
import { downloadWithAuth } from "../../../../lib/download";
import { formatDateTime, formatRelative } from "../../../../lib/format";
import { ApplicationStatusBadge } from "../../../../components/applications/ApplicationStatusBadge";
import { formatBytes } from "../../../../components/applications/DocumentUploadRow";
import { DocumentPreviewModal } from "../../../../components/agent/DocumentPreviewModal";
import { DocumentRequestsPanel } from "../../../../components/agent/DocumentRequestsPanel";
import { FollowUpsPanel } from "../../../../components/agent/FollowUpsPanel";
import { NotesPanel } from "../../../../components/agent/NotesPanel";
import { Button } from "../../../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../../../components/ui/Card";
import { PageContainer, PageHeader } from "../../../../components/ui/PageHeader";
import { Alert, EmptyState, ErrorState, LoadingState } from "../../../../components/ui/States";
import { useToast } from "../../../../components/ui/Toast";

function Rows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="divide-y divide-gray-100">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-2 text-sm">
          <dt className="text-gray-500">{label}</dt>
          <dd className="text-right text-gray-900">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// Re-check for new uploads this often while the page is open and visible.
const REFRESH_MS = 30_000;

export default function AgentApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const toast = useToast();
  const [app, setApp] = useState<AgentApplicationDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<ApplicationDocumentDTO | null>(null);

  const load = useCallback(() => {
    if (!accessToken) return;
    apiFetch<{ application: AgentApplicationDTO }>(`/api/agent/applications/${encodeURIComponent(id)}`, { accessToken })
      .then((res) => {
        setApp(res.application);
        setLoadError(null);
      })
      .catch((err) => setLoadError(describeApiError(err, "Couldn't load this application")));
  }, [accessToken, id]);

  useEffect(load, [load]);
  // Pick up uploads the applicant makes while the agent has the page open.
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function resubmit() {
    if (!accessToken) return;
    setBusy("resubmit");
    try {
      const res = await apiFetch<{ application: AgentApplicationDTO }>(`/api/agent/applications/${id}/resubmit`, { method: "POST", accessToken });
      setApp(res.application);
      if (res.application.submissionStatus === "ACCEPTED") toast.success("Accepted by the carrier", `Confirmation ${res.application.carrierReference}.`);
      else toast.error("The carrier rejected it again", res.application.carrierMessage ?? undefined);
    } catch (err) {
      toast.error("Resubmission failed", describeApiError(err));
      load(); // pick up any state the failed attempt recorded (e.g. FAILED)
    } finally {
      setBusy(null);
    }
  }

  async function download(path: string, name: string, key: string) {
    if (!accessToken) return;
    setBusy(key);
    try {
      await downloadWithAuth(path, accessToken, name);
    } catch (err) {
      toast.error("Download failed", describeApiError(err));
    } finally {
      setBusy(null);
    }
  }

  if (loadError) return <PageContainer><ErrorState message={loadError} onRetry={load} /></PageContainer>;
  if (!app || !accessToken) return <LoadingState className="py-32" />;

  const health = app.healthInfo;
  return (
    <PageContainer wide>
      <PageHeader
        back={{ href: "/agent/applications", label: "All applications" }}
        title={`${app.personal.firstName} ${app.personal.lastName}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ApplicationStatusBadge status={app.status} submissionStatus={app.submissionStatus} />
            {app.plan.name} · {formatCents(app.plan.monthlyPremiumCents)}/month
          </span>
        }
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} loading={busy === "pdf"} disabled={busy !== null} onClick={() => download(`/api/agent/applications/${app.id}/pdf`, `application-${app.id}.pdf`, "pdf")}>
              Export PDF
            </Button>
            {app.canResubmit && (
              <Button variant="primary" icon={<RotateCcw className="h-4 w-4" />} loading={busy === "resubmit"} disabled={busy !== null} onClick={resubmit}>
                Resubmit to carrier
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-6">
        {app.review && (
          <Alert tone={app.review.decision === "APPROVED" ? "green" : "red"}>
            <strong>{app.review.decision === "APPROVED" ? "Approved" : "Rejected"} by admin</strong> on {formatDateTime(app.review.reviewedAt)}
            {app.review.reason && <>: {app.review.reason}</>}
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader title="Applicant" icon={<User className="h-4 w-4" />} />
                <CardBody>
                  <Rows
                    rows={[
                      ["Email", <a key="e" href={`mailto:${app.applicant.email}`} className="inline-flex items-center gap-1 text-indigo-600 hover:underline"><Mail className="h-3.5 w-3.5" aria-hidden />{app.applicant.email}</a>],
                      ["Phone", app.applicant.phone && <a key="p" href={`tel:${app.applicant.phone}`} className="inline-flex items-center gap-1 text-indigo-600 hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden />{app.applicant.phone}</a>],
                      ["Date of birth", app.personal.dateOfBirth],
                      ["ZIP code", app.personal.zipCode],
                      ["SSN", `•••-••-${app.personal.ssnLast4}`],
                    ]}
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Carrier submission" icon={<Send className="h-4 w-4" />} />
                <CardBody>
                  <Rows
                    rows={[
                      ["Carrier", app.plan.carrier.name],
                      ["Attempts", String(app.submissionAttempts)],
                      ["Reference", app.carrierReference && <span key="r" className="font-mono text-xs">{app.carrierReference}</span>],
                      ["Last response", app.carrierMessage],
                      ["Submitted", app.submittedAt && formatDateTime(app.submittedAt)],
                    ]}
                  />
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardHeader title="Documents" icon={<FileText className="h-4 w-4" />} description="Previews open here; every view and download is audit-logged." />
              {app.documents.length === 0 ? (
                <EmptyState title="No documents uploaded yet" className="py-8" />
              ) : (
                <ul className="divide-y divide-gray-100">
                  {app.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <button type="button" onClick={() => setPreview(d)} className="flex min-w-0 items-center gap-3 text-left">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-[10px] font-bold uppercase text-indigo-700">
                          {d.mimeType === "application/pdf" ? "PDF" : d.mimeType.split("/")[1]}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900 hover:underline">{DOCUMENT_TYPE_LABELS[d.type]}</span>
                          <span className="block truncate text-xs text-gray-500">{d.fileName} · {formatBytes(d.sizeBytes)} · {formatRelative(d.uploadedAt)}</span>
                        </span>
                      </button>
                      <span className="flex shrink-0 gap-1">
                        <Button size="sm" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setPreview(d)}>Preview</Button>
                        <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} loading={busy === `doc-${d.id}`} disabled={busy !== null} onClick={() => download(`/api/agent/applications/${app.id}/documents/${d.id}`, d.fileName, `doc-${d.id}`)}>
                          <span className="sr-only sm:not-sr-only">Download</span>
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <DocumentRequestsPanel app={app} onChange={setApp} />

            <Card>
              <CardHeader title="Health information" icon={<HeartPulse className="h-4 w-4" />} />
              <CardBody>
                <Rows
                  rows={[
                    ["Conditions", health?.conditions.map((c) => HEALTH_CONDITION_LABELS[c]).join(", ") || "None reported"],
                    ["Other", health?.otherConditions],
                    ["Preferred doctors", health?.preferredDoctors.map((d) => (d.specialty ? `${d.name} (${d.specialty})` : d.name)).join(", ")],
                  ]}
                />
              </CardBody>
            </Card>
          </div>

          <div className="space-y-6">
            <FollowUpsPanel applicationId={app.id} />
            <NotesPanel path={`/api/agent/applications/${app.id}/notes`} />
          </div>
        </div>
      </div>

      <DocumentPreviewModal applicationId={app.id} document={preview} onClose={() => setPreview(null)} />
    </PageContainer>
  );
}
