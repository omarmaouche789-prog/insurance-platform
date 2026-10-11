"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, Search, MessageSquare, User, Clock } from "lucide-react";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Field, Input, Textarea, Select } from "../../../components/ui/Field";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../components/ui/Toast";
import { formatDateTime } from "../../../lib/format";
import { apiFetch, describeApiError } from "../../../lib/api";
import { useApiQuery, useDebounced } from "../../../lib/use-api";
import { Badge } from "../../../components/ui/Badge";
import { Pagination } from "../../../components/ui/Pagination";
import { ErrorState, Skeleton } from "../../../components/ui/States";
import type { AdminAgentDTO, AdminAgentListResponseDTO, AdminMessageListResponseDTO, MessageDTO } from "@insurance/shared";
import { MESSAGE_BODY_MAX, MESSAGE_SUBJECT_MAX, MESSAGES_PAGE_SIZE } from "@insurance/shared";

interface Draft {
  to: string;
  subject: string;
  body: string;
}


export default function AdminMessagesPage() {
  const { accessToken } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<"inbox" | "compose">("inbox");
  const [draft, setDraft] = useState<Draft>({ to: "", subject: "", body: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounced(searchQuery.trim());
  const [page, setPage] = useState(1);
  const [sending, setSending] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<MessageDTO | null>(null);
  const [agentSearch, setAgentSearch] = useState("");

  // Real, active agents from the database, loaded when the page opens.
  const agentsQuery = useApiQuery<AdminAgentListResponseDTO>("/api/admin/agents?status=active", "Couldn't load agents");
  const agents = useMemo(
    () => [...(agentsQuery.data?.agents ?? [])].sort((a, b) => agentName(a).localeCompare(agentName(b))),
    [agentsQuery.data],
  );
  const matchingAgents = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    if (!q) return agents;
    // Keep the chosen agent listed even when the search no longer matches it.
    return agents.filter((a) => agentName(a).toLowerCase().includes(q) || a.id === draft.to);
  }, [agents, agentSearch, draft.to]);

  // Sent messages, with whether each agent has read them yet.
  const sentQs = new URLSearchParams({ page: String(page), ...(debouncedSearch ? { search: debouncedSearch } : {}) });
  const sentQuery = useApiQuery<AdminMessageListResponseDTO>(`/api/admin/messages?${sentQs}`, "Couldn't load sent messages");
  const sent = sentQuery.data;
  useEffect(() => setPage(1), [debouncedSearch]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.to || !draft.subject.trim() || !draft.body.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    if (!accessToken) return;
    setSending(true);
    try {
      const message = await apiFetch<MessageDTO>("/api/admin/messages", {
        method: "POST",
        accessToken,
        body: JSON.stringify({ toAgentId: draft.to, subject: draft.subject, body: draft.body }),
      });
      setDraft({ to: "", subject: "", body: "" });
      setAgentSearch("");
      setSelectedMessage(null);
      setTab("inbox");
      setPage(1);
      sentQuery.reload();
      toast.success(`Message sent to ${message.to.name}`, "They've been notified in their portal.");
    } catch (err) {
      toast.error("Couldn't send the message", describeApiError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Messages"
        description="Communicate with agents about applications and system updates."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Inbox */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title={tab === "inbox" ? "Sent Messages" : "Compose Message"}
              description={
                tab === "inbox" && sent
                  ? `${sent.pagination.total} message${sent.pagination.total === 1 ? "" : "s"}${debouncedSearch ? " match" : " sent"}`
                  : undefined
              }
            />
            <CardBody>
              {tab === "inbox" ? (
                <div className="space-y-4">
                  <Field label="Search messages" htmlFor="sent-search">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                      <Input
                        id="sent-search"
                        type="search"
                        placeholder="Search by subject"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </Field>

                  {selectedMessage ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedMessage(null)}
                        >
                          ← Back to Sent
                        </Button>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-6 space-y-4">
                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <h3 className="font-semibold text-gray-900">{selectedMessage.subject}</h3>
                            <ReadBadge message={selectedMessage} />
                          </div>
                          <p className="text-sm text-gray-600 mt-1">To: {selectedMessage.to.name}</p>
                          <p className="text-sm text-gray-600 mt-1">From: {selectedMessage.from.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Sent {formatDateTime(selectedMessage.sentAt)}
                            {selectedMessage.readAt && <> · Read {formatDateTime(selectedMessage.readAt)}</>}
                          </p>
                        </div>
                        <div className="border-t border-gray-200 pt-4 text-gray-700 whitespace-pre-wrap break-words">
                          {selectedMessage.body}
                        </div>
                      </div>
                    </div>
                  ) : (
                    sentQuery.error ? (
                      <ErrorState message={sentQuery.error} onRetry={sentQuery.reload} />
                    ) : !sent ? (
                      <div className="space-y-2" role="status" aria-label="Loading sent messages">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="space-y-2 rounded-lg border border-gray-200 p-4">
                            <Skeleton className="h-4 w-1/3" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        ))}
                      </div>
                    ) : sent.messages.length === 0 ? (
                      <div className="rounded-lg bg-gray-50 p-8 text-center">
                        <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-3" aria-hidden />
                        <p className="text-gray-600">{debouncedSearch ? "No messages match your search" : "No messages sent yet"}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {sent.messages.map((message) => (
                          <button
                            type="button"
                            key={message.id}
                            onClick={() => setSelectedMessage(message)}
                            className="block w-full rounded-lg border border-gray-200 p-4 text-left transition hover:bg-gray-50"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden />
                                  <p className="font-medium text-gray-900 truncate">{message.to.name}</p>
                                </div>
                                <p className="mt-1 text-sm text-gray-700 truncate">{message.subject}</p>
                                <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                                  <Clock className="h-3 w-3" aria-hidden />
                                  {formatDateTime(message.sentAt)}
                                </p>
                              </div>
                              <ReadBadge message={message} />
                            </div>
                          </button>
                        ))}
                        <Pagination page={page} pageSize={MESSAGES_PAGE_SIZE} total={sent.pagination.total} onPage={setPage} />
                      </div>
                    )
                  )}
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="space-y-4">
                  <Field
                    label="To"
                    htmlFor="message-to"
                    required
                    error={agentsQuery.error}
                    hint={
                      agentsQuery.data
                        ? agentSearch.trim()
                          ? `${matchingAgents.length} of ${agents.length} agents match`
                          : `${agents.length} active agent${agents.length === 1 ? "" : "s"}`
                        : undefined
                    }
                  >
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                        <Input
                          type="search"
                          placeholder="Search agents by name"
                          aria-label="Search agents by name"
                          value={agentSearch}
                          onChange={(e) => setAgentSearch(e.target.value)}
                          disabled={!agentsQuery.data}
                          className="pl-9"
                        />
                      </div>
                      <Select
                        id="message-to"
                        value={draft.to}
                        onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
                        disabled={!agentsQuery.data || agents.length === 0}
                      >
                        <option value="">
                          {agentsQuery.loading && !agentsQuery.data
                            ? "Loading agents…"
                            : agentsQuery.error
                              ? "Agents couldn't be loaded"
                              : agents.length === 0
                                ? "No active agents"
                                : matchingAgents.length === 0
                                  ? "No agents match your search"
                                  : "Select an agent..."}
                        </option>
                        {matchingAgents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agentName(agent)}
                          </option>
                        ))}
                      </Select>
                      {agentsQuery.error && (
                        <button type="button" onClick={agentsQuery.reload} className="text-xs font-medium text-primary-navy hover:underline dark:text-[#9fbbe0]">
                          Try again
                        </button>
                      )}
                    </div>
                  </Field>

                  <Field label="Subject" htmlFor="message-subject" required>
                    <Input
                      id="message-subject"
                      type="text"
                      maxLength={MESSAGE_SUBJECT_MAX}
                      placeholder="Message subject"
                      value={draft.subject}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, subject: e.target.value }))
                      }
                    />
                  </Field>

                  <Field label="Message" htmlFor="message-body" required hint={`${draft.body.length}/${MESSAGE_BODY_MAX}`}>
                    <Textarea
                      id="message-body"
                      maxLength={MESSAGE_BODY_MAX}
                      placeholder="Write your message here..."
                      value={draft.body}
                      onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
                      rows={8}
                    />
                  </Field>

                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="primary"
                      type="submit"
                      icon={<Send className="h-4 w-4" />}
                      loading={sending}
                      disabled={!draft.to || !draft.subject.trim() || !draft.body.trim()}
                    >
                      Send Message
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => setTab("inbox")}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-2">
              <button
                onClick={() => setTab("inbox")}
                className={`w-full rounded-lg px-4 py-2 text-left font-medium transition ${
                  tab === "inbox"
                    ? "bg-blue-100 text-blue-700"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <MessageSquare className="mb-1 mr-2 inline h-4 w-4" aria-hidden />
                Sent
              </button>
              <button
                onClick={() => setTab("compose")}
                className={`w-full rounded-lg px-4 py-2 text-left font-medium transition ${
                  tab === "compose"
                    ? "bg-blue-100 text-blue-700"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <Send className="mb-1 mr-2 inline h-4 w-4" aria-hidden />
                Compose
              </button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Quick Stats" />
            <CardBody className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">{debouncedSearch ? "Matching Messages" : "Total Sent"}</span>
                <span className="font-semibold text-gray-900">{sent ? sent.pagination.total : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Agents</span>
                <span className="font-semibold text-gray-900">{agentsQuery.data ? agents.length : "—"}</span>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function ReadBadge({ message }: { message: MessageDTO }) {
  return (
    <Badge tone={message.read ? "green" : "gray"} dot className="shrink-0">
      {message.read ? "Read" : "Not read yet"}
    </Badge>
  );
}

function agentName(a: Pick<AdminAgentDTO, "firstName" | "lastName">): string {
  return `${a.firstName} ${a.lastName}`.trim();
}
