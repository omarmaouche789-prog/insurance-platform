"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "./ui/cn";

export interface PortalLink {
  href: string;
  label: string;
  icon: LucideIcon;
  // Path prefix that marks the link active (defaults to href).
  match?: string;
  exact?: boolean;
}

// Horizontal, scrollable tab nav under the header. Most specific match wins,
// so /admin/users/123 lights up "Users" and not a broader prefix.
export function PortalNav({ links, label }: { links: PortalLink[]; label: string }) {
  const pathname = usePathname();
  const active = links
    .filter((l) => {
      const m = l.match ?? l.href;
      return l.exact ? pathname === m : pathname === m || pathname.startsWith(`${m}/`);
    })
    .sort((a, b) => (b.match ?? b.href).length - (a.match ?? a.href).length)[0];

  return (
    <nav aria-label={label} className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-4">
        {links.map((l) => {
          const isActive = l === active;
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors",
                isActive ? "border-primary-navy font-medium text-gray-900" : "border-transparent text-gray-500 hover:text-gray-900",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
