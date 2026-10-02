"use client";

import { CalendarClock, FolderOpen, ShieldCheck, TrendingUp } from "lucide-react";
import { PortalNav, type PortalLink } from "../PortalNav";

const LINKS: PortalLink[] = [
  { href: "/agent/applications", label: "Applications", icon: FolderOpen },
  { href: "/agent/follow-ups", label: "Follow-ups", icon: CalendarClock },
  { href: "/agent/performance", label: "Performance", icon: TrendingUp },
  { href: "/agent/security", label: "Security", icon: ShieldCheck },
];

export function AgentNav() {
  return <PortalNav links={LINKS} label="Agent portal" />;
}
