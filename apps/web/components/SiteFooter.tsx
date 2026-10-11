"use client";

import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { useSiteSettings } from "../lib/site-settings";
import { BrandMark } from "./PortalHeader";

// Fixed light colors on navy (the gray scale flips in dark mode).
const HEADING = "mb-4 text-sm font-semibold uppercase tracking-wide text-[#ffffff]";
const LINK = "text-[#c7d3e3] transition-colors hover:text-primary-orange";

// Public site footer. Company and support details come from System
// settings → General; every link goes to a real page.
export function SiteFooter() {
  const { status } = useSiteSettings();
  const { companyName, supportEmail, supportPhone } = status.general;
  return (
    <footer className="mt-16 bg-primary-navy dark:bg-[#132a47]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <BrandMark onDark alwaysShowName />
          <p className="mt-4 text-sm text-[#c7d3e3]">Making health insurance simple to compare and easy to enroll in.</p>
        </div>
        <div>
          <h2 className={HEADING}>Plans</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/plans" className={LINK}>
                Find plans by ZIP
              </Link>
            </li>
            <li>
              <Link href="/#plan-types" className={LINK}>
                Plan types
              </Link>
            </li>
            <li>
              <Link href="/#why-us" className={LINK}>
                Why choose us
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className={HEADING}>Account</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/login" className={LINK}>
                Log in
              </Link>
            </li>
            <li>
              <Link href="/register" className={LINK}>
                Create an account
              </Link>
            </li>
            {status.features.blog && (
              <li>
                <Link href="/blog" className={LINK}>
                  Learn: insurance guides
                </Link>
              </li>
            )}
          </ul>
        </div>
        <div>
          <h2 className={HEADING}>Support</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <a href={`mailto:${supportEmail}`} className={`inline-flex items-center gap-2 ${LINK}`}>
                <Mail className="h-4 w-4" aria-hidden />
                {supportEmail}
              </a>
            </li>
            <li>
              <a href={`tel:${supportPhone.replace(/[^\d+]/g, "")}`} className={`inline-flex items-center gap-2 ${LINK}`}>
                <Phone className="h-4 w-4" aria-hidden />
                {supportPhone}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[#ffffff1f]">
        <p className="mx-auto max-w-7xl px-4 py-6 text-center text-sm text-[#c7d3e3] sm:px-6">
          © {new Date().getFullYear()} {companyName.replace(/\.+$/, "")}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
