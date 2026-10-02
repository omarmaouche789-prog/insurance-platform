import { Prisma } from "@prisma/client";
import type {
  AnalyticsInterval,
  ApprovalAnalyticsDTO,
  FunnelAnalyticsDTO,
  FunnelStageKey,
  RevenueAnalyticsDTO,
  UserAcquisitionDTO,
} from "@insurance/shared";
import { FUNNEL_STAGE_LABELS, FUNNEL_STAGES, MAX_ANALYTICS_RANGE_DAYS } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";
import { approvalRate } from "../agent/performance";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_RANGE_DAYS = 90;

// A resolved, validated date range. `end` is exclusive (the day after `to`),
// so "to" reads naturally as an inclusive calendar day in the UI.
export interface DateRange {
  from: string;
  to: string;
  start: Date;
  end: Date;
}

const toDay = (d: Date) => d.toISOString().slice(0, 10);
const parseDay = (s: string) => new Date(`${s}T00:00:00Z`);

export function resolveRange(from?: string, to?: string, now = new Date()): DateRange {
  const toDate = to ? parseDay(to) : parseDay(toDay(now));
  const fromDate = from ? parseDay(from) : new Date(toDate.getTime() - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);
  if (fromDate > toDate) throw new HttpError(400, "The start date must be on or before the end date");
  if ((toDate.getTime() - fromDate.getTime()) / DAY_MS + 1 > MAX_ANALYTICS_RANGE_DAYS) {
    throw new HttpError(400, `Date ranges can span at most ${MAX_ANALYTICS_RANGE_DAYS} days`);
  }
  return { from: toDay(fromDate), to: toDay(toDate), start: fromDate, end: new Date(toDate.getTime() + DAY_MS) };
}

const inRange = (r: DateRange) => ({ gte: r.start, lt: r.end });

// Start of the UTC week (Monday, matching Postgres date_trunc('week')) or month.
export function bucketStart(d: Date, interval: AnalyticsInterval): Date {
  if (interval === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * DAY_MS);
}

// Every bucket the range touches, so the chart has no gaps on quiet weeks.
export function buildBuckets(range: DateRange, interval: AnalyticsInterval): string[] {
  const buckets: string[] = [];
  let cursor = bucketStart(range.start, interval);
  while (cursor < range.end) {
    buckets.push(toDay(cursor));
    cursor =
      interval === "month"
        ? new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
        : new Date(cursor.getTime() + 7 * DAY_MS);
  }
  return buckets;
}

interface AcquisitionRow {
  period: Date;
  role: string;
  count: number;
}

export function buildAcquisitionPoints(buckets: string[], rows: AcquisitionRow[]): UserAcquisitionDTO["points"] {
  const byBucket = new Map(buckets.map((b) => [b, { users: 0, agents: 0 }]));
  for (const row of rows) {
    const point = byBucket.get(toDay(new Date(row.period)));
    if (!point) continue;
    if (row.role === "USER") point.users += Number(row.count);
    if (row.role === "AGENT") point.agents += Number(row.count);
  }
  let cumulative = 0;
  return buckets.map((period) => {
    const p = byBucket.get(period)!;
    cumulative += p.users;
    return { period, users: p.users, agents: p.agents, cumulativeUsers: cumulative };
  });
}

export async function getUserAcquisition(range: DateRange, interval: AnalyticsInterval): Promise<UserAcquisitionDTO> {
  const spanMs = range.end.getTime() - range.start.getTime();
  // date_trunc runs in the database so this stays one cheap grouped scan.
  // The interval is an enum value checked by the route, never free text.
  const [rows, previous] = await Promise.all([
    prisma.$queryRaw<AcquisitionRow[]>(Prisma.sql`
      SELECT date_trunc(${interval}, "createdAt") AS period, role::text AS role, COUNT(*)::int AS count
      FROM "users"
      WHERE "createdAt" >= ${range.start} AND "createdAt" < ${range.end} AND role IN ('USER', 'AGENT')
      GROUP BY 1, 2
    `),
    prisma.user.count({
      where: { role: "USER", createdAt: { gte: new Date(range.start.getTime() - spanMs), lt: range.start } },
    }),
  ]);
  const points = buildAcquisitionPoints(buildBuckets(range, interval), rows);
  const totalUsers = points.reduce((s, p) => s + p.users, 0);
  return {
    from: range.from,
    to: range.to,
    interval,
    totalUsers,
    totalAgents: points.reduce((s, p) => s + p.agents, 0),
    growthRate: previous === 0 ? null : (totalUsers - previous) / previous,
    points,
  };
}

export async function getApprovalAnalytics(range: DateRange): Promise<ApprovalAnalyticsDTO> {
  const [handled, decided, revenue] = await Promise.all([
    prisma.application.groupBy({
      by: ["agentId"],
      where: { agentId: { not: null }, createdAt: inRange(range) },
      _count: { _all: true },
    }),
    prisma.application.groupBy({
      by: ["agentId", "status"],
      where: { agentId: { not: null }, reviewedAt: inRange(range), status: { in: ["APPROVED", "REJECTED"] } },
      _count: { _all: true },
    }),
    prisma.commission.groupBy({
      by: ["agentId"],
      where: { createdAt: inRange(range), status: { in: ["EARNED", "PAID"] } },
      _sum: { amountCents: true },
    }),
  ]);

  const ids = [...new Set([...handled, ...decided, ...revenue].map((r) => r.agentId).filter((id): id is string => Boolean(id)))];
  const agents = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, isActive: true },
      })
    : [];

  const stats = new Map(
    agents.map((a) => [
      a.id,
      {
        agentId: a.id,
        agentName: `${a.firstName} ${a.lastName}`,
        isActive: a.isActive,
        handled: 0,
        approved: 0,
        rejected: 0,
        approvalRate: null as number | null,
        revenueCents: 0,
      },
    ]),
  );
  for (const h of handled) {
    const s = h.agentId ? stats.get(h.agentId) : undefined;
    if (s) s.handled = h._count._all;
  }
  for (const d of decided) {
    const s = d.agentId ? stats.get(d.agentId) : undefined;
    if (!s) continue;
    if (d.status === "APPROVED") s.approved = d._count._all;
    else s.rejected = d._count._all;
  }
  for (const r of revenue) {
    const s = stats.get(r.agentId);
    if (s) s.revenueCents = r._sum.amountCents ?? 0;
  }

  const rows = [...stats.values()].map((s) => ({ ...s, approvalRate: approvalRate(s.approved, s.rejected) }));
  // Best performers first: most approvals, then rate, then revenue.
  rows.sort(
    (a, b) =>
      b.approved - a.approved ||
      (b.approvalRate ?? -1) - (a.approvalRate ?? -1) ||
      b.revenueCents - a.revenueCents ||
      a.agentName.localeCompare(b.agentName),
  );
  const approved = rows.reduce((s, r) => s + r.approved, 0);
  const rejected = rows.reduce((s, r) => s + r.rejected, 0);
  return {
    from: range.from,
    to: range.to,
    overall: { approved, rejected, approvalRate: approvalRate(approved, rejected) },
    agents: rows,
  };
}

// "Revenue" is the marketplace's commission income from carriers. VOID
// commissions (admin-rejected applications) are excluded.
export async function getRevenueAnalytics(range: DateRange): Promise<RevenueAnalyticsDTO> {
  const [grouped, policies] = await Promise.all([
    prisma.commission.groupBy({
      by: ["carrierId", "status"],
      where: { createdAt: inRange(range), status: { not: "VOID" } },
      _sum: { amountCents: true },
    }),
    prisma.commission.groupBy({
      by: ["carrierId"],
      where: { createdAt: inRange(range), status: { not: "VOID" } },
      _count: { _all: true },
    }),
  ]);
  const carrierIds = [...new Set(grouped.map((g) => g.carrierId))];
  const carriers = carrierIds.length
    ? await prisma.carrier.findMany({ where: { id: { in: carrierIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(carriers.map((c) => [c.id, c.name]));

  const byCarrier = new Map<string, RevenueAnalyticsDTO["carriers"][number]>();
  for (const id of carrierIds) {
    byCarrier.set(id, {
      carrierId: id,
      carrierName: names.get(id) ?? "Unknown carrier",
      revenueCents: 0,
      pendingCents: 0,
      earnedCents: 0,
      paidCents: 0,
      policies: 0,
    });
  }
  for (const g of grouped) {
    const c = byCarrier.get(g.carrierId)!;
    const cents = g._sum.amountCents ?? 0;
    c.revenueCents += cents;
    if (g.status === "PENDING") c.pendingCents += cents;
    if (g.status === "EARNED") c.earnedCents += cents;
    if (g.status === "PAID") c.paidCents += cents;
  }
  for (const p of policies) {
    const c = byCarrier.get(p.carrierId);
    if (c) c.policies = p._count._all;
  }
  const list = [...byCarrier.values()].sort((a, b) => b.revenueCents - a.revenueCents);
  return { from: range.from, to: range.to, totalCents: list.reduce((s, c) => s + c.revenueCents, 0), carriers: list };
}

export function buildFunnelStages(counts: Record<FunnelStageKey, number>): FunnelAnalyticsDTO["stages"] {
  const start = counts[FUNNEL_STAGES[0]];
  return FUNNEL_STAGES.map((key, i) => {
    const prev = i === 0 ? null : counts[FUNNEL_STAGES[i - 1]];
    return {
      key,
      label: FUNNEL_STAGE_LABELS[key],
      count: counts[key],
      conversionFromPrevious: prev === null ? null : prev === 0 ? null : counts[key] / prev,
      conversionFromStart: i === 0 ? null : start === 0 ? null : counts[key] / start,
    };
  });
}

// A cohort funnel: users who registered in the range, and how far each of
// them got. Each stage is a subset of the previous, so conversion never
// exceeds 100%.
export async function getFunnelAnalytics(range: DateRange): Promise<FunnelAnalyticsDTO> {
  const cohort: Prisma.UserWhereInput = { role: "USER", createdAt: inRange(range) };
  const [registered, started, submitted, accepted, approved] = await Promise.all([
    prisma.user.count({ where: cohort }),
    prisma.user.count({ where: { ...cohort, applications: { some: {} } } }),
    prisma.user.count({ where: { ...cohort, applications: { some: { submissionAttempts: { gt: 0 } } } } }),
    prisma.user.count({ where: { ...cohort, applications: { some: { submissionStatus: "ACCEPTED" } } } }),
    prisma.user.count({ where: { ...cohort, applications: { some: { status: "APPROVED" } } } }),
  ]);
  return {
    from: range.from,
    to: range.to,
    stages: buildFunnelStages({ registered, started, submitted, accepted, approved }),
  };
}
