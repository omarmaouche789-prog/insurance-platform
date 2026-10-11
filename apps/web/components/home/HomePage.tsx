"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, CheckCircle2, HeartPulse, LockKeyhole, Phone, Pill, ShieldPlus, Stethoscope, Users } from "lucide-react";
import { portalPathForRole } from "@insurance/shared";
import { useAuth } from "../../lib/auth-context";
import { useSiteSettings } from "../../lib/site-settings";
import { ZipSearchForm } from "../plans/ZipSearchForm";

// Fixed colors inside the navy bands: the gray scale flips in dark mode.
const ON_NAVY_MUTED = "text-[#c7d3e3]";
const PILL = "inline-flex items-center justify-center gap-2 rounded-full px-8 py-3 text-lg font-semibold transition-colors";
const ORANGE_PILL = `${PILL} bg-primary-orange text-[#111827] shadow-sm hover:bg-[#f0551c]`;

const PLAN_TYPES = [
  {
    icon: HeartPulse,
    title: "Health Insurance Plans",
    description: "Comprehensive coverage with flexible options to fit your healthcare needs and budget.",
  },
  {
    icon: Stethoscope,
    title: "Supplemental Plans",
    description: "Fill the gaps in your coverage with additional protection and peace of mind.",
  },
  {
    icon: Pill,
    title: "Prescription Coverage",
    description: "Affordable medication coverage to keep your healthcare costs manageable.",
  },
];

const REASONS = [
  { icon: CheckCircle2, title: "Easy Comparison", desc: "Compare multiple plans side by side." },
  { icon: LockKeyhole, title: "Secure & Safe", desc: "Your data is protected and encrypted." },
  { icon: Users, title: "Expert Guidance", desc: "Licensed agents help you decide." },
  { icon: BadgeCheck, title: "Clear Pricing", desc: "Premiums, deductibles and copays up front." },
];

export function HomePage() {
  const { user } = useAuth();
  const { supportPhone, platformName } = useSiteSettings().status.general;
  const accountHref = user ? portalPathForRole(user.role) : "/login";

  return (
    // -mb-16 cancels the footer's top margin: the closing navy band runs into it.
    <div className="-mb-16">
      {/* Hero */}
      <section className="bg-gradient-to-b from-[#1e3a5f0d] to-transparent py-14 sm:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 md:grid-cols-2">
          <HeroIllustration />
          <div className="order-first md:order-none">
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-primary-navy dark:text-[#e2e8f0] sm:text-5xl">
              Find the Perfect Insurance Plan
            </h1>
            <p className="mt-5 text-lg text-gray-600 sm:text-xl">
              Compare, shop, and enroll in health insurance plans tailored to your needs. Get personalized help from licensed agents.
            </p>
            <div id="find" className="mt-8 scroll-mt-24">
              <label htmlFor="hero-zip" className="mb-2 block text-sm font-medium text-gray-700">
                Enter your ZIP code to see plans in your area
              </label>
              <ZipSearchForm size="hero" submitLabel="Compare Plans" inputId="hero-zip" />
              <p className="mt-3 text-sm text-gray-500">
                No account needed to browse. Try 90001, 10001 or 78701.{" "}
                <Link href={accountHref} className="font-medium text-primary-navy underline-offset-2 hover:underline dark:text-[#9fbbe0]">
                  {user ? "Go to your account" : "Sign in"}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Ready to find */}
      <section className="bg-primary-navy py-14 text-center dark:bg-[#132a47]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-[#ffffff] sm:text-4xl">Ready to find your plan?</h2>
          <p className={`mt-3 text-lg ${ON_NAVY_MUTED}`}>Compare, shop and enroll in the right insurance plan for you.</p>
          <a href="#find" className={`${ORANGE_PILL} mt-8`}>
            Compare Plans <ArrowRight className="h-5 w-5" aria-hidden />
          </a>
        </div>
      </section>

      {/* Plan types */}
      <section id="plan-types" className="bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-primary-navy dark:text-[#e2e8f0] sm:text-4xl">Our Plan Types</h2>
            <p className="mt-3 text-lg text-gray-600">Discover the right coverage for you and your family.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {PLAN_TYPES.map((p) => (
              <article key={p.title} className="flex flex-col rounded-2xl border-t-4 border-primary-orange bg-white p-8 shadow-card transition-shadow hover:shadow-overlay">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#ff6b351a] text-primary-orange">
                  <p.icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="text-xl font-bold text-primary-navy dark:text-[#e2e8f0]">{p.title}</h3>
                <p className="mt-3 flex-1 text-gray-600">{p.description}</p>
                <Link href="/plans" className={`${PILL} mt-6 w-full bg-primary-orange py-2.5 text-base text-[#111827] hover:bg-[#f0551c]`}>
                  Read More
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section id="why-us" className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="mb-12 text-center text-3xl font-bold text-primary-navy dark:text-[#e2e8f0] sm:text-4xl">Why Choose Us?</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {REASONS.map((r) => (
              <div key={r.title} className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#ff6b351a] text-primary-orange">
                  <r.icon className="h-8 w-8" aria-hidden />
                </div>
                <h3 className="text-lg font-bold text-primary-navy dark:text-[#e2e8f0]">{r.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="bg-primary-navy py-16 text-center dark:bg-[#132a47]">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold text-[#ffffff] sm:text-4xl">Start Your Journey Today</h2>
          <p className={`mt-4 text-lg ${ON_NAVY_MUTED}`}>Find, compare and enroll in coverage with {platformName}.</p>
          <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
            <Link href={user ? accountHref : "/register"} className={ORANGE_PILL}>
              {user ? "Go to your account" : "Get Started"} <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <a href={`tel:${supportPhone.replace(/[^\d+]/g, "")}`} className={`${PILL} border-2 border-[#ffffff] text-[#ffffff] hover:bg-[#ffffff] hover:text-primary-navy`}>
              <Phone className="h-5 w-5" aria-hidden /> Call Us: {supportPhone}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

// Decorative: a stylized plan comparison, so the hero needs no photo.
function HeroIllustration() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md">
      <div className="absolute -inset-4 rounded-[2rem] bg-primary-orange/15 blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl bg-primary-navy p-6 shadow-overlay dark:bg-[#132a47]">
        <div className="mb-5 flex items-center gap-2 text-[#ffffff]">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-orange text-[#111827]">
            <ShieldPlus className="h-4 w-4" />
          </span>
          <span className="font-semibold">Plans near you</span>
        </div>
        {[
          { tier: "Silver", width: "w-2/3", tag: "Best match" },
          { tier: "Gold", width: "w-1/2", tag: null },
          { tier: "Bronze", width: "w-3/4", tag: null },
        ].map((p, i) => (
          <div key={p.tier} className={`mb-3 rounded-2xl bg-[#ffffff] p-4 ${i === 0 ? "ring-2 ring-primary-orange" : "opacity-90"}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1e3a5f]">{p.tier} plan</span>
              {p.tag && <span className="rounded-full bg-primary-orange px-2 py-0.5 text-[10px] font-bold uppercase text-[#111827]">{p.tag}</span>}
            </div>
            <div className="mt-3 space-y-2">
              <div className={`h-2 rounded-full bg-[#e2e8f0] ${p.width}`} />
              <div className="h-2 w-1/3 rounded-full bg-[#e2e8f0]" />
            </div>
          </div>
        ))}
        <div className="mt-4 flex items-center gap-2 text-sm text-[#c7d3e3]">
          <CheckCircle2 className="h-4 w-4 text-primary-orange" /> Compare premiums, deductibles and copays
        </div>
      </div>
    </div>
  );
}
