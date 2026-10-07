"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ZipSearchForm({ initialZip = "" }: { initialZip?: string }) {
  const router = useRouter();
  const [zip, setZip] = useState(initialZip);
  const valid = /^\d{5}$/.test(zip);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valid) router.push(`/plans?zip=${zip}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        className="w-40 rounded border border-gray-300 px-3 py-2"
        placeholder="ZIP code"
        inputMode="numeric"
        maxLength={5}
        value={zip}
        onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
        aria-label="ZIP code"
        required
      />
      <button
        type="submit"
        disabled={!valid}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        Find plans
      </button>
    </form>
  );
}
