// Guest has no account and therefore no row/role value — it's the absence of a session.
export const ROLES = ["USER", "AGENT", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ADMIN_ROLES = ["SUPER", "OPERATIONS", "COMPLIANCE", "FINANCE"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function portalPathForRole(role: Role): string {
  switch (role) {
    case "USER":
      return "/account";
    case "AGENT":
      return "/agent";
    case "ADMIN":
      return "/admin";
  }
}
