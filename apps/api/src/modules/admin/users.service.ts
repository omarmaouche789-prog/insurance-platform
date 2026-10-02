import type { Request } from "express";
import type { Prisma, User } from "@prisma/client";
import type {
  AdminUserDetailDTO,
  AdminUserListItemDTO,
  AdminUserListResponseDTO,
  AdminUserSort,
  BulkUserActionResponseDTO,
  PasswordResetIssuedResponseDTO,
  Role,
  UserStatus,
} from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { unusablePasswordHash } from "../../lib/password";
import { HttpError } from "../../middleware/errorHandler";
import { email } from "../../integrations/email";
import { emailTemplates } from "../../integrations/emailTemplates";
import { toLoginHistoryDTO } from "../security/loginHistory";
import { sendPasswordResetEmail } from "../security/passwordReset.service";
import { adminResetTwoFactor } from "../security/twoFactor.service";

export interface AdminActor {
  userId: string;
  adminRole: string | null;
}

export function userStatus(u: Pick<User, "isActive" | "deletedAt">): UserStatus {
  if (u.deletedAt) return "DELETED";
  return u.isActive ? "ACTIVE" : "SUSPENDED";
}

export function statusWhere(status: UserStatus): Prisma.UserWhereInput {
  switch (status) {
    case "ACTIVE":
      return { deletedAt: null, isActive: true };
    case "SUSPENDED":
      return { deletedAt: null, isActive: false };
    case "DELETED":
      return { deletedAt: { not: null } };
  }
}

export interface AdminUserFilters {
  search?: string;
  roles?: Role[];
  status?: UserStatus;
  sort: AdminUserSort;
  direction: "asc" | "desc";
  page: number;
  pageSize: number;
}

// Pure so filter → query mapping can be unit-tested. Deleted accounts are
// hidden unless explicitly asked for.
export function buildUserListQuery(f: AdminUserFilters): {
  where: Prisma.UserWhereInput;
  orderBy: Prisma.UserOrderByWithRelationInput[];
} {
  const where: Prisma.UserWhereInput = f.status ? statusWhere(f.status) : { deletedAt: null };
  if (f.roles?.length) where.role = { in: f.roles };
  if (f.search) {
    const terms = f.search.split(/\s+/).filter(Boolean).slice(0, 4);
    // Every term must match somewhere, so "jane doe" finds Jane Doe.
    where.AND = terms.map((term) => ({
      OR: [
        { email: { contains: term, mode: "insensitive" } },
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
      ],
    }));
  }
  const dir = f.direction;
  const primary: Prisma.UserOrderByWithRelationInput[] = {
    createdAt: [{ createdAt: dir }],
    lastLoginAt: [{ lastLoginAt: { sort: dir, nulls: "last" } }],
    name: [{ lastName: dir }, { firstName: dir }],
    email: [{ email: dir }],
  }[f.sort] as Prisma.UserOrderByWithRelationInput[];
  return { where, orderBy: [...primary, { id: "asc" }] };
}

export function toAdminUserListItem(u: User): AdminUserListItemDTO {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    adminRole: u.adminRole,
    status: userStatus(u),
    twoFactorEnabled: u.twoFactorEnabled,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listUsers(f: AdminUserFilters): Promise<AdminUserListResponseDTO> {
  const { where, orderBy } = buildUserListQuery(f);
  const [total, users, active, suspended, deleted] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma.user.count({ where: statusWhere("ACTIVE") }),
    prisma.user.count({ where: statusWhere("SUSPENDED") }),
    prisma.user.count({ where: statusWhere("DELETED") }),
  ]);
  return {
    total,
    page: f.page,
    pageSize: f.pageSize,
    users: users.map(toAdminUserListItem),
    statusCounts: { ACTIVE: active, SUSPENDED: suspended, DELETED: deleted },
  };
}

async function findUser(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, "User not found");
  return user;
}

export async function getUserDetail(id: string): Promise<AdminUserDetailDTO> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      agentProfile: { select: { licenseNumber: true, regions: true, isActive: true } },
      applications: {
        orderBy: { updatedAt: "desc" },
        take: 10,
        select: { id: true, status: true, submissionStatus: true, updatedAt: true, plan: { select: { name: true } } },
      },
      _count: { select: { applications: true } },
    },
  });
  if (!user) throw new HttpError(404, "User not found");

  const [logins, activity, backupCodesRemaining] = await Promise.all([
    prisma.loginHistory.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.auditLog.findMany({
      where: { actorUserId: id },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, action: true, entityType: true, entityId: true, ipAddress: true, createdAt: true },
    }),
    prisma.backupCode.count({ where: { userId: id, usedAt: null } }),
  ]);

  return {
    ...toAdminUserListItem(user),
    phone: user.phone,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    suspendedAt: user.suspendedAt?.toISOString() ?? null,
    suspensionReason: user.suspensionReason,
    deletedAt: user.deletedAt?.toISOString() ?? null,
    updatedAt: user.updatedAt.toISOString(),
    backupCodesRemaining,
    agentProfile: user.agentProfile,
    applications: user.applications.map((a) => ({
      id: a.id,
      planName: a.plan.name,
      status: a.status,
      submissionStatus: a.submissionStatus,
      updatedAt: a.updatedAt.toISOString(),
    })),
    applicationCount: user._count.applications,
    recentLogins: logins.map(toLoginHistoryDTO),
    recentActivity: activity.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  };
}

// Guards shared by every admin action on an account: you can't act on
// yourself (so a SUPER can't lock the last SUPER out — themselves), only
// SUPER admins can act on other admins, and deleted accounts are frozen.
export function assertCanActOn(actor: AdminActor, target: User): void {
  if (target.id === actor.userId) throw new HttpError(400, "You can't perform this action on your own account");
  if (target.role === "ADMIN" && actor.adminRole !== "SUPER") {
    throw new HttpError(403, "Only super admins can manage other admin accounts");
  }
  if (target.deletedAt) throw new HttpError(409, "This account has been deleted");
}

async function revokeSessions(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function suspendUser(actor: AdminActor, id: string, reason: string, req: Request): Promise<AdminUserDetailDTO> {
  const target = await findUser(id);
  assertCanActOn(actor, target);
  if (!target.isActive) throw new HttpError(409, "This account is already suspended");

  // Conditional on still being active, so concurrent suspends don't double-fire.
  const updated = await prisma.user.updateMany({
    where: { id, isActive: true, deletedAt: null },
    data: { isActive: false, suspendedAt: new Date(), suspensionReason: reason },
  });
  if (updated.count === 0) throw new HttpError(409, "This account is already suspended");
  // Refresh tokens die now; an access token already issued lapses within its
  // short TTL (ACCESS_TOKEN_TTL, 15m by default).
  await revokeSessions(id);
  await recordAuditEvent({
    actorUserId: actor.userId,
    action: "admin.user.suspend",
    entityType: "User",
    entityId: id,
    metadata: { reason },
    req,
  });
  await email.send({ to: target.email, ...emailTemplates.accountSuspended({ firstName: target.firstName }) });
  return getUserDetail(id);
}

export async function activateUser(actor: AdminActor, id: string, req: Request): Promise<AdminUserDetailDTO> {
  const target = await findUser(id);
  assertCanActOn(actor, target);
  if (target.isActive) throw new HttpError(409, "This account is already active");

  await prisma.user.update({
    where: { id },
    data: { isActive: true, suspendedAt: null, suspensionReason: null },
  });
  // Reactivating an agent's account also puts them back in the assignment pool.
  if (target.role === "AGENT") {
    await prisma.agentProfile.updateMany({ where: { userId: id }, data: { isActive: true, deactivatedAt: null } });
  }
  await recordAuditEvent({ actorUserId: actor.userId, action: "admin.user.activate", entityType: "User", entityId: id, req });
  await email.send({ to: target.email, ...emailTemplates.accountReactivated({ firstName: target.firstName }) });
  return getUserDetail(id);
}

// Soft delete + anonymization. Applications, commissions and audit rows are
// kept (insurance records have retention requirements), but the account's
// identity is scrubbed and it can never sign in again.
export async function deleteUser(
  actor: AdminActor,
  id: string,
  input: { confirmEmail: string; reason?: string },
  req: Request,
): Promise<void> {
  const target = await findUser(id);
  assertCanActOn(actor, target);
  if (input.confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
    throw new HttpError(400, "The confirmation email doesn't match this account");
  }

  // Tell them before the address is scrubbed.
  await email.send({ to: target.email, ...emailTemplates.accountDeleted({ firstName: target.firstName }) });

  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        email: `deleted+${id}@deleted.invalid`,
        firstName: "Deleted",
        lastName: "User",
        phone: null,
        passwordHash: await unusablePasswordHash(),
        isActive: false,
        twoFactorEnabled: false,
        deletedAt: now,
        suspendedAt: null,
        suspensionReason: null,
      },
    }),
    prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
    prisma.twoFactorSecret.deleteMany({ where: { userId: id } }),
    prisma.backupCode.deleteMany({ where: { userId: id } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
    prisma.notification.deleteMany({ where: { userId: id } }),
    prisma.agentProfile.updateMany({ where: { userId: id }, data: { isActive: false, deactivatedAt: now } }),
  ]);

  // No email or name in the audit row: the point is to forget them.
  await recordAuditEvent({
    actorUserId: actor.userId,
    action: "admin.user.delete",
    entityType: "User",
    entityId: id,
    metadata: { role: target.role, reason: input.reason ?? null },
    req,
  });
}

export async function resetUserPassword(actor: AdminActor, id: string, req: Request): Promise<PasswordResetIssuedResponseDTO> {
  const target = await findUser(id);
  assertCanActOn(actor, target);
  const expiresAt = await sendPasswordResetEmail(target, actor.userId);
  await recordAuditEvent({ actorUserId: actor.userId, action: "admin.user.reset_password", entityType: "User", entityId: id, req });
  return { status: "sent", expiresAt: expiresAt.toISOString() };
}

export async function resetUserTwoFactor(actor: AdminActor, id: string, req: Request): Promise<AdminUserDetailDTO> {
  const target = await findUser(id);
  assertCanActOn(actor, target);
  await adminResetTwoFactor(actor.userId, id, req);
  return getUserDetail(id);
}

const BULK_ERROR = "Unexpected error";

export async function bulkUserAction(
  actor: AdminActor,
  action: "suspend" | "activate",
  ids: string[],
  reason: string | undefined,
  req: Request,
): Promise<BulkUserActionResponseDTO> {
  const results: BulkUserActionResponseDTO["results"] = [];
  // Sequential on purpose: each action is independently guarded and audited,
  // and one failure mustn't abort the rest.
  for (const id of ids) {
    try {
      if (action === "suspend") await suspendUser(actor, id, reason!, req);
      else await activateUser(actor, id, req);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof HttpError ? err.message : BULK_ERROR });
      if (!(err instanceof HttpError)) console.error(`Bulk ${action} failed for ${id}:`, err);
    }
  }
  await recordAuditEvent({
    actorUserId: actor.userId,
    action: `admin.user.bulk_${action}`,
    entityType: "User",
    metadata: { requested: ids.length, succeeded: results.filter((r) => r.ok).length },
    req,
  });
  return { results };
}
