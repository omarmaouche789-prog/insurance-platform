"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { BrandMark } from "./PortalHeader";
import { cn } from "./ui/cn";

export interface SidebarLink {
  href: string;
  label: string;
  icon: LucideIcon;
  // Path prefix that marks the link active (defaults to href).
  match?: string;
  exact?: boolean;
}

export interface SidebarGroup {
  label: string;
  icon: LucideIcon;
  children: SidebarLink[];
}

export type SidebarItem = SidebarLink | SidebarGroup;

const isGroup = (item: SidebarItem): item is SidebarGroup => "children" in item;

// Most specific match wins, so /admin/users/123 lights up "Users" and not a
// broader prefix.
function activeHref(links: SidebarLink[], pathname: string): string | null {
  const hits = links.filter((l) => {
    const m = l.match ?? l.href;
    return l.exact ? pathname === m : pathname === m || pathname.startsWith(`${m}/`);
  });
  hits.sort((a, b) => (b.match ?? b.href).length - (a.match ?? a.href).length);
  return hits[0]?.href ?? null;
}

// Fixed colors: the sidebar is navy in both themes, so it can't use the gray
// scale (which flips in dark mode).
const ITEM = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const IDLE = "text-[#cbd5e1] hover:bg-[#ffffff14] hover:text-[#ffffff]";
const ACTIVE = "bg-primary-orange text-[#111827] shadow-sm";

function readCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

// Navy sidebar for the portals. On large screens it sits beside the page and
// collapses to icons (remembered per portal); on smaller screens it opens as
// a drawer from the header's menu button.
export function CollapsibleSidebar({
  items,
  label,
  storageKey,
  homeHref,
  mobileOpen,
  onMobileClose,
}: {
  items: SidebarItem[];
  label: string;
  storageKey: string;
  homeHref: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const allLinks = items.flatMap((i) => (isGroup(i) ? i.children : [i]));
  const active = activeHref(allLinks, pathname);
  // Groups start open when they contain the current page.
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(items.filter((i) => isGroup(i) && i.children.some((c) => c.href === active)).map((i) => i.label)),
  );

  useEffect(() => setCollapsed(readCollapsed(storageKey)), [storageKey]);

  // Navigating closes the mobile drawer.
  useEffect(() => {
    onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onMobileClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(storageKey, c ? "0" : "1");
      } catch {
        // Not remembered in private mode; still works for this visit.
      }
      return !c;
    });
  }

  function toggleGroup(name: string) {
    setOpenGroups((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // The drawer is always full width; only the desktop sidebar collapses.
  const renderNav = (narrow: boolean) => (
    <nav aria-label={label} className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {items.map((item) => {
        if (!isGroup(item)) return <NavLink key={item.href} link={item} active={item.href === active} narrow={narrow} />;
        // Collapsed: a group's pages are shown as plain icons.
        if (narrow) return item.children.map((c) => <NavLink key={c.href} link={c} active={c.href === active} narrow />);
        const open = openGroups.has(item.label);
        const containsActive = item.children.some((c) => c.href === active);
        const Icon = item.icon;
        return (
          <div key={item.label}>
            <button
              type="button"
              onClick={() => toggleGroup(item.label)}
              aria-expanded={open}
              className={cn(ITEM, IDLE, containsActive && !open && "text-[#ffffff]")}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="flex-1 truncate text-left">{item.label}</span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            {open && (
              <div className="ml-5 mt-1 space-y-1 border-l border-[#ffffff26] pl-3">
                {item.children.map((c) => (
                  <NavLink key={c.href} link={c} active={c.href === active} narrow={false} small />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col bg-primary-navy transition-[width] duration-200 dark:bg-[#132a47] lg:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className={cn("flex h-14 items-center border-b border-[#ffffff1f]", collapsed ? "justify-center px-2" : "px-5")}>
          <Link href={homeHref} aria-label="Portal home" className="min-w-0">
            <BrandMark onDark iconOnly={collapsed} alwaysShowName />
          </Link>
        </div>
        {renderNav(collapsed)}
        <div className="border-t border-[#ffffff1f] p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(ITEM, IDLE, collapsed && "justify-center")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-5 w-5" aria-hidden /> : <ChevronsLeft className="h-5 w-5" aria-hidden />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={label}>
          <button type="button" className="absolute inset-0 bg-[#0b1220]/50" aria-label="Close navigation" onClick={onMobileClose} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-pop-in flex-col bg-primary-navy shadow-overlay dark:bg-[#132a47]">
            <div className="flex h-14 items-center justify-between border-b border-[#ffffff1f] px-5">
              <Link href={homeHref} aria-label="Portal home" className="min-w-0">
                <BrandMark onDark alwaysShowName />
              </Link>
              <button type="button" onClick={onMobileClose} className={cn("-mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg", IDLE)} aria-label="Close navigation">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {renderNav(false)}
          </aside>
        </div>
      )}
    </>
  );
}

function NavLink({ link, active, narrow, small = false }: { link: SidebarLink; active: boolean; narrow: boolean; small?: boolean }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      title={narrow ? link.label : undefined}
      aria-label={narrow ? link.label : undefined}
      className={cn(ITEM, active ? ACTIVE : IDLE, narrow && "justify-center px-0", small && "py-1.5")}
    >
      <Icon className={small ? "h-4 w-4 shrink-0" : "h-5 w-5 shrink-0"} aria-hidden />
      {!narrow && <span className="truncate">{link.label}</span>}
    </Link>
  );
}
