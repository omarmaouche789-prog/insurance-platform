"use client";

import type { ReactNode } from "react";
import { Bell, CalendarClock, FolderOpen, Mail, Settings, ShieldCheck, TrendingUp } from "lucide-react";
import type { SidebarItem } from "../CollapsibleSidebar";
import { PortalShell } from "../PortalShell";

const ITEMS: SidebarItem[] = [
  { href: "/agent/applications", label: "Applications", icon: FolderOpen },
  { href: "/agent/messages", label: "Messages", icon: Mail },
  { href: "/agent/notifications", label: "Notifications", icon: Bell },
  { href: "/agent/follow-ups", label: "Follow-ups", icon: CalendarClock },
  { href: "/agent/performance", label: "Performance", icon: TrendingUp },
  { href: "/agent/settings", label: "Settings", icon: Settings },
  { href: "/agent/security", label: "Security", icon: ShieldCheck },
];

export function AgentShell({ children }: { children: ReactNode }) {
  return (
    <PortalShell role="AGENT" title="Agent Portal" items={ITEMS}>
      {children}
    </PortalShell>
  );
}
