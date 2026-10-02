import { formatPercent } from "../../../lib/format";

// Inline approval-rate meter for tables.
export function ApprovalBar({ rate, approved, rejected }: { rate: number | null; approved: number; rejected: number }) {
  if (rate === null) return <span className="text-xs text-gray-400">No decisions</span>;
  const tone = rate >= 0.75 ? "bg-green-500" : rate >= 0.5 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="min-w-[110px]" title={`${approved} approved · ${rejected} rejected`}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium tabular-nums text-gray-900">{formatPercent(rate)}</span>
        <span className="tabular-nums text-gray-400">
          {approved}/{approved + rejected}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rate * 100)} aria-label="Approval rate">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, rate * 100)}%` }} />
      </div>
    </div>
  );
}
