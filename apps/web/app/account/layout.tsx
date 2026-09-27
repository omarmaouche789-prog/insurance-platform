import type { ReactNode } from "react";
import { RoleGuard } from "../../components/RoleGuard";
import { PortalHeader } from "../../components/PortalHeader";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="USER">
      <PortalHeader title="My Account" />
      <main>{children}</main>
    </RoleGuard>
  );
}
