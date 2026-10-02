import type { AdminRole, Role } from "./roles";
import type { ApplicationStatus, SubmissionStatus } from "./applications";
import type { LoginHistoryEntryDTO } from "./security";

// Admin sub-roles that can suspend, delete and reset users. Only SUPER admins
// can act on other admin accounts.
export const USER_MANAGER_ADMIN_ROLES = ["SUPER", "OPERATIONS"] as const satisfies readonly AdminRole[];

export function canManageUsers(adminRole: AdminRole | null): boolean {
  return adminRole !== null && (USER_MANAGER_ADMIN_ROLES as readonly AdminRole[]).includes(adminRole);
}

export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "DELETED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ADMIN_USER_SORTS = ["createdAt", "lastLoginAt", "name", "email"] as const;
export type AdminUserSort = (typeof ADMIN_USER_SORTS)[number];

export interface AdminUserListItemDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  adminRole: AdminRole | null;
  status: UserStatus;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminUserListResponseDTO {
  total: number;
  page: number;
  pageSize: number;
  users: AdminUserListItemDTO[];
  // Across the whole table (ignoring the status filter), for filter tabs.
  statusCounts: Record<UserStatus, number>;
}

export interface AdminUserAuditEntryDTO {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AdminUserDetailDTO extends AdminUserListItemDTO {
  phone: string | null;
  emailVerifiedAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  deletedAt: string | null;
  updatedAt: string;
  backupCodesRemaining: number;
  agentProfile: {
    licenseNumber: string;
    regions: string[];
    isActive: boolean;
  } | null;
  applications: Array<{
    id: string;
    planName: string;
    status: ApplicationStatus;
    submissionStatus: SubmissionStatus;
    updatedAt: string;
  }>;
  applicationCount: number;
  recentLogins: LoginHistoryEntryDTO[];
  // Actions this user performed (their own audit trail).
  recentActivity: AdminUserAuditEntryDTO[];
}

export interface SuspendUserRequestDTO {
  reason: string;
}

export interface DeleteUserRequestDTO {
  // Must match the account's email — a typed confirmation against mistakes.
  confirmEmail: string;
  reason?: string;
}

export const BULK_USER_ACTIONS = ["suspend", "activate"] as const;
export type BulkUserAction = (typeof BULK_USER_ACTIONS)[number];

export interface BulkUserActionRequestDTO {
  action: BulkUserAction;
  ids: string[];
  reason?: string;
}

export interface BulkUserActionResponseDTO {
  results: Array<{ id: string; ok: boolean; error?: string }>;
}

export interface PasswordResetIssuedResponseDTO {
  status: "sent";
  expiresAt: string;
}
