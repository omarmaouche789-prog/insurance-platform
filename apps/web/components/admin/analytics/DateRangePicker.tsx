"use client";

import { CalendarDays } from "lucide-react";
import { toDateInput } from "../../../lib/format";
import { cn } from "../../ui/cn";

export interface DateRange {
  from: string;
  to: string;
}

const PRESETS: Array<{ label: string; days: number }> = [
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "6M", days: 182 },
  { label: "12M", days: 365 },
];

export function presetRange(days: number, now = new Date()): DateRange {
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  return { from: toDateInput(from), to: toDateInput(now) };
}

// Preset chips plus explicit from/to dates. The API treats both ends as
// inclusive calendar days.
export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const today = toDateInput(new Date());
  const activePreset = PRESETS.find((p) => {
    const r = presetRange(p.days);
    return r.from === value.from && r.to === value.to;
  });
  const input =
    "rounded-md border-0 bg-transparent px-1 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg bg-gray-100 p-1" role="group" aria-label="Date range presets">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={activePreset === p}
            onClick={() => onChange(presetRange(p.days))}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              activePreset === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 shadow-sm">
        <CalendarDays className="h-4 w-4 text-gray-400" aria-hidden />
        <input type="date" aria-label="From" className={input} value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
        <span className="text-gray-400">–</span>
        <input type="date" aria-label="To" className={input} value={value.to} min={value.from} max={today} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
      </div>
    </div>
  );
}
