"use client";

import { useEffect, useState } from "react";
import { Send, Search, MessageSquare, User, Clock, Archive } from "lucide-react";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Field, Input, Textarea, Select } from "../../../components/ui/Field";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../components/ui/Toast";
import { formatDateTime } from "../../../lib/format";

interface Message {
  id: string;
  to: string;
  toName: string;
  subject: string;
  body: string;
  sentAt: Date;
  read: boolean;
}

interface Draft {
  to: string;
  subject: string;
  body: string;
}

const SAMPLE_AGENTS = [
  { id: "agent1", name: "John Smith" },
  { id: "agent2", name: "Sarah Johnson" },
  { id: "agent3", name: "Mike Davis" },
];

export default function AdminMessagesPage() {
  const { user, accessToken } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<"inbox" | "compose">("inbox");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState<Draft>({ to: "", subject: "", body: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);

  // Load messages from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("adminMessages");
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    }
  }, []);

  const filteredMessages = messages.filter(
    (m) =>
      m.toName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.to || !draft.subject.trim() || !draft.body.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    setSending(true);
    try {
      const agent = SAMPLE_AGENTS.find((a) => a.id === draft.to);
      const newMessage: Message = {
        id: `msg-${Date.now()}`,
        to: draft.to,
        toName: agent?.name || "Unknown",
        subject: draft.subject,
        body: draft.body,
        sentAt: new Date(),
        read: false,
      };

      const updated = [newMessage, ...messages];
      setMessages(updated);
      localStorage.setItem("adminMessages", JSON.stringify(updated));

      setDraft({ to: "", subject: "", body: "" });
      setTab("inbox");
      toast.success("Message sent successfully");
    } catch (err) {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  }

  const unreadCount = messages.filter((m) => !m.read).length;

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
              title={tab === "inbox" ? "Inbox" : "Compose Message"}
              subtitle={
                tab === "inbox"
                  ? `${filteredMessages.length} messages${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`
                  : undefined
              }
            />
            <CardBody>
              {tab === "inbox" ? (
                <div className="space-y-4">
                  <Field label="Search messages">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Search by agent name or subject..."
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
                          variant="outline"
                          onClick={() => setSelectedMessage(null)}
                        >
                          ← Back to Inbox
                        </Button>
                      </div>
                      <div className="rounded-lg border border-gray-200 p-6 space-y-4">
                        <div>
                          <h3 className="font-semibold text-gray-900">{selectedMessage.subject}</h3>
                          <p className="text-sm text-gray-600 mt-1">To: {selectedMessage.toName}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDateTime(selectedMessage.sentAt)}
                          </p>
                        </div>
                        <div className="border-t border-gray-200 pt-4 text-gray-700 whitespace-pre-wrap">
                          {selectedMessage.body}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredMessages.length === 0 ? (
                        <div className="rounded-lg bg-gray-50 p-8 text-center">
                          <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                          <p className="text-gray-600">No messages yet</p>
                        </div>
                      ) : (
                        filteredMessages.map((message) => (
                          <div
                            key={message.id}
                            onClick={() => setSelectedMessage(message)}
                            className="cursor-pointer rounded-lg border border-gray-200 p-4 transition hover:bg-gray-50"
                            style={{
                              backgroundColor: !message.read ? "#f0f9ff" : "white",
                              borderColor: !message.read ? "#93c5fd" : "#e5e7eb",
                            }}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 flex-shrink-0 text-gray-400" />
                                  <p className="font-medium text-gray-900 truncate">
                                    {message.toName}
                                  </p>
                                  {!message.read && (
                                    <span className="flex-shrink-0 inline-block h-2 w-2 rounded-full bg-blue-600" />
                                  )}
                                </div>
                                <p className="mt-1 text-sm text-gray-700 truncate">
                                  {message.subject}
                                </p>
                                <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                                  <Clock className="h-3 w-3" />
                                  {formatDateTime(message.sentAt)}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="space-y-4">
                  <Field label="To" required>
                    <Select
                      value={draft.to}
                      onChange={(e) => setDraft((prev) => ({ ...prev, to: e.target.value }))}
                    >
                      <option value="">Select an agent...</option>
                      {SAMPLE_AGENTS.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Subject" required>
                    <Input
                      type="text"
                      placeholder="Message subject"
                      value={draft.subject}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, subject: e.target.value }))
                      }
                    />
                  </Field>

                  <Field label="Message" required>
                    <Textarea
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
                      variant="outline"
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
                <MessageSquare className="mb-1 mr-2 inline h-4 w-4" />
                Inbox
                {unreadCount > 0 && (
                  <span className="ml-2 inline-block rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab("compose")}
                className={`w-full rounded-lg px-4 py-2 text-left font-medium transition ${
                  tab === "compose"
                    ? "bg-blue-100 text-blue-700"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <Send className="mb-1 mr-2 inline h-4 w-4" />
                Compose
              </button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Quick Stats" />
            <CardBody className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Messages</span>
                <span className="font-semibold text-gray-900">{messages.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Unread</span>
                <span className="font-semibold text-blue-600">{unreadCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Agents</span>
                <span className="font-semibold text-gray-900">{SAMPLE_AGENTS.length}</span>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
