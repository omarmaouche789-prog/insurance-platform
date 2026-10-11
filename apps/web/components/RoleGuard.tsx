"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@insurance/shared";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../lib/auth-context";
import { useSiteSettings } from "../lib/site-settings";
import { LoadingState } from "./ui/States";

// This is a UX-level guard only (it avoids flashing protected UI at the wrong
// role). The real authorization boundary is the Express API's requireAuth /
// requireRole middleware, which verifies the JWT signature server-side.
export function RoleGuard({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSiteSettings();

  // System settings can require 2FA for admins and agents. Until they set it
  // up, the only page they can use is their security page (the API enforces
  // the same thing).
  const securityPath = `${portalPathForRole(role)}/security`;
  const mustEnroll =
    Boolean(user) && (role === "ADMIN" || role === "AGENT") && status.features.twoFactorRequired && !user?.twoFactorEnabled;
  const blockedByTwoFactor = mustEnroll && pathname !== securityPath;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (user.role !== role) {
      router.replace(portalPathForRole(user.role));
      return;
    }
    if (blockedByTwoFactor) router.replace(securityPath);
  }, [loading, user, role, router, blockedByTwoFactor, securityPath]);

  if (loading || !user || user.role !== role || blockedByTwoFactor) {
    return <LoadingState className="min-h-screen" />;
  }

  return <>{children}</>;
}
