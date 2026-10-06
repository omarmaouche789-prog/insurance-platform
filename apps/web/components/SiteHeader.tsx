"use client";

import Link from "next/link";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../lib/auth-context";
import { AccountNav } from "./account/AccountNav";
import { NotificationBell } from "./NotificationBell";
import { BrandMark, UserMenu } from "./PortalHeader";
import { ThemeToggle } from "./ThemeToggle";

const link = "rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900";

// Header for the public pages (home, plans, compare, blog). It follows the
// session: a signed-in user keeps their account menu here — and applicants
// keep their account tabs — instead of seeing "Log in", which made browsing
// plans look like being signed out.
export function SiteHeader() {
  const { user, loading } = useAuth();

  return (
    <div className="sticky top-0 z-30">
      <header className="border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={user ? portalPathForRole(user.role) : "/"} aria-label="Insurance Marketplace home">
            <BrandMark />
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2" aria-label="Main">
            {/* Applicants get these as tabs below instead. */}
            {user?.role !== "USER" && (
              <>
                <Link href="/plans" className={link}>
                  Find plans
                </Link>
                <Link href="/blog" className={link}>
                  Learn
                </Link>
              </>
            )}
            {user ? (
              <>
                {user.role !== "USER" && (
                  <Link href={portalPathForRole(user.role)} className={link}>
                    {user.role === "AGENT" ? "Agent portal" : "Admin portal"}
                  </Link>
                )}
                <ThemeToggle />
                <NotificationBell />
                <UserMenu />
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
                    <Link href="/register" className="hidden rounded-lg bg-gray-900 px-3 py-1.5 font-medium text-white hover:bg-gray-800 sm:inline-block">
                      Get started
                    </Link>
                  </>
                )}
                <ThemeToggle />
              </>
            )}
          </nav>
        </div>
      </header>
      {user?.role === "USER" && <AccountNav />}
    </div>
  );
}
