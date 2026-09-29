import { describe, expect, it } from "vitest";
import { buildAdminQueueQuery, computeApprovalMetrics } from "../src/modules/admin/review.metrics";

const at = (h: number) => new Date(Date.UTC(2026, 8, 1) + h * 3600_000);

describe("computeApprovalMetrics", () => {
  it("returns nulls with no decisions", () => {
    expect(computeApprovalMetrics([])).toEqual({
      approvedCount: 0,
      rejectedCount: 0,
      approvalRate: null,
      averageReviewHours: null,
      medianReviewHours: null,
    });
  });

  it("computes rate, mean and median review hours", () => {
    const m = computeApprovalMetrics([
      { status: "APPROVED", submittedAt: at(0), reviewedAt: at(4) },
      { status: "APPROVED", submittedAt: at(0), reviewedAt: at(1) },
      { status: "REJECTED", submittedAt: at(0), reviewedAt: at(10) },
      { status: "APPROVED", submittedAt: at(0), reviewedAt: at(2.5) },
    ]);
    expect(m).toMatchObject({ approvedCount: 3, rejectedCount: 1, approvalRate: 0.75 });
    expect(m.averageReviewHours).toBe(4.4); // 17.5 / 4 = 4.375
    expect(m.medianReviewHours).toBe(3.3); // (2.5 + 4) / 2 = 3.25
  });

  it("counts decisions without a submittedAt toward the rate but not review time", () => {
    const m = computeApprovalMetrics([
      { status: "REJECTED", submittedAt: null, reviewedAt: at(5) },
      { status: "APPROVED", submittedAt: at(0), reviewedAt: at(6) },
    ]);
    expect(m).toMatchObject({ approvalRate: 0.5, averageReviewHours: 6, medianReviewHours: 6 });
  });
});

describe("buildAdminQueueQuery", () => {
  const base = { sort: "submittedAt" as const, direction: "asc" as const, page: 1, pageSize: 20 };

  it("has no scope by default: admins see every agent's applications", () => {
    expect(buildAdminQueueQuery(base).where).toEqual({});
  });

  it("keeps never-submitted drafts last when sorting by submission date", () => {
    expect(buildAdminQueueQuery(base).orderBy).toEqual([{ submittedAt: { sort: "asc", nulls: "last" } }, { id: "asc" }]);
  });

  it("sorts by applicant surname then first name", () => {
    expect(buildAdminQueueQuery({ ...base, sort: "applicant", direction: "desc" }).orderBy).toEqual([
      { lastName: "desc" },
      { firstName: "desc" },
      { id: "asc" },
    ]);
  });

  it("filters by status, agent and search", () => {
    const { where } = buildAdminQueueQuery({ ...base, statuses: ["SUBMITTED"], agentId: "agent-1", search: "BLUE" });
    expect(where).toMatchObject({ status: { in: ["SUBMITTED"] }, agentId: "agent-1" });
    expect(where.OR).toHaveLength(3);
  });
});
