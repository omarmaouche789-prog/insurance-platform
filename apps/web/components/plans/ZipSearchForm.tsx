"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

export function ZipSearchForm({ initialZip = "" }: { initialZip?: string }) {
  const router = useRouter();
  const { t } = useTranslation();
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
        placeholder={t("home.zipLabel")}
        inputMode="numeric"
        maxLength={5}
        value={zip}
        onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))}
        aria-label={t("home.zipLabel")}
        required
      />
      <button
        type="submit"
        disabled={!valid}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {t("home.findPlans")}
      </button>
    </form>
  );
}
