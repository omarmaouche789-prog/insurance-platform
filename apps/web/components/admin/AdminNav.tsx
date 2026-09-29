"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/applications/pending", label: "Applications", match: "/admin/applications" },
  { href: "/admin", label: "Users", match: "/admin" },
];

export function AdminNav() {
  const pathname = usePathname();
  // Most specific match wins, so /admin/applications doesn't also light up "Users".
  const active = LINKS.filter((l) => pathname === l.match || pathname.startsWith(`${l.match}/`)).sort(
    (a, b) => b.match.length - a.match.length,
  )[0];

  return (
    <nav className="flex gap-1 border-b border-gray-200 bg-white px-6 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`-mb-px border-b-2 px-3 py-2 ${
            l === active ? "border-gray-900 font-medium" : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
