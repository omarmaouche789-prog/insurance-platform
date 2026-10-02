import type { Request } from "express";
import type { AgentProfile, Prisma, User } from "@prisma/client";
import type {
  AdminAgentDetailDTO,
  AdminAgentDTO,
  AdminAgentListResponseDTO,
  AgentPerformanceDTO,
  CreateAgentRequestDTO,
  DeactivateAgentResponseDTO,
  PayCommissionsResponseDTO,
  UpdateAgentRequestDTO,
} from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { unusablePasswordHash } from "../../lib/password";
import { HttpError } from "../../middleware/errorHandler";
import { email } from "../../integrations/email";
import { emailTemplates } from "../../integrations/emailTemplates";
import { findAgentForZip } from "../agent/assignment";
import { getCommissions } from "../agent/agent.service";
import { emptyCommissionTotals, loadAgentPerformance } from "../agent/performance";
import { issuePasswordResetToken, RESET_TOKEN_TTL_HOURS } from "../security/passwordReset.service";

type AgentUser = User & { agentProfile: AgentProfile | null };

const EMPTY_PERFORMANCE: AgentPerformanceDTO = {
  applicationsHandled: 0,
  openApplications: 0,
  approved: 0,
  rejected: 0,
  approvalRate: null,
  commissions: emptyCommissionTotals(),
};

const dateOnly = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;

export function toAdminAgentDTO(u: AgentUser, performance: AgentPerformanceDTO | undefined): AdminAgentDTO {
  const p = u.agentProfile;
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    licenseNumber: p?.licenseNumber ?? "",
    npn: p?.npn ?? null,
    licenseExpiresAt: dateOnly(p?.licenseExpiresAt ?? null),
    regions: p?.regions ?? [],
    commissionRateBps: p?.commissionRateBps ?? null,
    // Active means both the login and the assignment pool are on.
    isActive: u.isActive && (p?.isActive ?? false),
    deactivatedAt: p?.deactivatedAt?.toISOString() ?? null,
    twoFactorEnabled: u.twoFactorEnabled,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    performance: performance ?? structuredClone(EMPTY_PERFORMANCE),
  };
}

export interface AgentListFilters {
  search?: string;
  status: "active" | "inactive" | "all";
  region?: string;
}

// Pure so it can be unit-tested.
export function buildAgentWhere(f: AgentListFilters): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { role: "AGENT", deletedAt: null };
  const profile: Prisma.AgentProfileWhereInput = {};
  if (f.status === "active") {
    where.isActive = true;
    profile.isActive = true;
  } else if (f.status === "inactive") {
    where.OR = [{ isActive: false }, { agentProfile: { isActive: false } }];
  }
  if (f.region) profile.regions = { has: f.region };
  if (Object.keys(profile).length) where.agentProfile = profile;
  if (f.search) {
    where.AND = [
      {
        OR: [
          { email: { contains: f.search, mode: "insensitive" } },
          { firstName: { contains: f.search, mode: "insensitive" } },
          { lastName: { contains: f.search, mode: "insensitive" } },
          { agentProfile: { licenseNumber: { contains: f.search, mode: "insensitive" } } },
        ],
      },
    ];
  }
  return where;
}

export async function listAgents(f: AgentListFilters): Promise<AdminAgentListResponseDTO> {
  const [agents, active, total] = await Promise.all([
    prisma.user.findMany({
      where: buildAgentWhere(f),
      include: { agentProfile: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: 500,
    }),
    prisma.user.count({ where: buildAgentWhere({ status: "active" }) }),
    prisma.user.count({ where: buildAgentWhere({ status: "all" }) }),
  ]);
  const performance = await loadAgentPerformance(agents.map((a) => a.id));
  const dtos = agents.map((a) => toAdminAgentDTO(a, performance.get(a.id)));

  const commissions = emptyCommissionTotals();
  for (const a of dtos) {
    for (const [status, cents] of Object.entries(a.performance.commissions)) {
      commissions[status as keyof typeof commissions] += cents;
    }
  }
  return { total: dtos.length, agents: dtos, summary: { active, inactive: total - active, commissions } };
}

async function findAgent(id: string): Promise<AgentUser> {
  const agent = await prisma.user.findFirst({ where: { id, role: "AGENT", deletedAt: null }, include: { agentProfile: true } });
  if (!agent) throw new HttpError(404, "Agent not found");
  return agent;
}

async function toDTO(agent: AgentUser): Promise<AdminAgentDTO> {
  const performance = await loadAgentPerformance([agent.id]);
  return toAdminAgentDTO(agent, performance.get(agent.id));
}

export async function getAgentDetail(id: string): Promise<AdminAgentDetailDTO> {
  const agent = await findAgent(id);
  const [base, recent, commissions] = await Promise.all([
    toDTO(agent),
    prisma.application.findMany({
      where: { agentId: id },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 10,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        submissionStatus: true,
        updatedAt: true,
        plan: { select: { name: true } },
      },
    }),
    getCommissions(id, 1, 50),
  ]);
  return {
    ...base,
    recentApplications: recent.map((a) => ({
      id: a.id,
      applicantName: `${a.firstName} ${a.lastName}`,
      planName: a.plan.name,
      status: a.status,
      submissionStatus: a.submissionStatus,
      updatedAt: a.updatedAt.toISOString(),
    })),
    commissionHistory: commissions.commissions,
  };
}

const toDate = (s: string | undefined | null) => (s ? new Date(`${s}T00:00:00Z`) : null);

export async function createAgent(actorUserId: string, input: CreateAgentRequestDTO, req: Request): Promise<AdminAgentDTO> {
  const existing = await prisma.user.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } } });
  if (existing) throw new HttpError(409, "An account with this email already exists");

  // No usable password yet: the agent sets one from the invite email.
  const agent = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await unusablePasswordHash(),
      role: "AGENT",
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      agentProfile: {
        create: {
          licenseNumber: input.licenseNumber,
          npn: input.npn ?? null,
          licenseExpiresAt: toDate(input.licenseExpiresAt),
          regions: input.regions,
          commissionRateBps: input.commissionRateBps ?? null,
        },
      },
    },
    include: { agentProfile: true },
  });

  const { token } = await issuePasswordResetToken(agent, "INVITE", actorUserId);
  await email.send({
    to: agent.email,
    ...emailTemplates.agentInvite({ firstName: agent.firstName, token, expiresInHours: RESET_TOKEN_TTL_HOURS.INVITE }),
  });
  await recordAuditEvent({
    actorUserId,
    action: "admin.agent.create",
    entityType: "User",
    entityId: agent.id,
    metadata: { regions: input.regions, commissionRateBps: input.commissionRateBps ?? null },
    req,
  });
  return toAdminAgentDTO(agent, undefined);
}

export async function updateAgent(
  actorUserId: string,
  id: string,
  input: UpdateAgentRequestDTO,
  req: Request,
): Promise<AdminAgentDTO> {
  const agent = await findAgent(id);
  const userData: Prisma.UserUpdateInput = {};
  if (input.firstName !== undefined) userData.firstName = input.firstName;
  if (input.lastName !== undefined) userData.lastName = input.lastName;
  if (input.phone !== undefined) userData.phone = input.phone || null;

  const profileData: Prisma.AgentProfileUncheckedUpdateInput = {};
  if (input.licenseNumber !== undefined) profileData.licenseNumber = input.licenseNumber;
  if (input.npn !== undefined) profileData.npn = input.npn || null;
  if (input.licenseExpiresAt !== undefined) profileData.licenseExpiresAt = toDate(input.licenseExpiresAt);
  if (input.regions !== undefined) profileData.regions = input.regions;
  if (input.commissionRateBps !== undefined) profileData.commissionRateBps = input.commissionRateBps;

  const changed = [...Object.keys(userData), ...Object.keys(profileData)];
  if (changed.length === 0) throw new HttpError(400, "Nothing to update");

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: userData }),
    agent.agentProfile
      ? prisma.agentProfile.update({ where: { userId: id }, data: profileData })
      : prisma.agentProfile.create({
          data: {
            userId: id,
            licenseNumber: input.licenseNumber ?? "",
            regions: input.regions ?? [],
            npn: input.npn || null,
            licenseExpiresAt: toDate(input.licenseExpiresAt),
            commissionRateBps: input.commissionRateBps ?? null,
          },
        }),
  ]);
  await recordAuditEvent({
    actorUserId,
    action: "admin.agent.update",
    entityType: "User",
    entityId: id,
    // Field names only, plus the business-relevant new values.
    metadata: {
      fields: changed,
      ...(input.regions !== undefined ? { regions: input.regions } : {}),
      ...(input.commissionRateBps !== undefined
        ? { commissionRateBps: input.commissionRateBps, previousCommissionRateBps: agent.agentProfile?.commissionRateBps ?? null }
        : {}),
    },
    req,
  });
  return toDTO(await findAgent(id));
}

// Work an agent hasn't sent to a carrier yet carries no commission, so it can
// move to another agent cleanly. Submitted work stays put (its commission is
// booked to this agent) and is finished by admin review.
const REASSIGNABLE: Prisma.ApplicationWhereInput = {
  OR: [{ status: "DRAFT" }, { status: "REJECTED", reviewedAt: null }],
  submissionStatus: { not: "PENDING" },
};

export async function deactivateAgent(
  actorUserId: string,
  id: string,
  opts: { reassignOpen: boolean; reason?: string },
  req: Request,
): Promise<DeactivateAgentResponseDTO> {
  const agent = await findAgent(id);
  if (!agent.isActive && agent.agentProfile && !agent.agentProfile.isActive) {
    throw new HttpError(409, "This agent is already deactivated");
  }

  const now = new Date();
  // History (applications, commissions, audit) is kept; only the login and
  // the assignment pool are switched off.
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { isActive: false, suspendedAt: now, suspensionReason: opts.reason || "Agent deactivated" },
    }),
    prisma.agentProfile.updateMany({ where: { userId: id }, data: { isActive: false, deactivatedAt: now } }),
    prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } }),
  ]);

  let reassigned = 0;
  let unassigned = 0;
  if (opts.reassignOpen) {
    const open = await prisma.application.findMany({
      where: { agentId: id, ...REASSIGNABLE },
      select: { id: true, zipCode: true },
    });
    for (const app of open) {
      // findAgentForZip only considers active agents, so this agent is excluded.
      const nextAgentId = app.zipCode ? await findAgentForZip(app.zipCode) : null;
      await prisma.application.update({ where: { id: app.id }, data: { agentId: nextAgentId } });
      if (nextAgentId) reassigned += 1;
      else unassigned += 1;
    }
  }

  await recordAuditEvent({
    actorUserId,
    action: "admin.agent.deactivate",
    entityType: "User",
    entityId: id,
    metadata: { reason: opts.reason ?? null, reassigned, unassigned },
    req,
  });
  return { agent: await toDTO(await findAgent(id)), reassigned, unassigned };
}

export async function reactivateAgent(actorUserId: string, id: string, req: Request): Promise<AdminAgentDTO> {
  const agent = await findAgent(id);
  if (agent.isActive && agent.agentProfile?.isActive) throw new HttpError(409, "This agent is already active");
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { isActive: true, suspendedAt: null, suspensionReason: null } }),
    prisma.agentProfile.updateMany({ where: { userId: id }, data: { isActive: true, deactivatedAt: null } }),
  ]);
  await recordAuditEvent({ actorUserId, action: "admin.agent.reactivate", entityType: "User", entityId: id, req });
  return toDTO(await findAgent(id));
}

// Finance marks EARNED commissions as paid out. Only EARNED rows move, so a
// PENDING or VOID commission can never be paid by accident.
export async function payCommissions(
  actorUserId: string,
  agentId: string,
  commissionIds: string[] | undefined,
  req: Request,
): Promise<PayCommissionsResponseDTO> {
  await findAgent(agentId);
  const where: Prisma.CommissionWhereInput = {
    agentId,
    status: "EARNED",
    ...(commissionIds ? { id: { in: commissionIds } } : {}),
  };
  const result = await prisma.$transaction(async (tx) => {
    const payable = await tx.commission.findMany({ where, select: { id: true, amountCents: true } });
    if (payable.length === 0) return { paidCount: 0, paidCents: 0 };
    const updated = await tx.commission.updateMany({
      where: { id: { in: payable.map((c) => c.id) }, status: "EARNED" },
      data: { status: "PAID", paidAt: new Date() },
    });
    if (updated.count !== payable.length) throw new HttpError(409, "Commissions changed while paying; try again");
    return { paidCount: payable.length, paidCents: payable.reduce((sum, c) => sum + c.amountCents, 0) };
  });
  if (result.paidCount === 0) throw new HttpError(409, "No earned commissions to pay");

  await recordAuditEvent({
    actorUserId,
    action: "admin.commission.pay",
    entityType: "User",
    entityId: agentId,
    metadata: { ...result, commissionIds: commissionIds ?? null },
    req,
  });
  return result;
}
