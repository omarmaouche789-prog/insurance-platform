import type { AdminRole, Role, UserStatus } from "@insurance/shared";
import { Badge } from "../../ui/Badge";

export function RoleBadge({ role, adminRole }: { role: Role; adminRole: AdminRole | null }) {
  if (role === "ADMIN") return <Badge tone="violet">Admin{adminRole ? ` · ${adminRole.charAt(0)}${adminRole.slice(1).toLowerCase()}` : ""}</Badge>;
  if (role === "AGENT") return <Badge tone="blue">Agent</Badge>;
  return <Badge tone="gray">User</Badge>;
}

export function StatusBadge({ status }: { status: UserStatus }) {
  if (status === "ACTIVE") return <Badge tone="green" dot>Active</Badge>;
  if (status === "SUSPENDED") return <Badge tone="amber" dot>Suspended</Badge>;
  return <Badge tone="red" dot>Deleted</Badge>;
}
