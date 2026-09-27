import type { ReactNode } from "react";
import { RoleGuard } from "../../components/RoleGuard";
import { PortalHeader } from "../../components/PortalHeader";

export default function AgentLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="AGENT">
      <PortalHeader title="Agent Portal" />
      <main>{children}</main>
    </RoleGuard>
  );
}
