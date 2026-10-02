import type { ApplicationDTO, ApplicationStatus, DocumentType, SubmissionStatus } from "./applications";

export interface AgentApplicationSummaryDTO {
  id: string;
  applicantName: string;
  planName: string;
  carrierName: string;
  monthlyPremiumCents: number;
  status: ApplicationStatus;
  submissionStatus: SubmissionStatus;
  submissionAttempts: number;
  openDocumentRequests: number;
  submittedAt: string | null;
  updatedAt: string;
}

export interface AgentApplicationListResponseDTO {
  total: number;
  page: number;
  pageSize: number;
  applications: AgentApplicationSummaryDTO[];
  // Per-status counts across all of the agent's applications, for filter tabs.
  statusCounts: Record<ApplicationStatus, number>;
}

// What an agent sees: the applicant view plus contact details. Still only the
// SSN's last 4 digits.
export interface AgentApplicationDTO extends ApplicationDTO {
  applicant: { email: string; phone: string | null };
  canResubmit: boolean;
}

export interface RequestDocumentsRequestDTO {
  requestedTypes: DocumentType[];
  message: string;
}

export const COMMISSION_STATUSES = ["PENDING", "EARNED", "PAID", "VOID"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export interface CommissionDTO {
  id: string;
  applicationId: string;
  applicantName: string;
  planName: string;
  carrierName: string;
  premiumCents: number; // monthly premium at the time of sale
  rateBps: number;
  amountCents: number;
  status: CommissionStatus;
  createdAt: string;
}

export interface CommissionSummaryResponseDTO {
  totals: Record<CommissionStatus, number>; // cents
  total: number;
  page: number;
  pageSize: number;
  commissions: CommissionDTO[];
}

export interface FollowUpDTO {
  id: string;
  applicationId: string;
  applicantName: string;
  dueAt: string;
  note: string;
  completedAt: string | null;
  createdAt: string;
}

export interface ScheduleFollowUpRequestDTO {
  dueAt: string; // ISO timestamp, in the future
  note: string;
}

export const FOLLOW_UP_FILTERS = ["upcoming", "overdue", "completed", "all"] as const;
export type FollowUpFilter = (typeof FOLLOW_UP_FILTERS)[number];

export interface FollowUpListResponseDTO {
  followUps: FollowUpDTO[];
  counts: { overdue: number; upcoming: number; completed: number };
}

// Internal to agents and admins; never shown to the applicant.
export interface ApplicationNoteDTO {
  id: string;
  body: string;
  author: { id: string; firstName: string; lastName: string; role: "USER" | "AGENT" | "ADMIN" };
  createdAt: string;
}
