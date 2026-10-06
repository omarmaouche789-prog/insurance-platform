import type { ReactNode } from "react";
import { RoleGuard } from "../../components/RoleGuard";
import { PortalHeader } from "../../components/PortalHeader";
import { AccountNav } from "../../components/account/AccountNav";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard role="USER">
      <PortalHeader portal="account" />
      <AccountNav />
      <main>{children}</main>
    </RoleGuard>
  );
}
