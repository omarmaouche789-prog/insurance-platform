"use client";

import type { ReactNode } from "react";
import { BarChart3, Briefcase, FileCheck2, Mail, MessageSquare, Newspaper, Settings, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { useSiteSettings } from "../../lib/site-settings";
import type { SidebarItem } from "../CollapsibleSidebar";
import { PortalShell } from "../PortalShell";

// Admin portal shell. Sections switched off in System settings drop out of
// the menu.
export function AdminShell({ children }: { children: ReactNode }) {
  const { features } = useSiteSettings().status;
  const items: SidebarItem[] = [
    ...(features.analytics ? [{ href: "/admin/analytics", label: "Analytics", icon: BarChart3 }] : []),
    { href: "/admin/applications/pending", label: "Applications", icon: FileCheck2, match: "/admin/applications" },
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/agents", label: "Agents", icon: Briefcase },
    ...(features.blog ? [{ href: "/admin/cms", label: "Blog", icon: Newspaper }] : []),
    { href: "/admin/messages", label: "Messages", icon: MessageSquare },
    { href: "/admin/security", label: "Security", icon: ShieldCheck },
    {
      label: "Settings",
      icon: Settings,
      children: [
        { href: "/admin/settings", label: "System Settings", icon: SlidersHorizontal },
        { href: "/admin/notifications", label: "Notifications", icon: Mail },
      ],
    },
  ];
  return (
    <PortalShell role="ADMIN" title="Admin Portal" items={items}>
      {children}
    </PortalShell>
  );
}
