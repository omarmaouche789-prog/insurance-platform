"use client";

import { useState } from "react";
import { CalendarClock, CalendarPlus, Check, Trash2 } from "lucide-react";
import type { FollowUpDTO } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { formatDateTime, formatRelative } from "../../lib/format";
import { useApiQuery } from "../../lib/use-api";
import { Badge } from "../ui/Badge";
import { Button, IconButton } from "../ui/Button";
import { CalendarPicker } from "../ui/CalendarPicker";
import { Card, CardHeader } from "../ui/Card";
import { CharCount, Field, Textarea } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { Alert, EmptyState, Skeleton } from "../ui/States";
import { useToast } from "../ui/Toast";

const NOTE_MAX = 1000;

export function FollowUpBadge({ f }: { f: FollowUpDTO }) {
  if (f.completedAt) return <Badge tone="green">Done</Badge>;
  const due = new Date(f.dueAt);
  if (due < new Date()) return <Badge tone="red" dot>Overdue</Badge>;
  if (due.toDateString() === new Date().toDateString()) return <Badge tone="amber" dot>Today</Badge>;
  return <Badge tone="blue">Upcoming</Badge>;
}

export function ScheduleFollowUpModal({ applicationId, open, onClose, onScheduled }: { applicationId: string; open: boolean; onClose: () => void; onScheduled: (f: FollowUpDTO) => void }) {
  const { accessToken } = useAuth();
  const [when, setWhen] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!when || !accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ followUp: FollowUpDTO }>(`/api/agent/applications/${applicationId}/schedule-followup`, {
        method: "POST",
        body: JSON.stringify({ dueAt: when.toISOString(), note }),
        accessToken,
      });
      onScheduled(res.followUp);
      setWhen(null);
      setNote("");
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      size="lg"
      title="Schedule a follow-up"
      description="We'll list it on your follow-ups page and flag it when it's due."
      footer={
        <>
          <span className="mr-auto self-center text-sm text-gray-600">{when ? <>Due <strong className="text-gray-900">{formatDateTime(when.toISOString())}</strong></> : "Pick a date and time"}</span>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!when || !note.trim()} onClick={submit}>Schedule</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <CalendarPicker value={when} onChange={setWhen} />
        <Field label={<span className="flex justify-between">What&apos;s the follow-up? <CharCount value={note} max={NOTE_MAX} /></span>} htmlFor="followup-note">
          <Textarea id="followup-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={NOTE_MAX} placeholder="e.g. Call to confirm they received the carrier's letter" />
        </Field>
      </div>
    </Modal>
  );
}

export function FollowUpsPanel({ applicationId }: { applicationId: string }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const { data, error, reload } = useApiQuery<{ followUps: FollowUpDTO[] }>(`/api/agent/applications/${applicationId}/follow-ups`, "Couldn't load follow-ups");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(f: FollowUpDTO, action: "complete" | "delete") {
    if (!accessToken) return;
    setBusy(f.id);
    try {
      await apiFetch(`/api/agent/follow-ups/${f.id}${action === "complete" ? "/complete" : ""}`, { method: action === "complete" ? "POST" : "DELETE", accessToken });
      toast.success(action === "complete" ? "Follow-up done" : "Follow-up removed");
      reload();
    } catch (err) {
      toast.error("Couldn't update follow-up", describeApiError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<CalendarClock className="h-4 w-4" />}
        title="Follow-ups"
        actions={<Button size="sm" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>Schedule</Button>}
      />
      {error ? (
        <p className="px-5 py-4 text-sm text-red-600">{error}</p>
      ) : !data ? (
        <div className="space-y-2 p-5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
      ) : data.followUps.length === 0 ? (
        <EmptyState title="Nothing scheduled" description="Set a reminder to check back with the applicant." className="py-8" />
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.followUps.map((f) => (
            <li key={f.id} className="flex items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${f.completedAt ? "text-gray-400 line-through" : "text-gray-900"}`}>{f.note}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                  <FollowUpBadge f={f} />
                  <span title={formatDateTime(f.dueAt)}>{formatDateTime(f.dueAt)} · {formatRelative(f.dueAt)}</span>
                </p>
              </div>
              {!f.completedAt && (
                <IconButton label="Mark done" disabled={busy === f.id} onClick={() => act(f, "complete")}><Check className="h-4 w-4" /></IconButton>
              )}
              <IconButton label="Delete follow-up" disabled={busy === f.id} onClick={() => act(f, "delete")}><Trash2 className="h-4 w-4" /></IconButton>
            </li>
          ))}
        </ul>
      )}
      <ScheduleFollowUpModal
        applicationId={applicationId}
        open={open}
        onClose={() => setOpen(false)}
        onScheduled={(f) => {
          setOpen(false);
          toast.success("Follow-up scheduled", formatDateTime(f.dueAt));
          reload();
        }}
      />
    </Card>
  );
}
