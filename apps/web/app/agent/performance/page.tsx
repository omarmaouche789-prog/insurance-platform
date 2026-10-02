"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlarmClock, CircleDollarSign, FileQuestion, FileText, Target, Wallet } from "lucide-react";
import type { AgentMonthlyPerformanceDTO, AgentSelfPerformanceResponseDTO } from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { formatCompactCents, formatPercent } from "../../../lib/format";
import { useApiQuery } from "../../../lib/use-api";
import { TooltipCard } from "../../../components/admin/analytics/ChartTooltip";
import { useChartTheme } from "../../../components/admin/analytics/useChartTheme";
import { CommissionWidget } from "../../../components/agent/CommissionWidget";
import { useAuth } from "../../../lib/auth-context";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { StatCard } from "../../../components/ui/StatCard";
import { ErrorState, LoadingState } from "../../../components/ui/States";

const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

function MonthlyBars({ data, dataKey, label, format }: { data: AgentMonthlyPerformanceDTO[]; dataKey: "applications" | "commissionCents"; label: string; format: (n: number) => string }) {
  const t = useChartTheme();
  return (
    <div className="h-56" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: t.axis }} tickLine={false} axisLine={{ stroke: t.grid }} />
          <YAxis allowDecimals={false} tickFormatter={dataKey === "commissionCents" ? formatCompactCents : undefined} tick={{ fontSize: 11, fill: t.axis }} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            cursor={{ fill: t.grid, opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as AgentMonthlyPerformanceDTO;
              return (
                <TooltipCard
                  title={new Date(`${row.month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
                  rows={
                    dataKey === "applications"
                      ? [
                          { label: "New applications", value: row.applications, color: t.series[0] },
                          { label: "Approved", value: row.approved },
                          { label: "Rejected", value: row.rejected },
                        ]
                      : [{ label: "Commission booked", value: format(row.commissionCents), color: t.series[0] }]
                  }
                />
              );
            }}
          />
          <Bar dataKey={dataKey} fill={t.series[0]} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AgentPerformancePage() {
  const { accessToken } = useAuth();
  const { data, error, reload } = useApiQuery<AgentSelfPerformanceResponseDTO>("/api/agent/performance", "Couldn't load your performance");
  if (error) return <PageContainer><ErrorState message={error} onRetry={reload} /></PageContainer>;
  if (!data || !accessToken) return <LoadingState className="py-32" />;
  const p = data.performance;

  return (
    <PageContainer wide>
      <PageHeader title="Performance" description="Your pipeline, approval rate and commissions." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Applications handled" value={p.applicationsHandled} icon={<FileText className="h-4 w-4" />} hint={`${p.openApplications} open`} />
        <StatCard label="Approval rate" value={formatPercent(p.approvalRate)} icon={<Target className="h-4 w-4" />} hint={`${p.approved} approved · ${p.rejected} rejected`} />
        <StatCard label="Earned commission" value={formatCents(p.commissions.EARNED + p.commissions.PAID)} icon={<CircleDollarSign className="h-4 w-4" />} hint={`${formatCents(p.commissions.PAID)} paid out`} />
        <StatCard label="Pending commission" value={formatCents(p.commissions.PENDING)} icon={<Wallet className="h-4 w-4" />} hint="Awaiting admin approval" />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Link href="/agent/follow-ups" className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-card transition-colors hover:border-indigo-300">
          <AlarmClock className={`h-8 w-8 ${data.followUps.overdue ? "text-red-600" : "text-indigo-600"}`} aria-hidden />
          <div>
            <p className="font-medium text-gray-900">
              {data.followUps.overdue ? `${data.followUps.overdue} overdue follow-up${data.followUps.overdue === 1 ? "" : "s"}` : "No overdue follow-ups"}
            </p>
            <p className="text-sm text-gray-500">{data.followUps.dueToday} due today · {data.followUps.upcoming} later</p>
          </div>
        </Link>
        <Link href="/agent/applications" className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-card transition-colors hover:border-indigo-300">
          <FileQuestion className="h-8 w-8 text-indigo-600" aria-hidden />
          <div>
            <p className="font-medium text-gray-900">{data.openDocumentRequests} open document request{data.openDocumentRequests === 1 ? "" : "s"}</p>
            <p className="text-sm text-gray-500">Waiting on applicants or your review</p>
          </div>
        </Link>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="New applications" description="Last 6 months" />
          <CardBody><MonthlyBars data={data.monthly} dataKey="applications" label="New applications per month" format={String} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Commission booked" description="Last 6 months, excluding voided" />
          <CardBody><MonthlyBars data={data.monthly} dataKey="commissionCents" label="Commission booked per month" format={formatCents} /></CardBody>
        </Card>
      </div>

      <CommissionWidget accessToken={accessToken} />
    </PageContainer>
  );
}
