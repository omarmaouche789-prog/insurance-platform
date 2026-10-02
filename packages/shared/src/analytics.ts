export const ANALYTICS_INTERVALS = ["week", "month"] as const;
export type AnalyticsInterval = (typeof ANALYTICS_INTERVALS)[number];

// Longest range an analytics query may span.
export const MAX_ANALYTICS_RANGE_DAYS = 731;

export interface AnalyticsRangeDTO {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
}

export interface UserAcquisitionPointDTO {
  period: string; // YYYY-MM-DD, start of the week (Monday) or month
  users: number;
  agents: number;
  cumulativeUsers: number;
}

export interface UserAcquisitionDTO extends AnalyticsRangeDTO {
  interval: AnalyticsInterval;
  totalUsers: number;
  totalAgents: number;
  // Change vs the preceding range of the same length; null when it had none.
  growthRate: number | null;
  points: UserAcquisitionPointDTO[];
}

export interface AgentApprovalStatDTO {
  agentId: string;
  agentName: string;
  isActive: boolean;
  handled: number; // applications created in range assigned to the agent
  approved: number;
  rejected: number;
  approvalRate: number | null;
  revenueCents: number; // EARNED + PAID commissions booked in range
}

export interface ApprovalAnalyticsDTO extends AnalyticsRangeDTO {
  overall: { approved: number; rejected: number; approvalRate: number | null };
  agents: AgentApprovalStatDTO[];
}

export interface CarrierRevenueDTO {
  carrierId: string;
  carrierName: string;
  // PENDING + EARNED + PAID (VOID excluded).
  revenueCents: number;
  pendingCents: number;
  earnedCents: number;
  paidCents: number;
  policies: number;
}

export interface RevenueAnalyticsDTO extends AnalyticsRangeDTO {
  totalCents: number;
  carriers: CarrierRevenueDTO[];
}

export const FUNNEL_STAGES = ["registered", "started", "submitted", "accepted", "approved"] as const;
export type FunnelStageKey = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_STAGE_LABELS: Record<FunnelStageKey, string> = {
  registered: "Accounts created",
  started: "Started an application",
  submitted: "Submitted to carrier",
  accepted: "Accepted by carrier",
  approved: "Approved",
};

export interface FunnelStageDTO {
  key: FunnelStageKey;
  label: string;
  count: number;
  conversionFromPrevious: number | null;
  conversionFromStart: number | null;
}

export interface FunnelAnalyticsDTO extends AnalyticsRangeDTO {
  stages: FunnelStageDTO[];
}
