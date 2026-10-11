"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import type { Role } from "@insurance/shared";
import { portalPathForRole } from "@insurance/shared";
import { CollapsibleSidebar, type SidebarItem } from "./CollapsibleSidebar";
import { PortalHeader } from "./PortalHeader";
import { RoleGuard } from "./RoleGuard";

// Layout shared by the account, agent and admin portals: role guard, navy
// collapsible sidebar, and the top bar (notifications, theme, account menu).
export function PortalShell({
  role,
  title,
  items,
  children,
}: {
  role: Role;
  title: string;
  items: SidebarItem[];
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const close = useCallback(() => setDrawerOpen(false), []);
  return (
    <RoleGuard role={role}>
      <div className="flex min-h-screen">
        <CollapsibleSidebar
          items={items}
          label={`${title} navigation`}
          storageKey={`sidebar:${role.toLowerCase()}:collapsed`}
          homeHref={portalPathForRole(role)}
          mobileOpen={drawerOpen}
          onMobileClose={close}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <PortalHeader title={title} onMenu={() => setDrawerOpen(true)} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </RoleGuard>
  );
}
