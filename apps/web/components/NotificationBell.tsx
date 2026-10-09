"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import type { NotificationDTO, NotificationListResponseDTO } from "@insurance/shared";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { formatRelative } from "../lib/format";
import { useToast } from "./ui/Toast";
import { cn } from "./ui/cn";

const POLL_MS = 20_000;

// In-app notifications. Polls (only while the tab is visible) rather than
// holding a socket open, which works across any number of API instances and
// through the Next.js /api proxy. New arrivals since the last poll pop a toast,
// which is the "live" alert agents get when an applicant uploads a document.
export function NotificationBell() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationListResponseDTO | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!accessToken || document.visibilityState !== "visible") return;
    try {
      const res = await apiFetch<NotificationListResponseDTO>("/api/notifications?limit=15", { accessToken });
      // The first load establishes a baseline; only later arrivals toast.
      if (seen.current) {
        const fresh = res.notifications.filter((n) => !n.readAt && !seen.current!.has(n.id));
        for (const n of fresh.slice(0, 3).reverse()) {
          toast.info(n.title, n.body ?? undefined, n.link ? { label: "Open", onClick: () => router.push(n.link!) } : undefined);
        }
      }
      seen.current = new Set(res.notifications.map((n) => n.id));
      setData(res);
    } catch {
      // A failed poll is silent; the next one will try again.
    }
  }, [accessToken, router, toast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const onVisible = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openNotification(n: NotificationDTO) {
    setOpen(false);
    if (!n.readAt && accessToken) {
      setData((d) =>
        d && {
          unreadCount: Math.max(0, d.unreadCount - 1),
          notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
        },
      );
      await apiFetch(`/api/notifications/${n.id}/read`, { method: "POST", accessToken }).catch(() => undefined);
    }
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    if (!accessToken) return;
    await apiFetch("/api/notifications/read-all", { method: "POST", accessToken }).catch(() => undefined);
    setData((d) => d && { unreadCount: 0, notifications: d.notifications.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) });
  }

  const unread = data?.unreadCount ?? 0;
  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-onaccent">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-pop-in overflow-hidden rounded-xl border border-gray-200 bg-white shadow-overlay">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="inline-flex items-center gap-1 text-xs font-medium text-primary-navy hover:underline">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
              </button>
            )}
          </div>
          {!data || data.notifications.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-500">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
              {data.notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cn("flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50", !n.readAt && "bg-blue-50/40")}
                  >
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary-navy")} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-sm text-gray-500">{n.body}</span>}
                      <span className="mt-1 block text-xs text-gray-400">{formatRelative(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
