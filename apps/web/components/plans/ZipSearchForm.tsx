"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { cn } from "../ui/cn";

// ZIP search. "hero" is the large version on the home page.
export function ZipSearchForm({
  initialZip = "",
  size = "md",
  submitLabel = "Find plans",
  inputId,
}: {
  initialZip?: string;
  size?: "md" | "hero";
  submitLabel?: string;
  inputId?: string;
}) {
  const router = useRouter();
  const [zip, setZip] = useState(initialZip);
  const valid = /^\d{5}$/.test(zip);
  const hero = size === "hero";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valid) router.push(`/plans?zip=${zip}`);
  }

  return (
    <form onSubmit={handleSubmit} className={cn("flex gap-2", hero && "flex-col sm:flex-row")}>
      <div className="relative">
        <MapPin className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400", hero ? "h-5 w-5" : "h-4 w-4")} aria-hidden />
        <input
          id={inputId}
          className={cn(
            "w-full border border-gray-300 bg-white text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-primary-navy focus:outline-none focus:ring-2 focus:ring-primary-navy/30",
            hero ? "h-14 rounded-full pl-10 pr-5 text-lg sm:w-48" : "h-10 w-40 rounded-lg pl-9 pr-3 text-sm",
          )}
          placeholder="ZIP code"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
          aria-label="ZIP code"
          required
        />
      </div>
      <button
        type="submit"
        disabled={!valid}
        className={cn(
          "inline-flex items-center justify-center gap-2 bg-primary-orange font-semibold text-[#111827] shadow-sm transition-colors hover:bg-[#f0551c] disabled:cursor-not-allowed disabled:opacity-60",
          hero ? "h-14 rounded-full px-8 text-lg" : "h-10 rounded-lg px-4 text-sm",
        )}
      >
        {submitLabel}
        {hero && <ArrowRight className="h-5 w-5" aria-hidden />}
      </button>
    </form>
  );
}
