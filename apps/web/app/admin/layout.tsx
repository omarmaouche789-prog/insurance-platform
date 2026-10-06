import type { ReactNode } from "react";
import { RoleGuard } from "../../components/RoleGuard";
import { PortalHeader } from "../../components/PortalHeader";
import { AdminNav } from "../../components/admin/AdminNav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="ADMIN">
      <PortalHeader portal="admin" />
      <AdminNav />
      <main>{children}</main>
    </RoleGuard>
  );
}
