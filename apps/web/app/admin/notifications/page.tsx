"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCircle, AlertCircle, User, Clock, Filter, Trash2, Check } from "lucide-react";
import { EmailTemplatesTab } from "../../../components/admin/notifications/EmailTemplatesTab";
import { SmsTemplatesTab } from "../../../components/admin/notifications/SmsTemplatesTab";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { FilterTabs } from "../../../components/ui/Tabs";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Field";
import { Badge } from "../../../components/ui/Badge";
import { formatDateTime, formatRelativeTime } from "../../../lib/format";

type Tab = "activity" | "email" | "sms";

interface ActivityNotification {
  id: string;
  type: "application_submitted" | "application_approved" | "application_rejected" | "agent_assigned" | "user_registered";
  title: string;
  description: string;
  icon: React.ReactNode;
  read: boolean;
  createdAt: Date;
  metadata?: Record<string, any>;
}

const ACTIVITY_SAMPLES: ActivityNotification[] = [
  {
    id: "1",
    type: "application_submitted",
    title: "New Application Submitted",
    description: "John Doe submitted a new insurance application for review",
    icon: <AlertCircle className="h-5 w-5 text-orange-500" />,
    read: false,
    createdAt: new Date(Date.now() - 5 * 60000),
  },
  {
    id: "2",
    type: "application_approved",
    title: "Application Approved",
    description: "Sarah Johnson's application was approved by Admin User",
    icon: <CheckCircle className="h-5 w-5 text-green-500" />,
    read: false,
    createdAt: new Date(Date.now() - 30 * 60000),
  },
  {
    id: "3",
    type: "agent_assigned",
    title: "Agent Assigned",
    description: "Application #APP-2024-001 was assigned to Mike Davis",
    icon: <User className="h-5 w-5 text-blue-500" />,
    read: true,
    createdAt: new Date(Date.now() - 2 * 3600000),
  },
  {
    id: "4",
    type: "user_registered",
    title: "New User Registered",
    description: "New user Jane Smith registered an account",
    icon: <User className="h-5 w-5 text-gray-500" />,
    read: true,
    createdAt: new Date(Date.now() - 24 * 3600000),
  },
];

function ActivityTab() {
  const [notifications, setNotifications] = useState<ActivityNotification[]>(ACTIVITY_SAMPLES);
  const [filterType, setFilterType] = useState<string>("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const filtered = notifications.filter((n) => {
    if (filterType !== "all" && n.type !== filterType) return false;
    if (showUnreadOnly && n.read) return false;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  function markAsRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function deleteNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardBody>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-4 sm:grid-cols-2 flex-1">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Activity Type
                </label>
                <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="all">All activities</option>
                  <option value="application_submitted">Applications Submitted</option>
                  <option value="application_approved">Applications Approved</option>
                  <option value="application_rejected">Applications Rejected</option>
                  <option value="agent_assigned">Agent Assignments</option>
                  <option value="user_registered">User Registrations</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={showUnreadOnly}
                  onChange={(e) => setShowUnreadOnly(e.target.checked)}
                  className="rounded"
                />
                <span className="text-gray-700">Unread only</span>
              </label>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAllAsRead}
              >
                <Check className="h-4 w-4 mr-1" />
                Mark all as read
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Activity List */}
      <Card>
        <CardHeader title={`Activity Feed (${filtered.length})`} subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined} />
        <CardBody>
          {filtered.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-12 text-center">
              <Bell className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <p className="text-gray-600">No activities match your filters</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filtered.map((notification) => (
                <div
                  key={notification.id}
                  className="flex gap-4 rounded-lg border border-gray-200 p-4 transition hover:bg-gray-50"
                  style={{
                    backgroundColor: !notification.read ? "#f0f9ff" : "white",
                    borderColor: !notification.read ? "#93c5fd" : "#e5e7eb",
                  }}
                >
                  <div className="flex-shrink-0 pt-1">
                    {notification.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-gray-900">
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <span className="flex-shrink-0 inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      {notification.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                  </div>
                  <div className="flex-shrink-0 flex gap-1">
                    {!notification.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Check className="h-4 w-4" />}
                        onClick={() => markAsRead(notification.id)}
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={() => deleteNotification(notification.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function AdminNotificationsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<Tab>("activity");

  // The tab lives in ?tab= so links and reloads land on the same one. Read
  // after mount so the page builds statically without a Suspense boundary.
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (tabParam === "email" || tabParam === "sms") {
      setTab(tabParam as Tab);
    }
  }, []);

  function changeTab(next: Tab) {
    setTab(next);
    const newPath =
      next === "activity"
        ? pathname
        : next === "email"
          ? `${pathname}?tab=email`
          : `${pathname}?tab=sms`;
    router.replace(newPath, { scroll: false });
  }

  return (
    <PageContainer wide>
      <PageHeader title="Notifications" description="View activity feed and manage notification templates." />
      <div className="mb-5">
        <FilterTabs<Tab>
          label="Notification type"
          value={tab}
          onChange={changeTab}
          tabs={[
            { value: "activity", label: "Activity Dashboard" },
            { value: "email", label: "Email templates" },
            { value: "sms", label: "SMS templates" },
          ]}
        />
      </div>
      {tab === "activity" ? (
        <ActivityTab />
      ) : tab === "email" ? (
        <EmailTemplatesTab />
      ) : (
        <SmsTemplatesTab />
      )}
    </PageContainer>
  );
}
