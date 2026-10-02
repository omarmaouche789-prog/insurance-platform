import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "../../components/PortalHeader";
import { ThemeToggle } from "../../components/ThemeToggle";

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Insurance Marketplace home">
            <BrandMark />
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2" aria-label="Main">
            <Link href="/plans" className="rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
              Find plans
            </Link>
            <Link href="/blog" className="rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
              Learn
            </Link>
            <Link href="/login" className="rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900">
              Log in
            </Link>
            <Link href="/register" className="hidden rounded-lg bg-gray-900 px-3 py-1.5 font-medium text-white hover:bg-gray-800 sm:inline-block">
              Get started
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
