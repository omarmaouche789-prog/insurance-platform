import type { AgentPerformanceDTO, CommissionStatus } from "@insurance/shared";
import { COMMISSION_STATUSES } from "@insurance/shared";
import { prisma } from "../../lib/prisma";

interface StatusCount {
  agentId: string | null;
  status: string;
  _count: { _all: number };
}

interface CommissionSum {
  agentId: string;
  status: CommissionStatus;
  _sum: { amountCents: number | null };
}

export function emptyCommissionTotals(): Record<CommissionStatus, number> {
  return Object.fromEntries(COMMISSION_STATUSES.map((s) => [s, 0])) as Record<CommissionStatus, number>;
}

export function approvalRate(approved: number, rejected: number): number | null {
  return approved + rejected === 0 ? null : approved / (approved + rejected);
}

// Pure: folds grouped counts into per-agent performance. `decided` must only
// contain admin decisions (reviewedAt set), which is what separates an admin
// rejection from a resubmittable carrier rejection.
export function buildPerformance(
  agentIds: string[],
  all: StatusCount[],
  decided: StatusCount[],
  commissions: CommissionSum[],
): Map<string, AgentPerformanceDTO> {
  const result = new Map<string, AgentPerformanceDTO>();
  for (const id of agentIds) {
    result.set(id, {
      applicationsHandled: 0,
      openApplications: 0,
      approved: 0,
      rejected: 0,
      approvalRate: null,
      commissions: emptyCommissionTotals(),
    });
  }
  for (const row of all) {
    const p = row.agentId ? result.get(row.agentId) : undefined;
    if (!p) continue;
    p.applicationsHandled += row._count._all;
    if (row.status === "DRAFT" || row.status === "SUBMITTED") p.openApplications += row._count._all;
  }
  for (const row of decided) {
    const p = row.agentId ? result.get(row.agentId) : undefined;
    if (!p) continue;
    if (row.status === "APPROVED") p.approved += row._count._all;
    if (row.status === "REJECTED") p.rejected += row._count._all;
  }
  for (const row of commissions) {
    const p = result.get(row.agentId);
    if (p) p.commissions[row.status] += row._sum.amountCents ?? 0;
  }
  for (const p of result.values()) p.approvalRate = approvalRate(p.approved, p.rejected);
  return result;
}

// Three grouped queries for any number of agents, instead of N+1.
export async function loadAgentPerformance(agentIds: string[]): Promise<Map<string, AgentPerformanceDTO>> {
  if (agentIds.length === 0) return new Map();
  const scope = { agentId: { in: agentIds } };
  const [all, decided, commissions] = await Promise.all([
    prisma.application.groupBy({ by: ["agentId", "status"], where: scope, _count: { _all: true } }),
    prisma.application.groupBy({
      by: ["agentId", "status"],
      where: { ...scope, reviewedAt: { not: null }, status: { in: ["APPROVED", "REJECTED"] } },
      _count: { _all: true },
    }),
    prisma.commission.groupBy({ by: ["agentId", "status"], where: scope, _sum: { amountCents: true } }),
  ]);
  return buildPerformance(agentIds, all, decided, commissions);
}
