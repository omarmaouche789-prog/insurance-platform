"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LayoutDashboard, LogOut, ShieldCheck, ShieldPlus } from "lucide-react";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../lib/auth-context";
import { Avatar } from "./ui/Avatar";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";

export function BrandMark() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight text-gray-900">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-navy text-onaccent">
        <ShieldPlus className="h-4 w-4" aria-hidden />
      </span>
      <span className="hidden sm:inline">Insurance Marketplace</span>
    </span>
  );
}

// Avatar dropdown (security settings, log out). Shared by the portal header
// and the public site header, so a signed-in user has the same menu on
// every page.
export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && setMenuOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  if (!user) return null;
  const home = portalPathForRole(user.role);

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="relative ml-1" ref={menu}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors hover:bg-gray-100"
        aria-expanded={menuOpen}
        aria-haspopup="true"
        aria-label="Account menu"
      >
        <Avatar firstName={user.firstName} lastName={user.lastName} size="sm" />
        <span className="hidden text-sm font-medium text-gray-700 md:inline">{user.firstName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" aria-hidden />
      </button>
      {menuOpen && (
        <div className="absolute right-0 z-40 mt-2 w-64 animate-pop-in overflow-hidden rounded-xl border border-gray-200 bg-white shadow-overlay">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="truncate text-sm font-medium text-gray-900">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-gray-500">{user.email}</p>
          </div>
          <Link href={home} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            <LayoutDashboard className="h-4 w-4 text-gray-400" aria-hidden />
            {user.role === "USER" ? "My account" : user.role === "AGENT" ? "Agent portal" : "Admin portal"}
          </Link>
          <Link href={`${home}/security`} onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            <ShieldCheck className="h-4 w-4 text-gray-400" aria-hidden />
            Security
            {!user.twoFactorEnabled && <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">2FA off</span>}
          </Link>
          <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
            <LogOut className="h-4 w-4 text-gray-400" aria-hidden />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function PortalHeader({ title }: { title: string }) {
  const { user } = useAuth();
  const home = user ? portalPathForRole(user.role) : "/";
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={home} aria-label="Portal home">
            <BrandMark />
          </Link>
          <span className="hidden h-5 w-px bg-gray-200 sm:block" aria-hidden />
          <span className="truncate text-sm font-medium text-gray-500">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {user && <NotificationBell />}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
