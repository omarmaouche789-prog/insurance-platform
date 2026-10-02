import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "../../lib/format";

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn =
    "inline-flex h-8 items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav className="flex items-center justify-between gap-4 border-t border-gray-100 px-5 py-3 text-sm text-gray-500" aria-label="Pagination">
      <span>
        <span className="font-medium text-gray-900">{formatNumber(from)}</span>–<span className="font-medium text-gray-900">{formatNumber(to)}</span> of{" "}
        <span className="font-medium text-gray-900">{formatNumber(total)}</span>
      </span>
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Previous
        </button>
        <button type="button" className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
