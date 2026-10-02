import type { AdminRole } from "./roles";
import type { CommissionDTO, CommissionStatus } from "./agent";
import type { ApplicationStatus, SubmissionStatus } from "./applications";

export const AGENT_MANAGER_ADMIN_ROLES = ["SUPER", "OPERATIONS"] as const satisfies readonly AdminRole[];
export const COMMISSION_PAYER_ADMIN_ROLES = ["SUPER", "FINANCE"] as const satisfies readonly AdminRole[];

export function canManageAgents(adminRole: AdminRole | null): boolean {
  return adminRole !== null && (AGENT_MANAGER_ADMIN_ROLES as readonly AdminRole[]).includes(adminRole);
}

export function canPayCommissions(adminRole: AdminRole | null): boolean {
  return adminRole !== null && (COMMISSION_PAYER_ADMIN_ROLES as readonly AdminRole[]).includes(adminRole);
}

// Two-letter codes agents can be licensed in (50 states + DC).
export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC",
  "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;
export type UsState = (typeof US_STATES)[number];

// Upper bound on a commission rate override: 50% of annualized premium.
export const MAX_COMMISSION_RATE_BPS = 5000;

export interface AgentPerformanceDTO {
  applicationsHandled: number;
  // DRAFT or SUBMITTED: still needs the agent (or an admin).
  openApplications: number;
  approved: number;
  // Admin rejections only; carrier rejections are resubmittable.
  rejected: number;
  // approved / (approved + rejected); null before any admin decision.
  approvalRate: number | null;
  // Sums in cents, by commission status.
  commissions: Record<CommissionStatus, number>;
}

export interface AdminAgentDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  licenseNumber: string;
  npn: string | null;
  licenseExpiresAt: string | null;
  regions: string[];
  // Agent override; null = carrier default rates apply.
  commissionRateBps: number | null;
  isActive: boolean;
  deactivatedAt: string | null;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  performance: AgentPerformanceDTO;
}

export interface AdminAgentListResponseDTO {
  total: number;
  agents: AdminAgentDTO[];
  summary: {
    active: number;
    inactive: number;
    commissions: Record<CommissionStatus, number>;
  };
}

export interface AdminAgentApplicationDTO {
  id: string;
  applicantName: string;
  planName: string;
  status: ApplicationStatus;
  submissionStatus: SubmissionStatus;
  updatedAt: string;
}

export interface AdminAgentDetailDTO extends AdminAgentDTO {
  recentApplications: AdminAgentApplicationDTO[];
  commissionHistory: CommissionDTO[];
}

export interface CreateAgentRequestDTO {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  licenseNumber: string;
  npn?: string;
  licenseExpiresAt?: string; // YYYY-MM-DD
  regions: string[];
  commissionRateBps?: number | null;
}

export type UpdateAgentRequestDTO = Partial<Omit<CreateAgentRequestDTO, "email">>;

export interface DeactivateAgentRequestDTO {
  // Move the agent's not-yet-submitted work to other agents in-region.
  reassignOpen?: boolean;
  reason?: string;
}

export interface DeactivateAgentResponseDTO {
  agent: AdminAgentDTO;
  reassigned: number;
  unassigned: number;
}

export interface PayCommissionsRequestDTO {
  // Specific EARNED commissions to mark paid; omit to pay all EARNED.
  commissionIds?: string[];
}

export interface PayCommissionsResponseDTO {
  paidCount: number;
  paidCents: number;
}

export interface AgentMonthlyPerformanceDTO {
  month: string; // YYYY-MM
  applications: number;
  approved: number;
  rejected: number;
  commissionCents: number; // non-void commissions booked that month
}

export interface AgentSelfPerformanceResponseDTO {
  performance: AgentPerformanceDTO;
  monthly: AgentMonthlyPerformanceDTO[];
  openDocumentRequests: number;
  followUps: { overdue: number; dueToday: number; upcoming: number };
}

export function formatRateBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}
