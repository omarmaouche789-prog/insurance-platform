"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Construction, Mail, Phone, RefreshCw } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { useSiteSettings } from "../lib/site-settings";
import { Button } from "./ui/Button";

// How long a visitor waits before "Try again" re-checks. The page also
// re-checks on its own every minute and lifts the screen when maintenance ends.
const RETRY_AFTER_SECONDS = 120;

// Pages that stay usable during maintenance so an admin can still sign in
// (the API keeps /api/auth/* open for the same reason).
const OPEN_PATHS = ["/login", "/forgot-password", "/reset-password"];

// Wraps the whole app. While maintenance mode is on, everyone but admins sees
// the admin's message instead of the page; admins get a banner. The API
// refuses non-admin requests on its own — this is just the friendly face of it.
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { status, refresh } = useSiteSettings();

  const active = status.maintenance.enabled;
  const isAdmin = user?.role === "ADMIN";
  const openPath = OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!active) return <>{children}</>;

  if (isAdmin) {
    return (
      <>
        <div className="bg-primary-orange px-4 py-2 text-center text-sm font-medium text-black" role="status">
          Maintenance mode is on — only admins can use the platform.{" "}
          <Link href="/admin/settings?tab=maintenance" className="underline underline-offset-2 hover:no-underline">
            Manage in System settings
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
          The platform is under maintenance. Only administrators can sign in right now.
        </div>
        {children}
      </>
    );
  }

  return <MaintenanceOverlay message={status.maintenance.message} onRetry={refresh} />;
}

export function MaintenanceOverlay({ message, onRetry, preview = false }: { message: string; onRetry?: () => Promise<void>; preview?: boolean }) {
  const { status } = useSiteSettings();
  const { platformName, supportEmail, supportPhone } = status.general;
  const [secondsLeft, setSecondsLeft] = useState(RETRY_AFTER_SECONDS);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (preview || secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft, preview]);

  async function retry() {
    setChecking(true);
    await onRetry?.();
    setChecking(false);
    // Still under maintenance (this screen is still mounted): wait again.
    setSecondsLeft(RETRY_AFTER_SECONDS);
  }

  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div
      className={
        preview
          ? "flex min-h-[420px] items-center justify-center bg-gray-50 px-6 py-12"
          : "fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-gray-50 px-6 py-16"
      }
      role={preview ? undefined : "alertdialog"}
      aria-modal={preview ? undefined : true}
      aria-labelledby={preview ? undefined : "maintenance-title"}
      aria-describedby={preview ? undefined : "maintenance-message"}
    >
      <div className="w-full max-w-2xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <Construction className="h-8 w-8" aria-hidden />
        </div>
        <p className="text-sm font-medium uppercase tracking-wide text-gray-500">{platformName}</p>
        <h1 id="maintenance-title" className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          We&apos;ll be right back
        </h1>
        <p id="maintenance-message" className="mx-auto mt-5 max-w-xl whitespace-pre-line text-lg leading-relaxed text-gray-700 sm:text-xl">
          {message.trim() || <span className="italic text-gray-400">No message yet</span>}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Button
            variant="navy"
            icon={<RefreshCw className={checking ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />}
            disabled={preview || secondsLeft > 0 || checking}
            onClick={() => void retry()}
          >
            {secondsLeft > 0 && !preview ? `Try again in ${mm}:${ss}` : "Try again"}
          </Button>
          <p className="text-xs text-gray-500">This page also checks automatically every minute.</p>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
          <a href={`mailto:${supportEmail}`} className="inline-flex items-center gap-1.5 hover:text-gray-900">
            <Mail className="h-4 w-4" aria-hidden />
            {supportEmail}
          </a>
          <a href={`tel:${supportPhone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-gray-900">
            <Phone className="h-4 w-4" aria-hidden />
            {supportPhone}
          </a>
          {!preview && (
            <Link href="/login" className="hover:text-gray-900">
              Staff sign-in
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
