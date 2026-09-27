"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth-context";

export function PortalHeader({ title }: { title: string }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <div>
        <p className="font-semibold">{title}</p>
        {user && (
          <p className="text-sm text-gray-500">
            {user.firstName} {user.lastName} · {user.email}
          </p>
        )}
      </div>
      <button onClick={handleLogout} className="text-sm text-gray-600 hover:underline">
        Log out
      </button>
    </header>
  );
}
