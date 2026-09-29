import type { Prisma } from "@prisma/client";
import type { AdminQueueSort, ApplicationStatus } from "@insurance/shared";

const HOUR_MS = 60 * 60 * 1000;

export interface DecidedApplication {
  status: "APPROVED" | "REJECTED";
  submittedAt: Date | null;
  reviewedAt: Date;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Approval rate and review turnaround over a set of admin decisions. Review
// time runs from the (latest) carrier acceptance to the admin decision.
export function computeApprovalMetrics(decided: DecidedApplication[]) {
  const approvedCount = decided.filter((d) => d.status === "APPROVED").length;
  const rejectedCount = decided.length - approvedCount;

  const hours = decided
    .filter((d): d is DecidedApplication & { submittedAt: Date } => d.submittedAt !== null)
    .map((d) => Math.max(0, d.reviewedAt.getTime() - d.submittedAt.getTime()) / HOUR_MS)
    .sort((a, b) => a - b);

  const median =
    hours.length === 0
      ? null
      : hours.length % 2
        ? hours[(hours.length - 1) / 2]
        : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2;

  return {
    approvedCount,
    rejectedCount,
    approvalRate: decided.length ? approvedCount / decided.length : null,
    averageReviewHours: hours.length ? round1(hours.reduce((a, b) => a + b, 0) / hours.length) : null,
    medianReviewHours: median === null ? null : round1(median),
  };
}

export interface AdminQueueFilters {
  statuses?: ApplicationStatus[];
  agentId?: string;
  search?: string;
  sort: AdminQueueSort;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
}

// Pure so the filter/sort → query mapping can be unit-tested.
export function buildAdminQueueQuery(f: AdminQueueFilters): {
  where: Prisma.ApplicationWhereInput;
  orderBy: Prisma.ApplicationOrderByWithRelationInput[];
} {
  const where: Prisma.ApplicationWhereInput = {};
  if (f.statuses?.length) where.status = { in: f.statuses };
  if (f.agentId) where.agentId = f.agentId;
  if (f.search) {
    where.OR = [
      { firstName: { contains: f.search, mode: "insensitive" } },
      { lastName: { contains: f.search, mode: "insensitive" } },
      { carrierReference: { contains: f.search, mode: "insensitive" } },
    ];
  }

  const dir = f.direction;
  const primary: Prisma.ApplicationOrderByWithRelationInput[] = {
    // Never-submitted drafts have no submittedAt; keep them at the end either way.
    submittedAt: [{ submittedAt: { sort: dir, nulls: "last" } }],
    updatedAt: [{ updatedAt: dir }],
    premium: [{ plan: { monthlyPremiumCents: dir } }],
    applicant: [{ lastName: dir }, { firstName: dir }],
  }[f.sort] as Prisma.ApplicationOrderByWithRelationInput[];

  // id as a final tiebreaker keeps pagination stable.
  return { where, orderBy: [...primary, { id: "asc" }] };
}
