"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type {
  AgentApprovalStatDTO,
  AnalyticsInterval,
  CarrierRevenueDTO,
  FunnelStageDTO,
  UserAcquisitionPointDTO,
} from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { formatCompactCents, formatNumber, formatPercent } from "../../../lib/format";
import { Legend, TooltipCard } from "./ChartTooltip";
import { useChartTheme } from "./useChartTheme";

const AXIS_TICK = { fontSize: 11 };

function periodLabel(period: string, interval: AnalyticsInterval, long = false): string {
  const d = new Date(`${period}T12:00:00Z`);
  if (interval === "month") return d.toLocaleDateString("en-US", { month: long ? "long" : "short", year: long ? "numeric" : "2-digit", timeZone: "UTC" });
  const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return long ? `Week of ${label}` : label;
}

export function AcquisitionChart({ points, interval }: { points: UserAcquisitionPointDTO[]; interval: AnalyticsInterval }) {
  const t = useChartTheme();
  return (
    <div>
      <div className="mb-3">
        <Legend
          items={[
            { label: "New users", color: t.series[0] },
            { label: "New agents", color: t.series[1] },
          ]}
        />
      </div>
      <div className="h-64" role="img" aria-label="New users and agents per period">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="usersFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.series[0]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={t.series[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis
              dataKey="period"
              tickFormatter={(p: string) => periodLabel(p, interval)}
              tick={{ ...AXIS_TICK, fill: t.axis }}
              tickLine={false}
              axisLine={{ stroke: t.grid }}
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tick={{ ...AXIS_TICK, fill: t.axis }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ stroke: t.axis, strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={periodLabel(String(label), interval, true)}
                    rows={[
                      { label: "New users", value: formatNumber(payload[0].payload.users), color: t.series[0] },
                      { label: "New agents", value: formatNumber(payload[0].payload.agents), color: t.series[1] },
                      { label: "Total users (range)", value: formatNumber(payload[0].payload.cumulativeUsers) },
                    ]}
                  />
                ) : null
              }
            />
            <Area type="monotone" dataKey="users" stroke={t.series[0]} strokeWidth={2} fill="url(#usersFill)" activeDot={{ r: 4, stroke: t.surface, strokeWidth: 2 }} />
            <Line type="monotone" dataKey="agents" stroke={t.series[1]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: t.surface, strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ApprovalRateChart({ agents }: { agents: AgentApprovalStatDTO[] }) {
  const t = useChartTheme();
  // Only agents with decisions have a rate to plot; best first, capped for legibility.
  const rows = agents
    .filter((a) => a.approvalRate !== null)
    .sort((a, b) => (b.approvalRate ?? 0) - (a.approvalRate ?? 0) || b.approved - a.approved)
    .slice(0, 10)
    .map((a) => ({ ...a, pct: Math.round((a.approvalRate ?? 0) * 1000) / 10 }));
  if (rows.length === 0) return <p className="py-16 text-center text-sm text-gray-500">No admin decisions in this range yet.</p>;
  return (
    <div style={{ height: Math.max(160, rows.length * 40 + 32) }} role="img" aria-label="Approval rate by agent">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ ...AXIS_TICK, fill: t.axis }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="agentName" width={110} tick={{ ...AXIS_TICK, fill: t.text }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: t.grid, opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const a = payload[0].payload as AgentApprovalStatDTO & { pct: number };
              return (
                <TooltipCard
                  title={a.agentName}
                  rows={[
                    { label: "Approval rate", value: formatPercent(a.approvalRate, 1), color: t.series[0] },
                    { label: "Approved", value: a.approved },
                    { label: "Rejected", value: a.rejected },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="pct"
            fill={t.series[0]}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            label={{ position: "right", fontSize: 11, fill: t.text, formatter: (v: unknown) => `${String(v)}%` }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const MAX_SLICES = 6;

export function RevenueDonut({ carriers, totalCents }: { carriers: CarrierRevenueDTO[]; totalCents: number }) {
  const t = useChartTheme();
  if (totalCents === 0) return <p className="py-16 text-center text-sm text-gray-500">No commission revenue in this range.</p>;
  // Color follows the carrier (alphabetical slot), never its rank, so a
  // carrier keeps its color when the date range changes the ordering.
  const slotOf = new Map([...carriers].sort((a, b) => a.carrierName.localeCompare(b.carrierName)).map((c, i) => [c.carrierId, i]));
  const sorted = [...carriers].sort((a, b) => b.revenueCents - a.revenueCents);
  const shown = sorted.slice(0, MAX_SLICES - (sorted.length > MAX_SLICES ? 1 : 0));
  const rest = sorted.slice(shown.length);
  const slices = [
    ...shown.map((c) => ({ name: c.carrierName, value: c.revenueCents, color: t.series[(slotOf.get(c.carrierId) ?? 0) % t.series.length] })),
    ...(rest.length ? [{ name: "Other", value: rest.reduce((s, c) => s + c.revenueCents, 0), color: t.axis }] : []),
  ];

  return (
    // Stacked: the card sits in a narrow column, so a side legend would overflow.
    <div className="flex flex-col items-center gap-5">
      <div className="relative h-48 w-48 shrink-0" role="img" aria-label="Commission revenue share by carrier">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" stroke={t.surface} strokeWidth={2} paddingAngle={1} isAnimationActive={false}>
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const s = payload[0].payload as (typeof slices)[number];
                return <TooltipCard title={s.name} rows={[{ label: "Revenue", value: formatCents(s.value), color: s.color }, { label: "Share", value: formatPercent(s.value / totalCents, 1) }]} />;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-gray-500">Total</span>
          <span className="text-lg font-semibold tabular-nums text-gray-900">{formatCompactCents(totalCents)}</span>
        </div>
      </div>
      <ul className="w-full space-y-2.5">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-gray-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
              <span className="truncate">{s.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium text-gray-900">{formatCents(s.value)}</span>
              <span className="ml-2 inline-block w-12 text-right text-xs text-gray-500">{formatPercent(s.value / totalCents)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FunnelChart({ stages }: { stages: FunnelStageDTO[] }) {
  const t = useChartTheme();
  const top = stages[0]?.count ?? 0;
  if (top === 0) return <p className="py-16 text-center text-sm text-gray-500">No new accounts in this range.</p>;
  return (
    <ol className="space-y-3" aria-label="Application funnel">
      {stages.map((s, i) => (
        <li key={s.key} title={`${s.label}: ${formatNumber(s.count)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="text-gray-700">{s.label}</span>
            <span className="tabular-nums">
              <span className="font-semibold text-gray-900">{formatNumber(s.count)}</span>
              {i > 0 && (
                <span className="ml-2 text-xs text-gray-500">
                  {formatPercent(s.conversionFromPrevious, 0)} of previous
                </span>
              )}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded bg-gray-100">
            <div
              className="h-full rounded transition-[width] duration-500"
              style={{ width: `${Math.max(1.5, (s.count / top) * 100)}%`, background: t.series[0] }}
            />
          </div>
        </li>
      ))}
      <li className="border-t border-gray-100 pt-3 text-sm text-gray-500">
        Overall conversion{" "}
        <span className="font-semibold text-gray-900">{formatPercent(stages[stages.length - 1].conversionFromStart, 1)}</span> from sign-up to approval
      </li>
    </ol>
  );
}
