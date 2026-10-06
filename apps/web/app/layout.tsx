import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context";
import { THEME_INIT_SCRIPT } from "../lib/theme";
import { ToastProvider } from "../components/ui/Toast";
import { MaintenanceGate } from "../components/MaintenanceGate";
import { LOCALE_INIT_SCRIPT } from "../lib/i18n/locale";
import { LocaleProvider } from "../lib/i18n/LocaleProvider";

export const metadata: Metadata = {
  // Resolves relative Open Graph image URLs (blog featured images).
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: "Insurance Marketplace", template: "%s · Insurance Marketplace" },
  description: "Compare and enroll in health insurance plans by ZIP code.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9fafb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d16" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme and language scripts set the "dark" class and lang/dir
    // before hydration, so the server-rendered attributes intentionally differ.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-gray-50 font-sans text-gray-900">
        <AuthProvider>
          <LocaleProvider>
            <ToastProvider>
              <MaintenanceGate>{children}</MaintenanceGate>
            </ToastProvider>
          </LocaleProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
