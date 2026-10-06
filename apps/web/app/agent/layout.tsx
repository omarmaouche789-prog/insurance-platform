import type { ReactNode } from "react";
import { RoleGuard } from "../../components/RoleGuard";
import { PortalHeader } from "../../components/PortalHeader";
import { AgentNav } from "../../components/agent/AgentNav";

export default function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="AGENT">
      <PortalHeader portal="agent" />
      <AgentNav />
      <main>{children}</main>
    </RoleGuard>
  );
}
