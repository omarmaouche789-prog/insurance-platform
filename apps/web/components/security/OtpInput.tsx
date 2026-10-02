"use client";

import { useRef } from "react";
import { cn } from "../ui/cn";

const LENGTH = 6;

// Six single-digit boxes that behave like one field: typing advances,
// backspace goes back, and pasting a full code fills every box.
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus,
  label = "Verification code",
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");

  function set(next: string) {
    const clean = next.replace(/\D/g, "").slice(0, LENGTH);
    onChange(clean);
    if (clean.length === LENGTH) onComplete?.(clean);
    refs.current[Math.min(clean.length, LENGTH - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          data-autofocus={i === 0 ? true : undefined}
          className={cn(
            "h-12 w-10 rounded-lg border bg-white text-center text-lg font-semibold tabular-nums text-gray-900 shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 sm:h-14 sm:w-12",
            invalid ? "border-red-500" : "border-gray-300",
          )}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, "");
            if (!typed) return;
            // Typing over a box replaces that digit and moves on.
            set((value.slice(0, i) + typed + value.slice(i + 1)).slice(0, LENGTH));
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              const idx = d ? i : Math.max(0, i - 1);
              onChange(value.slice(0, idx) + value.slice(idx + 1));
              refs.current[idx]?.focus();
            } else if (e.key === "ArrowLeft") refs.current[Math.max(0, i - 1)]?.focus();
            else if (e.key === "ArrowRight") refs.current[Math.min(LENGTH - 1, i + 1)]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            set(e.clipboardData.getData("text"));
          }}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
