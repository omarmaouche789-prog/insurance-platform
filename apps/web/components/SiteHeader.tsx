"use client";

import Link from "next/link";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../lib/auth-context";
import { useSiteSettings } from "../lib/site-settings";
import { AccountNav } from "./account/AccountNav";
import { NotificationBell } from "./NotificationBell";
import { BrandMark, UserMenu } from "./PortalHeader";
import { ThemeToggle } from "./ThemeToggle";

// Fixed light colors on the navy bar (the gray scale flips in dark mode).
const link = "rounded-lg px-2.5 py-1.5 font-medium text-[#dbe4f0] transition-colors hover:text-primary-orange";

// Header for the public pages (home, plans, compare, blog). It follows the
// session: a signed-in user keeps their account menu here — and applicants
// keep their account tabs — instead of seeing "Log in", which made browsing
// plans look like being signed out.
export function SiteHeader() {
  const { user, loading } = useAuth();
  const { features } = useSiteSettings().status;

  return (
    <div className="sticky top-0 z-30">
      <header className="bg-primary-navy shadow-md dark:bg-[#132a47]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={user ? portalPathForRole(user.role) : "/"} aria-label="Insurance Marketplace home">
            <BrandMark onDark />
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2" aria-label="Main">
            {/* Applicants get these as tabs below instead. */}
            {user?.role !== "USER" && (
              <>
                <Link href="/plans" className={link}>
                  Find plans
                </Link>
                {features.blog && (
                  <Link href="/blog" className={link}>
                    Learn
                  </Link>
                )}
              </>
            )}
            {user ? (
              <>
                {user.role !== "USER" && (
                  <Link href={portalPathForRole(user.role)} className={link}>
                    {user.role === "AGENT" ? "Agent portal" : "Admin portal"}
                  </Link>
                )}
                <ThemeToggle onDark />
                <NotificationBell onDark />
                <UserMenu onDark />
              </>
            ) : (
              <>
                {/* While the session is still being restored, show neither
                    "Log in" nor the account menu, so nothing flickers. */}
                {!loading && (
                  <>
                    <Link href="/login" className={link}>
                      Log in
                    </Link>
                    <Link href="/register" className="hidden rounded-full bg-primary-orange px-4 py-2 font-semibold text-[#111827] shadow-sm transition-colors hover:bg-[#f0551c] sm:inline-block">
                      Get started
                    </Link>
                  </>
                )}
                <ThemeToggle onDark />
              </>
            )}
          </nav>
        </div>
      </header>
      {user?.role === "USER" && <AccountNav />}
    </div>
  );
}
