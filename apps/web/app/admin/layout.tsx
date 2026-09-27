import type { ReactNode } from "react";
import { RoleGuard } from "../../components/RoleGuard";
import { PortalHeader } from "../../components/PortalHeader";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="ADMIN">
      <PortalHeader title="Admin" />
      <main>{children}</main>
    </RoleGuard>
  );
}
