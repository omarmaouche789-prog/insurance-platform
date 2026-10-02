"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "./cn";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Half-hour slots across a working day, in the user's local time.
const TIME_SLOTS = Array.from({ length: 25 }, (_, i) => {
  const minutes = 7 * 60 + i * 30;
  return { h: Math.floor(minutes / 60), m: minutes % 60 };
});
const slotLabel = (h: number, m: number) =>
  new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function nextWeekday(from: Date, weekday: number): Date {
  const d = startOfDay(from);
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7 || 7));
  return d;
}

// Month grid + time slots + quick picks. Past days and past slots today are
// disabled; `value` is a local Date or null.
export function CalendarPicker({ value, onChange, maxDays = 365 }: { value: Date | null; onChange: (d: Date) => void; maxDays?: number }) {
  const now = new Date();
  const today = startOfDay(now);
  const lastDay = new Date(today.getTime() + maxDays * 86_400_000);
  const [month, setMonth] = useState(() => new Date((value ?? now).getFullYear(), (value ?? now).getMonth(), 1));

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday-first grid
    return Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i));
  }, [month]);

  const selectedDay = value ? startOfDay(value) : null;
  function pick(day: Date, h = value?.getHours() ?? 9, m = value?.getMinutes() ?? 0) {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
    // Picking today with a time already past rolls forward to the next free slot.
    if (d <= now) {
      const slot = TIME_SLOTS.find((s) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.h, s.m) > now);
      if (!slot) return;
      d.setHours(slot.h, slot.m);
    }
    onChange(d);
  }

  const quick = [
    { label: "In 2 hours", date: () => new Date(Math.ceil((now.getTime() + 2 * 3_600_000) / 1_800_000) * 1_800_000) },
    { label: "Tomorrow 9 AM", date: () => { const d = startOfDay(now); d.setDate(d.getDate() + 1); d.setHours(9); return d; } },
    { label: "In 3 days", date: () => { const d = startOfDay(now); d.setDate(d.getDate() + 3); d.setHours(10); return d; } },
    { label: "Next Monday", date: () => { const d = nextWeekday(now, 1); d.setHours(9); return d; } },
  ];

  const canPrev = new Date(month.getFullYear(), month.getMonth(), 0) >= today;
  const canNext = new Date(month.getFullYear(), month.getMonth() + 1, 1) <= lastDay;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => {
              const d = q.date();
              onChange(d);
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
            className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:border-indigo-400 hover:text-indigo-700"
          >
            {q.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-gray-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} disabled={!canPrev} className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-gray-900" aria-live="polite">
              {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} disabled={!canNext} className="rounded-md p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30" aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label="Choose a date">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-1 text-[11px] font-medium uppercase text-gray-400" role="columnheader">
                {d}
              </span>
            ))}
            {days.map((d) => {
              const outside = d.getMonth() !== month.getMonth();
              const disabled = d < today || d > lastDay;
              const selected = selectedDay && sameDay(d, selectedDay);
              const isToday = sameDay(d, today);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  role="gridcell"
                  aria-selected={Boolean(selected)}
                  aria-label={d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  disabled={disabled}
                  onClick={() => pick(d)}
                  className={cn(
                    "h-9 rounded-lg text-sm tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                    selected ? "bg-indigo-600 font-semibold text-onaccent" : "hover:bg-gray-100",
                    outside && !selected && "text-gray-400",
                    isToday && !selected && "font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-300",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        <div className="sm:w-32">
          <p className="mb-2 text-xs font-medium text-gray-500">Time</p>
          <div className="grid max-h-[284px] grid-cols-3 gap-1 overflow-y-auto sm:grid-cols-1" role="listbox" aria-label="Choose a time">
            {TIME_SLOTS.map((s) => {
              const day = selectedDay ?? today;
              const slotDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), s.h, s.m);
              const selected = value && value.getHours() === s.h && value.getMinutes() === s.m;
              return (
                <button
                  key={`${s.h}:${s.m}`}
                  type="button"
                  role="option"
                  aria-selected={Boolean(selected)}
                  disabled={slotDate <= now}
                  onClick={() => pick(day, s.h, s.m)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                    selected ? "bg-indigo-600 font-semibold text-onaccent" : "bg-gray-50 text-gray-700 hover:bg-gray-100",
                  )}
                >
                  {slotLabel(s.h, s.m)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
