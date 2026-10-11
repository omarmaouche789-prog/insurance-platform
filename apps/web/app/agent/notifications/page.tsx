"use client";

import { useEffect, useState } from "react";
import { Bell, Check, CheckCheck, ExternalLink, Loader2, Trash2 } from "lucide-react";
import type { AgentNotificationListResponseDTO, NotificationCategory, NotificationDTO } from "@insurance/shared";
import { AGENT_NOTIFICATIONS_PAGE_SIZE, NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { formatDateTime, formatRelative } from "../../../lib/format";
import { useApiQuery } from "../../../lib/use-api";
import { NotificationBadge } from "../../../components/agent/NotificationBadge";
import { NOTIFICATIONS_CHANGED } from "../../../components/NotificationBell";
import { Button, ButtonLink, IconButton } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Select } from "../../../components/ui/Field";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { EmptyState, ErrorState, Skeleton } from "../../../components/ui/States";
import { useToast } from "../../../components/ui/Toast";
import { cn } from "../../../components/ui/cn";

type ReadFilter = "" | "false" | "true";

export default function AgentNotificationsPage() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [category, setCategory] = useState<NotificationCategory | "">("");
  const [read, setRead] = useState<ReadFilter>("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), ...(category ? { type: category } : {}), ...(read ? { read } : {}) });
  const query = useApiQuery<AgentNotificationListResponseDTO>(`/api/agent/notifications?${qs}`, "Couldn't load notifications");
  const data = query.data;
  const items = data?.notifications ?? [];

  // A new page or filter starts with nothing selected.
  useEffect(() => setSelected(new Set()), [page, category, read]);

  // Deleting the last item on a page steps back a page.
  useEffect(() => {
    if (data && items.length === 0 && page > 1 && data.pagination.total > 0) setPage(data.pagination.pages);
  }, [data, items.length, page]);

  function changed() {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  }

  async function markRead(ids: string[], quiet = false) {
    if (!accessToken || ids.length === 0) return;
    setBusy("read");
    try {
      await apiFetch("/api/agent/notifications/bulk/read", { method: "PATCH", accessToken, body: JSON.stringify({ ids }) });
      const now = new Date().toISOString();
      query.setData((d) => ({
        ...d!,
        unreadCount: Math.max(0, d!.unreadCount - d!.notifications.filter((n) => ids.includes(n.id) && !n.readAt).length),
        notifications: d!.notifications.map((n) => (ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)),
      }));
      setSelected(new Set());
      if (read === "false") query.reload(); // they no longer match the filter
      changed();
      if (!quiet) toast.success(ids.length === 1 ? "Marked as read" : `${ids.length} notifications marked as read`);
    } catch (err) {
      toast.error("Couldn't mark as read", describeApiError(err));
    } finally {
      setBusy(null);
    }
  }

  async function markAllRead() {
    if (!accessToken) return;
    setBusy("all");
    try {
      const res = await apiFetch<{ updated: number }>("/api/agent/notifications/read-all", { method: "PATCH", accessToken });
      query.reload();
      changed();
      toast.success(res.updated ? `${res.updated} notification${res.updated === 1 ? "" : "s"} marked as read` : "Everything was already read");
    } catch (err) {
      toast.error("Couldn't mark all as read", describeApiError(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(n: NotificationDTO) {
    if (!accessToken) return;
    setBusy(n.id);
    try {
      await apiFetch(`/api/agent/notifications/${n.id}`, { method: "DELETE", accessToken });
      query.setData((d) => ({
        ...d!,
        unreadCount: n.readAt ? d!.unreadCount : Math.max(0, d!.unreadCount - 1),
        notifications: d!.notifications.filter((x) => x.id !== n.id),
        pagination: { ...d!.pagination, total: Math.max(0, d!.pagination.total - 1) },
      }));
      setSelected((s) => {
        const next = new Set(s);
        next.delete(n.id);
        return next;
      });
      changed();
      toast.success("Notification deleted");
    } catch (err) {
      toast.error("Couldn't delete the notification", describeApiError(err));
    } finally {
      setBusy(null);
    }
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = items.length > 0 && items.every((n) => selected.has(n.id));
  const selectedUnread = items.filter((n) => selected.has(n.id) && !n.readAt).map((n) => n.id);
  const filtered = Boolean(category || read);

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="New assignments, status changes, carrier responses and document uploads for your applications."
        actions={
          data && data.unreadCount > 0 ? (
            <Button icon={<CheckCheck className="h-4 w-4" aria-hidden />} loading={busy === "all"} disabled={busy !== null} onClick={() => void markAllRead()}>
              Mark all as read ({data.unreadCount})
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Select
            aria-label="Filter by type"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as NotificationCategory | "");
              setPage(1);
            }}
            className="sm:w-56"
          >
            <option value="">All types</option>
            {NOTIFICATION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {NOTIFICATION_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by status"
            value={read}
            onChange={(e) => {
              setRead(e.target.value as ReadFilter);
              setPage(1);
            }}
            className="sm:w-44"
          >
            <option value="">All statuses</option>
            <option value="false">Unread</option>
            <option value="true">Read</option>
          </Select>
          {filtered && (
            <button
              type="button"
              className="text-sm font-medium text-gray-500 hover:text-gray-900"
              onClick={() => {
                setCategory("");
                setRead("");
                setPage(1);
              }}
            >
              Clear filters
            </button>
          )}
          {data && <p className="text-sm text-gray-500 sm:ml-auto">{data.unreadCount} unread</p>}
        </div>
      </Card>

      <Card>
        {query.error ? (
          <ErrorState message={query.error} onRetry={query.reload} />
        ) : !data ? (
          <div className="divide-y divide-gray-100" role="status" aria-label="Loading notifications">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4 px-5 py-4">
                <Skeleton className="h-4 w-4" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-5 w-5" aria-hidden />}
            title={filtered ? "No notifications match these filters" : "No notifications yet"}
            description={
              filtered
                ? "Try another type or status."
                : "You'll be notified here when an application is assigned to you, the carrier responds, an admin makes a decision, or an applicant uploads requested documents."
            }
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gray-50 px-5 py-2.5">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 accent-primary-navy"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((n) => n.id)))}
                  aria-label="Select all on this page"
                />
                {selected.size > 0 ? `${selected.size} selected` : "Select all"}
              </label>
              {selected.size > 0 && (
                <Button
                  size="sm"
                  variant="navy"
                  icon={<Check className="h-3.5 w-3.5" aria-hidden />}
                  loading={busy === "read"}
                  disabled={selectedUnread.length === 0 || busy !== null}
                  onClick={() => void markRead(selectedUnread)}
                  className="ml-auto"
                >
                  {selectedUnread.length === 0 ? "Already read" : `Mark ${selectedUnread.length} as read`}
                </Button>
              )}
            </div>
            <ul aria-label="Notifications">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    // Row separators are top borders (not divide-y, which would
                    // override the unread marker's left-border color).
                    "flex items-start gap-4 border-l-4 border-t border-t-gray-100 px-5 py-4 transition-colors first:border-t-0",
                    n.readAt ? "border-l-transparent" : "border-l-primary-orange bg-amber-50",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 accent-primary-navy"
                    checked={selected.has(n.id)}
                    onChange={() => toggle(n.id)}
                    aria-label={`Select: ${n.title}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {!n.readAt && <span className="sr-only">Unread:</span>}
                      <h3 className={cn("text-sm", n.readAt ? "font-medium text-gray-700" : "font-semibold text-gray-900")}>{n.title}</h3>
                      <NotificationBadge category={n.category} />
                    </div>
                    {n.body && <p className="mt-1 text-sm text-gray-600">{n.body}</p>}
                    <p className="mt-1.5 text-xs text-gray-500">
                      <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
                        {formatRelative(n.createdAt)}
                      </time>
                      {n.readAt && <> · read</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {n.link && (
                      <span onClickCapture={() => !n.readAt && void markRead([n.id], true)}>
                        <ButtonLink href={n.link} size="sm" icon={<ExternalLink className="h-3.5 w-3.5" aria-hidden />}>
                          View
                        </ButtonLink>
                      </span>
                    )}
                    {!n.readAt && (
                      <IconButton label="Mark as read" onClick={() => void markRead([n.id])} disabled={busy !== null}>
                        <Check className="h-4 w-4" aria-hidden />
                      </IconButton>
                    )}
                    <IconButton label="Delete notification" onClick={() => void remove(n)} disabled={busy !== null} className="hover:bg-red-50 hover:text-red-700">
                      {busy === n.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={AGENT_NOTIFICATIONS_PAGE_SIZE} total={data.pagination.total} onPage={setPage} />
          </>
        )}
      </Card>
    </PageContainer>
  );
}
