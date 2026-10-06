"use client";

import { FileText, Search, ShieldCheck } from "lucide-react";
import { PortalNav, type PortalLink } from "../PortalNav";

const LINKS: PortalLink[] = [
  // Prefix match, so it stays active on /account/applications/:id and the
  // enrollment wizard; the more specific Security link wins on its own page.
  { href: "/account", label: "My applications", icon: FileText },
  { href: "/plans", label: "Find plans", icon: Search },
  { href: "/account/security", label: "Security", icon: ShieldCheck },
];

export function AccountNav() {
  return <PortalNav links={LINKS} label="My account" />;
}
