"use client";

import { useState } from "react";
import { US_STATES } from "@insurance/shared";
import { cn } from "../../ui/cn";

// Toggle-chip grid of states with a quick filter.
export function RegionPicker({ value, onChange, invalid }: { value: string[]; onChange: (v: string[]) => void; invalid?: boolean }) {
  const [filter, setFilter] = useState("");
  const shown = US_STATES.filter((s) => s.includes(filter.trim().toUpperCase()));
  const toggle = (s: string) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s].sort());
  return (
    <div className={cn("rounded-lg border p-3", invalid ? "border-red-500" : "border-gray-300")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter states"
          aria-label="Filter states"
          className="w-28 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs focus:border-primary-navy focus:outline-none"
        />
        <span className="text-xs text-gray-500">
          {value.length} selected
          {value.length > 0 && (
            <button type="button" className="ml-2 font-medium text-primary-navy hover:underline" onClick={() => onChange([])}>
              Clear
            </button>
          )}
        </span>
      </div>
      <div className="grid max-h-40 grid-cols-6 gap-1 overflow-y-auto sm:grid-cols-9" role="group" aria-label="Licensed states">
        {shown.map((s) => {
          const on = value.includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s)}
              className={cn(
                "rounded-md py-1 text-xs font-medium transition-colors",
                on ? "bg-primary-navy text-onaccent" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RegionChips({ regions, max = 6 }: { regions: string[]; max?: number }) {
  if (regions.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {regions.slice(0, max).map((r) => (
        <span key={r} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
          {r}
        </span>
      ))}
      {regions.length > max && <span className="text-xs text-gray-500">+{regions.length - max}</span>}
    </span>
  );
}
