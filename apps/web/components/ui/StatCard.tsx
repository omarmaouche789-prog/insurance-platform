import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "./cn";

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  // Fractional change, e.g. 0.12 = +12%.
  trend?: number | null;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
        {trend !== undefined && trend !== null && (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", trend >= 0 ? "text-green-700" : "text-red-700")}>
            {trend >= 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
            {trend >= 0 ? "+" : ""}
            {(trend * 100).toFixed(0)}%
          </span>
        )}
        {hint}
      </div>
    </div>
  );
}
