"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Clock, Inbox, Mail, MailOpen, Search, User } from "lucide-react";
import type { AgentMessageListResponseDTO, MessageDTO } from "@insurance/shared";
import { MESSAGES_PAGE_SIZE } from "@insurance/shared";
import { apiFetch, describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { formatDateTime, formatRelative } from "../../../lib/format";
import { useApiQuery, useDebounced } from "../../../lib/use-api";
import { NOTIFICATIONS_CHANGED } from "../../../components/NotificationBell";
import { Badge } from "../../../components/ui/Badge";
import { Button, IconButton } from "../../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { Field, Input, Select } from "../../../components/ui/Field";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { EmptyState, ErrorState, LoadingState, Skeleton } from "../../../components/ui/States";
import { useToast } from "../../../components/ui/Toast";
import { cn } from "../../../components/ui/cn";

type ReadFilter = "" | "false" | "true";

// useSearchParams in a client component needs a Suspense boundary for `next build`.
export default function AgentMessagesPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AgentMessages />
    </Suspense>
  );
}

function AgentMessages() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const router = useRouter();
  // The open message lives in the URL (?id=), so notification links and the
  // browser's back button work.
  const openId = useSearchParams().get("id");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const [read, setRead] = useState<ReadFilter>("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), ...(debouncedSearch ? { search: debouncedSearch } : {}), ...(read ? { read } : {}) });
  const list = useApiQuery<AgentMessageListResponseDTO>(`/api/agent/messages?${qs}`, "Couldn't load your messages");
  const detail = useApiQuery<MessageDTO>(openId ? `/api/agent/messages/${encodeURIComponent(openId)}` : null, "Couldn't open this message");
  const data = list.data;
  const messages = data?.messages ?? [];
  const filtered = Boolean(debouncedSearch || read);

  // A new search or filter starts at the first page.
  useEffect(() => setPage(1), [debouncedSearch, read]);

  // Shows a changed message everywhere it appears and updates the bell.
  function applyChange(updated: MessageDTO, before: MessageDTO) {
    const delta = before.read === updated.read ? 0 : updated.read ? -1 : 1;
    list.setData((d) => (d ? { ...d, unreadCount: Math.max(0, d.unreadCount + delta), messages: d.messages.map((m) => (m.id === updated.id ? updated : m)) } : d) as AgentMessageListResponseDTO);
    if (detail.data?.id === updated.id) detail.setData(updated);
    if (read) list.reload(); // it may no longer match the read filter
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  }

  async function setReadState(message: MessageDTO, markRead: boolean, quiet = false) {
    if (!accessToken) return;
    setBusy(message.id);
    try {
      const updated = await apiFetch<MessageDTO>(`/api/agent/messages/${message.id}/${markRead ? "read" : "unread"}`, { method: "PUT", accessToken });
      applyChange(updated, message);
      if (!quiet) toast.success(markRead ? "Marked as read" : "Marked as unread");
    } catch (err) {
      toast.error("Couldn't update the message", describeApiError(err));
    } finally {
      setBusy(null);
    }
  }

  // Opening an unread message marks it read (once: "Mark as unread" while
  // it's open must stick).
  const autoRead = useRef<Set<string>>(new Set());
  useEffect(() => {
    const m = detail.data;
    if (!m || m.read || autoRead.current.has(m.id)) return;
    autoRead.current.add(m.id);
    void setReadState(m, true, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data]);

  const openMessage = (m: MessageDTO) => router.push(`/agent/messages?id=${encodeURIComponent(m.id)}`);
  const backToInbox = () => router.push("/agent/messages");
  const shown = openId && detail.data?.id === openId ? detail.data : null;

  return (
    <PageContainer>
      <PageHeader title="Messages" description="Messages from the admin team about applications, targets and system updates." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title={openId ? "Message" : "Inbox"}
              description={!openId && data ? `${data.pagination.total} message${data.pagination.total === 1 ? "" : "s"}${data.unreadCount > 0 ? ` (${data.unreadCount} unread)` : ""}` : undefined}
            />
            <CardBody>
              {openId ? (
                <div className="space-y-4">
                  <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" aria-hidden />} onClick={backToInbox}>
                    Back to Inbox
                  </Button>
                  {detail.error ? (
                    <ErrorState message={detail.error} onRetry={detail.reload} />
                  ) : !shown ? (
                    <div className="space-y-3 rounded-lg border border-gray-200 p-6" role="status" aria-label="Loading message">
                      <Skeleton className="h-5 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  ) : (
                    <article className="space-y-4 rounded-lg border border-gray-200 p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="text-lg font-semibold text-gray-900">{shown.subject}</h2>
                          <p className="mt-1 text-sm text-gray-600">From: {shown.from.name}</p>
                          <p className="mt-1 text-xs text-gray-500">{formatDateTime(shown.sentAt)}</p>
                        </div>
                        <Badge tone={shown.read ? "gray" : "amber"} dot>
                          {shown.read ? "Read" : "Unread"}
                        </Badge>
                      </div>
                      <div className="whitespace-pre-wrap break-words border-t border-gray-200 pt-4 text-gray-700">{shown.body}</div>
                      <div className="border-t border-gray-200 pt-4">
                        <Button
                          variant="secondary"
                          icon={shown.read ? <Mail className="h-4 w-4" aria-hidden /> : <MailOpen className="h-4 w-4" aria-hidden />}
                          loading={busy === shown.id}
                          onClick={() => void setReadState(shown, !shown.read)}
                        >
                          {shown.read ? "Mark as unread" : "Mark as read"}
                        </Button>
                      </div>
                    </article>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <Field label="Search messages" htmlFor="message-search" className="flex-1">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                        <Input id="message-search" type="search" placeholder="Search by subject" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                      </div>
                    </Field>
                    <Select aria-label="Filter by status" value={read} onChange={(e) => setRead(e.target.value as ReadFilter)} className="sm:w-40">
                      <option value="">All messages</option>
                      <option value="false">Unread</option>
                      <option value="true">Read</option>
                    </Select>
                  </div>

                  {list.error ? (
                    <ErrorState message={list.error} onRetry={list.reload} />
                  ) : !data ? (
                    <div className="space-y-2" role="status" aria-label="Loading messages">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="space-y-2 rounded-lg border border-gray-200 p-4">
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-3 w-2/3" />
                        </div>
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <EmptyState
                      icon={<Inbox className="h-5 w-5" aria-hidden />}
                      title={filtered ? "No messages match" : "No messages yet"}
                      description={filtered ? "Try another subject or status." : "Messages from the admin team will appear here."}
                    />
                  ) : (
                    <>
                      <ul className="space-y-2" aria-label="Messages">
                        {messages.map((m) => (
                          <li
                            key={m.id}
                            className={cn(
                              "flex items-start gap-2 rounded-lg border border-l-4 transition-colors",
                              m.read ? "border-gray-200 hover:bg-gray-50" : "border-amber-200 border-l-primary-orange bg-amber-50",
                            )}
                          >
                            <button type="button" onClick={() => openMessage(m)} className="min-w-0 flex-1 p-4 text-left">
                              <span className="flex items-center gap-2">
                                {!m.read && <span className="sr-only">Unread:</span>}
                                <span className={cn("truncate text-gray-900", m.read ? "font-medium" : "font-semibold")}>{m.subject}</span>
                              </span>
                              <span className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
                                <User className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                                {m.from.name}
                              </span>
                              <span className="mt-1 block truncate text-sm text-gray-500">{m.body}</span>
                              <span className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
                                <Clock className="h-3 w-3" aria-hidden />
                                <time dateTime={m.sentAt} title={formatDateTime(m.sentAt)}>
                                  {formatRelative(m.sentAt)}
                                </time>
                              </span>
                            </button>
                            <IconButton
                              label={m.read ? `Mark "${m.subject}" as unread` : `Mark "${m.subject}" as read`}
                              onClick={() => void setReadState(m, !m.read)}
                              disabled={busy !== null}
                              className="m-3"
                            >
                              {m.read ? <Mail className="h-4 w-4" aria-hidden /> : <MailOpen className="h-4 w-4" aria-hidden />}
                            </IconButton>
                          </li>
                        ))}
                      </ul>
                      <Pagination page={page} pageSize={MESSAGES_PAGE_SIZE} total={data.pagination.total} onPage={setPage} />
                    </>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Quick Stats" />
            <CardBody className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{filtered ? "Matching messages" : "Total messages"}</span>
                <span className="font-semibold text-gray-900">{data ? data.pagination.total : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Unread</span>
                <span className="font-semibold text-primary-orange">{data ? data.unreadCount : "—"}</span>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-sm text-gray-600">
              Messages are sent by the admin team. Replies aren&apos;t supported yet; contact your admin directly if you need to respond.
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
