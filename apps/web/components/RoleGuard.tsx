"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@insurance/shared";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../lib/auth-context";
import { LoadingState } from "./ui/States";

// This is a UX-level guard only (it avoids flashing protected UI at the wrong
// role). The real authorization boundary is the Express API's requireAuth /
// requireRole middleware, which verifies the JWT signature server-side.
export function RoleGuard({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (user.role !== role) {
      router.replace(portalPathForRole(user.role));
    }
  }, [loading, user, role, router]);

  if (loading || !user || user.role !== role) {
    return <LoadingState className="min-h-screen" />;
  }

  return <>{children}</>;
}
