import Link from "next/link";
import type { ReactNode } from "react";

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <Link href="/" className="font-semibold">
          Insurance Marketplace
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/plans">Find plans</Link>
          <Link href="/login">Log in</Link>
          <Link href="/register">Register</Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
