"use client";

import { FileText, Search, ShieldCheck } from "lucide-react";
import { PortalNav, type PortalLink } from "../PortalNav";

const LINKS: PortalLink[] = [
  { href: "/account", label: "My applications", icon: FileText, exact: true, match: "/account" },
  { href: "/plans", label: "Find plans", icon: Search },
  { href: "/account/security", label: "Security", icon: ShieldCheck },
];

export function AccountNav() {
  return <PortalNav links={LINKS} label="My account" />;
}
