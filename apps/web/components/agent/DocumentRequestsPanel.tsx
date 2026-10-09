"use client";

import { useState } from "react";
import { CheckCircle2, Clock, FileQuestion, Inbox, Send, XCircle } from "lucide-react";
import type { AgentApplicationDTO, DocumentRequestStatus, DocumentType } from "@insurance/shared";
import { DOCUMENT_REQUEST_STATUS_LABELS, DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { formatRelative } from "../../lib/format";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { CharCount, Field, Textarea } from "../ui/Field";
import { EmptyState } from "../ui/States";
import { useToast } from "../ui/Toast";
import { cn } from "../ui/cn";

const TONE: Record<DocumentRequestStatus, BadgeTone> = { OPEN: "amber", FULFILLED: "blue", COMPLETED: "green", CANCELLED: "gray" };
const MESSAGE_MAX = 2000;

const TEMPLATES: Array<{ label: string; types: DocumentType[]; message: string }> = [
  { label: "Clearer ID", types: ["PHOTO_ID"], message: "The carrier couldn't read your photo ID. Please upload a clear, uncropped photo of the front of your ID." },
  { label: "Income proof", types: ["PROOF_OF_INCOME"], message: "To confirm your eligibility for savings, please upload a recent pay stub, W-2 or tax return." },
  { label: "New address", types: ["PROOF_OF_ADDRESS"], message: "Please upload a utility bill or bank statement from the last 60 days showing your current address." },
];

export function DocumentRequestsPanel({ app, onChange }: { app: AgentApplicationDTO; onChange: (app: AgentApplicationDTO) => void }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const canRequest = !app.review && app.submissionStatus !== "PENDING";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setBusy("send");
    try {
      const res = await apiFetch<{ application: AgentApplicationDTO }>(`/api/agent/applications/${app.id}/request-documents`, {
        method: "POST",
        body: JSON.stringify({ requestedTypes: types, message }),
        accessToken,
      });
      onChange(res.application);
      setTypes([]);
      setMessage("");
      toast.success("Request sent", "The applicant was notified in their account and by email.");
    } catch (err) {
      toast.error("Couldn't send request", describeApiError(err));
    } finally {
      setBusy(null);
    }
  }

  async function close(requestId: string, outcome: "complete" | "cancel") {
    if (!accessToken) return;
    setBusy(requestId);
    try {
      const res = await apiFetch<{ application: AgentApplicationDTO }>(`/api/agent/applications/${app.id}/document-requests/${requestId}/${outcome}`, {
        method: "POST",
        accessToken,
      });
      onChange(res.application);
      toast.success(outcome === "complete" ? "Marked complete" : "Request cancelled");
    } catch (err) {
      toast.error("Couldn't update request", describeApiError(err));
    } finally {
      setBusy(null);
    }
  }

  const open = app.documentRequests.filter((r) => r.status === "OPEN" || r.status === "FULFILLED").length;
  return (
    <Card>
      <CardHeader
        icon={<FileQuestion className="h-4 w-4" />}
        title="Document requests"
        description={open ? `${open} open` : "Ask the applicant for anything the carrier needs."}
      />
      {canRequest && (
        <CardBody className="border-b border-gray-100">
          <form onSubmit={send} className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">What do you need?</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Document types">
                {DOCUMENT_TYPES.map((t) => {
                  const on = types.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setTypes((l) => (on ? l.filter((x) => x !== t) : [...l, t]))}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        on ? "border-primary-navy bg-primary-navy text-onaccent" : "border-gray-300 bg-white text-gray-700 hover:border-gray-400",
                      )}
                    >
                      {DOCUMENT_TYPE_LABELS[t]}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field
              label={<span className="flex justify-between">Message <CharCount value={message} max={MESSAGE_MAX} /></span>}
              htmlFor="request-message"
              hint="Shown in their account. The email only says documents are needed — no details."
            >
              <Textarea id="request-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={MESSAGE_MAX} placeholder="Explain what's needed and why." />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs text-gray-500">Templates:</span>
                {TEMPLATES.map((tpl) => (
                  <button key={tpl.label} type="button" className="text-xs font-medium text-primary-navy hover:underline" onClick={() => { setTypes(tpl.types); setMessage(tpl.message); }}>
                    {tpl.label}
                  </button>
                ))}
              </div>
              <Button type="submit" variant="primary" size="sm" icon={<Send className="h-3.5 w-3.5" />} loading={busy === "send"} disabled={types.length === 0 || !message.trim()}>
                Send request
              </Button>
            </div>
          </form>
        </CardBody>
      )}
      {app.documentRequests.length === 0 ? (
        <EmptyState icon={<Inbox className="h-5 w-5" />} title="No requests yet" className="py-10" />
      ) : (
        <ul className="divide-y divide-gray-100">
          {app.documentRequests.map((r) => (
            <li key={r.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {r.requestedTypes.map((t) => (
                    <span key={t} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{DOCUMENT_TYPE_LABELS[t]}</span>
                  ))}
                </div>
                <Badge tone={TONE[r.status]} dot>
                  {DOCUMENT_REQUEST_STATUS_LABELS[r.status]}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-gray-700">“{r.message}”</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="h-3 w-3" aria-hidden /> {r.agentName} · {formatRelative(r.createdAt)}
                  {r.status === "FULFILLED" && r.resolvedAt && <> · uploaded {formatRelative(r.resolvedAt)}</>}
                  {r.completedAt && r.status !== "FULFILLED" && <> · closed {formatRelative(r.completedAt)}</>}
                </p>
                {(r.status === "OPEN" || r.status === "FULFILLED") && (
                  <span className="flex gap-1">
                    <Button size="sm" variant={r.status === "FULFILLED" ? "primary" : "secondary"} icon={<CheckCircle2 className="h-3.5 w-3.5" />} loading={busy === r.id} onClick={() => close(r.id, "complete")}>
                      Mark complete
                    </Button>
                    {r.status === "OPEN" && (
                      <Button size="sm" variant="ghost" icon={<XCircle className="h-3.5 w-3.5" />} disabled={busy === r.id} onClick={() => close(r.id, "cancel")}>
                        Cancel
                      </Button>
                    )}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
