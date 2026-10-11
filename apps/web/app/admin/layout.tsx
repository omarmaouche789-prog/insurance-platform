import type { ReactNode } from "react";
import { AdminShell } from "../../components/admin/AdminNav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
