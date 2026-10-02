import { cn } from "./cn";
import { initials } from "../../lib/format";

const COLORS = ["bg-indigo-100 text-indigo-800", "bg-sky-100 text-sky-800", "bg-emerald-100 text-emerald-800", "bg-amber-100 text-amber-800", "bg-violet-100 text-violet-800"];

// Stable color per name so the same person always looks the same.
export function Avatar({ firstName, lastName, size = "md" }: { firstName: string; lastName: string; size?: "sm" | "md" | "lg" }) {
  const hash = [...`${firstName}${lastName}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const sizes = { sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-14 w-14 text-lg" };
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", COLORS[hash % COLORS.length], sizes[size])} aria-hidden>
      {initials(firstName, lastName)}
    </span>
  );
}
