import type { ReactNode } from "react";

// Centered card used by login, 2FA, forgot- and reset-password screens.
export function AuthCard({ title, description, icon, children, footer }: { title: string; description?: ReactNode; icon?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-57px)] items-start justify-center px-4 py-12 sm:items-center">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card sm:p-8">
          {icon && <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{icon}</div>}
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
          {description && <p className="mt-1.5 text-sm text-gray-500">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-gray-500">{footer}</div>}
      </div>
    </div>
  );
}
