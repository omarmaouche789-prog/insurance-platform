"use client";

import { FileText, Search, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { PortalNav, type PortalLink } from "../PortalNav";
import { PortalShell } from "../PortalShell";

const LINKS: PortalLink[] = [
  // Prefix match, so it stays active on /account/applications/:id and the
  // enrollment wizard; the more specific Security link wins on its own page.
  { href: "/account", label: "My applications", icon: FileText },
  { href: "/plans", label: "Find plans", icon: Search },
  { href: "/account/security", label: "Security", icon: ShieldCheck },
];

// Tabs under the public header, so a signed-in applicant browsing plans
// keeps their account navigation.
export function AccountNav() {
  return <PortalNav links={LINKS} label="My account" />;
}

// The account portal itself uses the sidebar.
export function AccountShell({ children }: { children: ReactNode }) {
  return (
    <PortalShell role="USER" title="My Account" items={LINKS}>
      {children}
    </PortalShell>
  );
}
