"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Construction, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PublicStatusDTO } from "@insurance/shared";
import { useAuth } from "../lib/auth-context";
import { Button } from "./ui/Button";

const POLL_MS = 60_000;

// Pages that stay usable during maintenance so an admin can still sign in
// (the API keeps /api/auth/* open for the same reason).
const OPEN_PATHS = ["/login", "/forgot-password", "/reset-password"];

// Wraps the whole app. While maintenance mode is on, everyone but admins sees
// the admin's message instead of the page; admins get a banner. The API
// refuses non-admin requests on its own — this is just the friendly face of it.
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const pathname = usePathname();
  const [status, setStatus] = useState<PublicStatusDTO["maintenance"] | null>(null);

  const check = useCallback(() => {
    fetch("/api/status", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<PublicStatusDTO>) : null))
      .then((body) => {
        if (body) setStatus(body.maintenance);
      })
      // The API being unreachable isn't maintenance; keep the last answer.
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    check();
    const timer = window.setInterval(check, POLL_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  // Re-check on navigation so a page change right after maintenance starts
  // or ends picks it up without waiting for the next poll.
  useEffect(() => {
    check();
  }, [pathname, check]);

  const active = Boolean(status?.enabled);
  const isAdmin = user?.role === "ADMIN";
  const openPath = OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!active) return <>{children}</>;

  if (isAdmin) {
    return (
      <>
        <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-black" role="status">
          {t("maintenance.adminBanner")}{" "}
          <Link href="/admin/settings" className="underline underline-offset-2 hover:no-underline">
            {t("maintenance.manage")}
          </Link>
        </div>
        {children}
      </>
    );
  }

  // Wait for the session check so admins never see a flash of the lock screen.
  if (loading) return null;
  if (openPath) {
    return (
      <>
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900" role="status">
          {t("maintenance.signInBanner")}
        </div>
        {children}
      </>
    );
  }

  return <MaintenanceScreen message={status?.message ?? ""} onRetry={check} />;
}

function MaintenanceScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white px-8 py-10 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <Construction className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">{t("maintenance.title")}</h1>
        <p className="mx-auto mt-2 max-w-md whitespace-pre-line text-sm text-gray-600">{message}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={onRetry}>
            {t("maintenance.checkAgain")}
          </Button>
          <Link href="/login" className="text-sm font-medium text-gray-500 hover:text-gray-900">
            {t("maintenance.staffSignIn")}
          </Link>
        </div>
      </div>
    </main>
  );
}
