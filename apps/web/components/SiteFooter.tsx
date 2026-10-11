"use client";

import { Mail, Phone } from "lucide-react";
import { useSiteSettings } from "../lib/site-settings";

// Company and support details from System settings → General.
export function SiteFooter() {
  const { companyName, platformName, supportEmail, supportPhone } = useSiteSettings().status.general;
  return (
    <footer className="mt-16 border-t border-gray-200">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} {companyName} · {platformName}
        </p>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <a href={`mailto:${supportEmail}`} className="inline-flex items-center gap-1.5 hover:text-gray-900">
            <Mail className="h-4 w-4" aria-hidden />
            {supportEmail}
          </a>
          <a href={`tel:${supportPhone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-gray-900">
            <Phone className="h-4 w-4" aria-hidden />
            {supportPhone}
          </a>
        </p>
      </div>
    </footer>
  );
}
