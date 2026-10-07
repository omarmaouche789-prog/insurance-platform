"use client";

import { BarChart3, Briefcase, FileCheck2, Mail, Newspaper, Settings, ShieldCheck, Users } from "lucide-react";
import { PortalNav, type PortalLink } from "../PortalNav";

const LINKS: PortalLink[] = [
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/applications/pending", label: "Applications", icon: FileCheck2, match: "/admin/applications" },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/agents", label: "Agents", icon: Briefcase },
  { href: "/admin/cms", label: "Blog", icon: Newspaper },
  { href: "/admin/notifications", label: "Notifications", icon: Mail },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/security", label: "Security", icon: ShieldCheck },
];

export function AdminNav() {
  return <PortalNav links={LINKS} label="Admin" />;
}
