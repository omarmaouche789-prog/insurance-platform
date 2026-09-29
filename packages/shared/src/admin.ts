import type { AdminRole } from "./roles";
import type { ApplicationStatus, SubmissionStatus } from "./applications";
import type { AgentApplicationDTO, CommissionStatus } from "./agent";

// Admin sub-roles allowed to approve/reject. Everyone with the ADMIN role can
// view the queue and metrics.
export const APPROVER_ADMIN_ROLES = ["SUPER", "OPERATIONS"] as const satisfies readonly AdminRole[];

export function canApproveApplications(adminRole: AdminRole | null): boolean {
  return adminRole !== null && (APPROVER_ADMIN_ROLES as readonly AdminRole[]).includes(adminRole);
}

export const ADMIN_QUEUE_SORTS = ["submittedAt", "updatedAt", "premium", "applicant"] as const;
export type AdminQueueSort = (typeof ADMIN_QUEUE_SORTS)[number];

export interface AdminQueueItemDTO {
  id: string;
  applicantName: string;
  agentName: string | null;
  planName: string;
  carrierName: string;
  monthlyPremiumCents: number;
  status: ApplicationStatus;
  submissionStatus: SubmissionStatus;
  carrierReference: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string;
}

export interface AdminQueueResponseDTO {
  total: number;
  page: number;
  pageSize: number;
  items: AdminQueueItemDTO[];
}

export interface AdminPendingResponseDTO {
  total: number;
  // Oldest first, capped; `total` is the full count.
  items: AdminQueueItemDTO[];
}

export interface AdminApplicationDTO extends AgentApplicationDTO {
  reviewerName: string | null;
  reviewNotes: string | null;
  commission: { status: CommissionStatus; amountCents: number } | null;
  // Pending admin review (the caller's sub-role is checked separately).
  awaitingDecision: boolean;
}

export interface ApprovalMetricsDTO {
  windowDays: number;
  pendingCount: number;
  oldestPendingSubmittedAt: string | null;
  approvedCount: number;
  rejectedCount: number;
  // approved / (approved + rejected) over the window; null with no decisions.
  approvalRate: number | null;
  // Hours from (latest) carrier acceptance to admin decision.
  averageReviewHours: number | null;
  medianReviewHours: number | null;
}

export interface ReviewDecisionRequestDTO {
  notes?: string;
}

export interface RejectRequestDTO {
  reason: string;
}

export interface BulkDecisionRequestDTO {
  action: "approve" | "reject";
  ids: string[];
  // Approval notes, or the rejection reason (required for reject).
  notes?: string;
}

export interface BulkDecisionResponseDTO {
  results: Array<{ id: string; ok: boolean; error?: string }>;
}
