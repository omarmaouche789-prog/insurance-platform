"use client";

import { useState } from "react";
import { Lock, StickyNote } from "lucide-react";
import type { ApplicationNoteDTO } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { formatDateTime, formatRelative } from "../../lib/format";
import { useApiQuery } from "../../lib/use-api";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { CharCount, Textarea } from "../ui/Field";
import { EmptyState, Skeleton } from "../ui/States";
import { useToast } from "../ui/Toast";

const MAX = 5000;

// Internal notes. `readOnly` is the admin view of an agent's notes.
export function NotesPanel({ path, readOnly = false }: { path: string; readOnly?: boolean }) {
  const { accessToken } = useAuth();
  const toast = useToast();
  const { data, error, setData } = useApiQuery<{ notes: ApplicationNoteDTO[] }>(path, "Couldn't load notes");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !body.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ note: ApplicationNoteDTO }>(path, { method: "POST", body: JSON.stringify({ body }), accessToken });
      setData((prev) => ({ notes: [res.note, ...(prev?.notes ?? [])] }));
      setBody("");
    } catch (err) {
      toast.error("Couldn't save note", describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<StickyNote className="h-4 w-4" />}
        title="Internal notes"
        description={<span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden /> Visible to agents and admins only</span>}
      />
      {!readOnly && (
        <CardBody className="border-b border-gray-100">
          <form onSubmit={add} className="space-y-2">
            <Textarea
              aria-label="New note"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={MAX}
              placeholder="Add context for yourself or reviewers…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void add(e);
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Ctrl/⌘ + Enter to save · <CharCount value={body} max={MAX} /></span>
              <Button type="submit" size="sm" variant="primary" loading={busy} disabled={!body.trim()}>Add note</Button>
            </div>
          </form>
        </CardBody>
      )}
      {error ? (
        <p className="px-5 py-4 text-sm text-red-600">{error}</p>
      ) : !data ? (
        <div className="space-y-2 p-5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>
      ) : data.notes.length === 0 ? (
        <EmptyState title="No notes yet" className="py-8" />
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.notes.map((n) => (
            <li key={n.id} className="flex gap-3 px-5 py-3">
              <Avatar firstName={n.author.firstName} lastName={n.author.lastName} size="sm" />
              <div className="min-w-0">
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-900">{n.author.firstName} {n.author.lastName}</span> · <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>{formatRelative(n.createdAt)}</time>
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-700">{n.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
