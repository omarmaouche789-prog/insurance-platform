"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck2, Check, Trash2 } from "lucide-react";
import type { FollowUpDTO, FollowUpFilter, FollowUpListResponseDTO } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { formatDateTime, formatRelative } from "../../../lib/format";
import { useApiQuery } from "../../../lib/use-api";
import { FollowUpBadge } from "../../../components/agent/FollowUpsPanel";
import { IconButton } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "../../../components/ui/States";
import { FilterTabs } from "../../../components/ui/Tabs";
import { useToast } from "../../../components/ui/Toast";

// Groups by calendar day so the list reads like an agenda.
function groupByDay(items: FollowUpDTO[], key: "dueAt" | "completedAt") {
  const groups = new Map<string, FollowUpDTO[]>();
  for (const f of items) {
    const label = new Date(f[key] ?? f.dueAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    groups.set(label, [...(groups.get(label) ?? []), f]);
  }
  return [...groups.entries()];
}

export default function AgentFollowUpsPage() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<FollowUpFilter>("upcoming");
  const { data, error, reload } = useApiQuery<FollowUpListResponseDTO>(`/api/agent/follow-ups?filter=${filter}`, "Couldn't load follow-ups");
  const [busy, setBusy] = useState<string | null>(null);

  async function act(f: FollowUpDTO, action: "complete" | "delete") {
    if (!accessToken) return;
    setBusy(f.id);
    try {
      await apiFetch(`/api/agent/follow-ups/${f.id}${action === "complete" ? "/complete" : ""}`, { method: action === "complete" ? "POST" : "DELETE", accessToken });
      toast.success(action === "complete" ? "Marked done" : "Follow-up removed");
      reload();
    } catch (err) {
      toast.error("Couldn't update follow-up", describeApiError(err));
    } finally {
      setBusy(null);
    }
  }

  const c = data?.counts;
  return (
    <PageContainer>
      <PageHeader title="Follow-ups" description="Reminders you've scheduled on your applications." />
      <div className="mb-4">
        <FilterTabs<FollowUpFilter>
          label="Follow-up filter"
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "overdue", label: "Overdue", count: c?.overdue },
            { value: "upcoming", label: "Upcoming", count: c?.upcoming },
            { value: "completed", label: "Completed", count: c?.completed },
          ]}
        />
      </div>
      <Card>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data ? (
          <TableSkeleton rows={5} cols={3} />
        ) : data.followUps.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck2 className="h-5 w-5" />}
            title={filter === "overdue" ? "Nothing overdue" : filter === "completed" ? "No completed follow-ups" : "No upcoming follow-ups"}
            description="Schedule follow-ups from any application's page."
          />
        ) : (
          groupByDay(data.followUps, filter === "completed" ? "completedAt" : "dueAt").map(([day, items]) => (
            <section key={day} aria-label={day}>
              <h2 className="border-b border-gray-100 bg-gray-50/60 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{day}</h2>
              <ul className="divide-y divide-gray-100">
                {items.map((f) => (
                  <li key={f.id} className="flex items-center gap-4 px-5 py-3">
                    <span className="w-20 shrink-0 text-sm tabular-nums text-gray-500">
                      {new Date(f.dueAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/agent/applications/${f.applicationId}`} className="text-sm font-medium text-gray-900 hover:underline">{f.applicantName}</Link>
                      <p className={`text-sm ${f.completedAt ? "text-gray-400 line-through" : "text-gray-600"}`}>{f.note}</p>
                    </div>
                    <span className="hidden text-xs text-gray-500 sm:block" title={formatDateTime(f.dueAt)}>{formatRelative(f.dueAt)}</span>
                    <FollowUpBadge f={f} />
                    {!f.completedAt && <IconButton label="Mark done" disabled={busy === f.id} onClick={() => act(f, "complete")}><Check className="h-4 w-4" /></IconButton>}
                    <IconButton label="Delete" disabled={busy === f.id} onClick={() => act(f, "delete")}><Trash2 className="h-4 w-4" /></IconButton>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </Card>
    </PageContainer>
  );
}
