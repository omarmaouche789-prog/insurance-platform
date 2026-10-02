"use client";

import { useState } from "react";
import { CircleDollarSign, Download, Filter, Target, UserPlus } from "lucide-react";
import type {
  AnalyticsInterval,
  ApprovalAnalyticsDTO,
  FunnelAnalyticsDTO,
  RevenueAnalyticsDTO,
  UserAcquisitionDTO,
} from "@insurance/shared";
import { formatCents } from "@insurance/shared";
import { describeApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { downloadWithAuth } from "../../../lib/download";
import { formatNumber, formatPercent } from "../../../lib/format";
import { useApiQuery } from "../../../lib/use-api";
import { AcquisitionChart, ApprovalRateChart, FunnelChart, RevenueDonut } from "../../../components/admin/analytics/Charts";
import { DateRangePicker, presetRange, type DateRange } from "../../../components/admin/analytics/DateRangePicker";
import { ApprovalBar } from "../../../components/admin/agents/ApprovalBar";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { PageContainer, PageHeader } from "../../../components/ui/PageHeader";
import { StatCard } from "../../../components/ui/StatCard";
import { EmptyState, ErrorState, Skeleton } from "../../../components/ui/States";
import { FilterTabs } from "../../../components/ui/Tabs";
import { Table, TBody, Td, Th, THead } from "../../../components/ui/Table";
import { useToast } from "../../../components/ui/Toast";

function Panel<T>({ q, children, height = "h-64" }: { q: { data: T | null; error: string | null; reload: () => void }; children: (data: T) => React.ReactNode; height?: string }) {
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} className="py-10" />;
  if (!q.data) return <Skeleton className={`w-full ${height}`} />;
  return <>{children(q.data)}</>;
}

export default function AdminAnalyticsPage() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [range, setRange] = useState<DateRange>(() => presetRange(90));
  const [interval, setBucketInterval] = useState<AnalyticsInterval>("week");
  const [exporting, setExporting] = useState(false);

  const qs = `from=${range.from}&to=${range.to}`;
  const users = useApiQuery<UserAcquisitionDTO>(`/api/admin/analytics/users?${qs}&interval=${interval}`, "Couldn't load user acquisition");
  const approvals = useApiQuery<ApprovalAnalyticsDTO>(`/api/admin/analytics/approvals?${qs}`, "Couldn't load approval rates");
  const revenue = useApiQuery<RevenueAnalyticsDTO>(`/api/admin/analytics/revenue?${qs}`, "Couldn't load revenue");
  const funnel = useApiQuery<FunnelAnalyticsDTO>(`/api/admin/analytics/funnel?${qs}`, "Couldn't load the funnel");

  async function exportExcel() {
    if (!accessToken) return;
    setExporting(true);
    try {
      await downloadWithAuth(`/api/admin/analytics/export?${qs}&interval=${interval}`, accessToken, `analytics-${range.from}-to-${range.to}.xlsx`);
      toast.success("Export ready", "Your Excel workbook is downloading.");
    } catch (err) {
      toast.error("Export failed", describeApiError(err));
    } finally {
      setExporting(false);
    }
  }

  const conversion = funnel.data?.stages.at(-1)?.conversionFromStart ?? null;
  const topAgents = approvals.data?.agents.slice(0, 10) ?? [];

  return (
    <PageContainer wide>
      <PageHeader
        title="Analytics"
        description="Growth, agent performance and revenue across the marketplace."
        actions={
          <Button variant="primary" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={exportExcel}>
            Export to Excel
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-card">
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Filter className="h-4 w-4 text-gray-400" aria-hidden /> Date range
        </span>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="New users"
          icon={<UserPlus className="h-4 w-4" />}
          value={users.data ? formatNumber(users.data.totalUsers) : "—"}
          trend={users.data?.growthRate}
          hint={users.data ? "vs previous period" : undefined}
        />
        <StatCard
          label="Approval rate"
          icon={<Target className="h-4 w-4" />}
          value={approvals.data ? formatPercent(approvals.data.overall.approvalRate, 1) : "—"}
          hint={approvals.data ? `${approvals.data.overall.approved} approved · ${approvals.data.overall.rejected} rejected` : undefined}
        />
        <StatCard
          label="Commission revenue"
          icon={<CircleDollarSign className="h-4 w-4" />}
          value={revenue.data ? formatCents(revenue.data.totalCents) : "—"}
          hint={revenue.data ? `${revenue.data.carriers.reduce((s, c) => s + c.policies, 0)} policies` : undefined}
        />
        <StatCard
          label="Sign-up → approval"
          icon={<Filter className="h-4 w-4" />}
          value={formatPercent(conversion, 1)}
          hint="of new accounts in range"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="User acquisition"
            description="New registered users and agents"
            actions={
              <FilterTabs<AnalyticsInterval>
                label="Interval"
                value={interval}
                onChange={setBucketInterval}
                tabs={[
                  { value: "week", label: "Weekly" },
                  { value: "month", label: "Monthly" },
                ]}
              />
            }
          />
          <CardBody>
            <Panel q={users}>{(d) => <AcquisitionChart points={d.points} interval={d.interval} />}</Panel>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Application funnel" description="Accounts created in range and how far they got" />
          <CardBody>
            <Panel q={funnel}>{(d) => <FunnelChart stages={d.stages} />}</Panel>
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Approval rate by agent" description="Admin decisions made in range (top 10)" />
          <CardBody>
            <Panel q={approvals}>{(d) => <ApprovalRateChart agents={d.agents} />}</Panel>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Revenue by carrier" description="Commissions booked in range, excluding voided" />
          <CardBody>
            <Panel q={revenue} height="h-52">{(d) => <RevenueDonut carriers={d.carriers} totalCents={d.totalCents} />}</Panel>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Top agents" description="Ranked by approvals, then approval rate and revenue" />
        {approvals.error ? (
          <ErrorState message={approvals.error} onRetry={approvals.reload} />
        ) : !approvals.data ? (
          <div className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
        ) : topAgents.length === 0 ? (
          <EmptyState title="No agent activity in this range" />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th className="w-12">#</Th>
                <Th>Agent</Th>
                <Th className="text-right">Handled</Th>
                <Th className="text-right">Approved</Th>
                <Th className="text-right">Rejected</Th>
                <Th>Approval rate</Th>
                <Th className="text-right">Revenue</Th>
              </tr>
            </THead>
            <TBody>
              {topAgents.map((a, i) => (
                <tr key={a.agentId}>
                  <Td className="tabular-nums text-gray-400">{i + 1}</Td>
                  <Td className="font-medium text-gray-900">
                    {a.agentName}
                    {!a.isActive && <Badge className="ml-2">Inactive</Badge>}
                  </Td>
                  <Td className="text-right tabular-nums">{a.handled}</Td>
                  <Td className="text-right tabular-nums">{a.approved}</Td>
                  <Td className="text-right tabular-nums">{a.rejected}</Td>
                  <Td><ApprovalBar rate={a.approvalRate} approved={a.approved} rejected={a.rejected} /></Td>
                  <Td className="text-right font-medium tabular-nums text-gray-900">{formatCents(a.revenueCents)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {revenue.data && revenue.data.carriers.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Revenue detail" description="By carrier and commission status" />
          <Table>
            <THead>
              <tr>
                <Th>Carrier</Th>
                <Th className="text-right">Policies</Th>
                <Th className="text-right">Pending</Th>
                <Th className="text-right">Earned</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </THead>
            <TBody>
              {revenue.data.carriers.map((c) => (
                <tr key={c.carrierId}>
                  <Td className="font-medium text-gray-900">{c.carrierName}</Td>
                  <Td className="text-right tabular-nums">{c.policies}</Td>
                  <Td className="text-right tabular-nums">{formatCents(c.pendingCents)}</Td>
                  <Td className="text-right tabular-nums">{formatCents(c.earnedCents)}</Td>
                  <Td className="text-right tabular-nums">{formatCents(c.paidCents)}</Td>
                  <Td className="text-right font-medium tabular-nums text-gray-900">{formatCents(c.revenueCents)}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </PageContainer>
  );
}
