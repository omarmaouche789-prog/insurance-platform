"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LayoutDashboard, LogOut, Menu, ShieldCheck, ShieldPlus } from "lucide-react";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../lib/auth-context";
import { useSiteSettings } from "../lib/site-settings";
import { Avatar } from "./ui/Avatar";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";

// Platform name and logo from System Settings → General. Falls back to the
// built-in mark when there's no logo or it fails to load.
// onDark: for the navy header and sidebar. iconOnly: collapsed sidebar.
export function BrandMark({ onDark = false, iconOnly = false, alwaysShowName = false }: { onDark?: boolean; iconOnly?: boolean; alwaysShowName?: boolean }) {
  const { platformName, logoUrl } = useSiteSettings().status.general;
  const [broken, setBroken] = useState<string | null>(null);
  const showLogo = Boolean(logoUrl) && broken !== logoUrl;
  return (
    <span className={`inline-flex min-w-0 items-center gap-2 font-semibold tracking-tight ${onDark ? "text-[#ffffff]" : "text-gray-900"}`}>
      {showLogo ? (
        // Admin-supplied URL on any host, so next/image's allow-list doesn't fit.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className={iconOnly ? "h-7 w-7 object-contain" : "h-7 max-w-[120px] object-contain"} onError={() => setBroken(logoUrl)} />
      ) : (
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${onDark ? "bg-primary-orange text-[#111827]" : "bg-primary-navy text-onaccent"}`}
        >
          <ShieldPlus className="h-4 w-4" aria-hidden />
        </span>
      )}
      {!iconOnly && <span className={alwaysShowName ? "truncate" : "hidden truncate sm:inline"}>{platformName}</span>}
    </span>
  );
}

// Avatar dropdown (security settings, log out). Shared by the portal header
// and the public site header, so a signed-in user has the same menu on
// every page.
export function UserMenu({ onDark = false }: { onDark?: boolean }) {
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
        className={`flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors ${onDark ? "hover:bg-[#ffffff1a]" : "hover:bg-gray-100"}`}
        aria-expanded={menuOpen}
        aria-haspopup="true"
        aria-label="Account menu"
      >
        <Avatar firstName={user.firstName} lastName={user.lastName} size="sm" />
        <span className={`hidden text-sm font-medium md:inline ${onDark ? "text-[#ffffff]" : "text-gray-700"}`}>{user.firstName}</span>
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

// Top bar inside the portals. The brand lives in the sidebar; on small
// screens the menu button opens the sidebar as a drawer.
export function PortalHeader({ title, onMenu }: { title: string; onMenu?: () => void }) {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {onMenu && (
            <button
              type="button"
              onClick={onMenu}
              className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
          )}
          <p className="truncate text-lg font-semibold tracking-tight text-primary-navy dark:text-[#9fbbe0]">{title}</p>
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
