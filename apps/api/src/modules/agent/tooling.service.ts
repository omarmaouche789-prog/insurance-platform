import type { Request } from "express";
import type { FollowUp, Prisma } from "@prisma/client";
import type {
  AgentSelfPerformanceResponseDTO,
  ApplicationNoteDTO,
  FollowUpDTO,
  FollowUpFilter,
  FollowUpListResponseDTO,
  ScheduleFollowUpRequestDTO,
} from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { HttpError } from "../../middleware/errorHandler";
import { loadAgentPerformance } from "./performance";

// Agent productivity tooling: follow-up reminders, internal notes, and the
// agent's own performance view. Every lookup is scoped to the calling agent,
// so another agent's rows are 404s.

async function assertAssigned(agentId: string, applicationId: string) {
  const app = await prisma.application.findFirst({
    where: { id: applicationId, agentId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!app) throw new HttpError(404, "Application not found");
  return app;
}

type FollowUpWithApp = FollowUp & { application: { firstName: string; lastName: string } };

const FOLLOW_UP_INCLUDE = { application: { select: { firstName: true, lastName: true } } } as const;

export function toFollowUpDTO(f: FollowUpWithApp): FollowUpDTO {
  return {
    id: f.id,
    applicationId: f.applicationId,
    applicantName: `${f.application.firstName} ${f.application.lastName}`,
    dueAt: f.dueAt.toISOString(),
    note: f.note,
    completedAt: f.completedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
  };
}

export async function scheduleFollowUp(
  agentId: string,
  applicationId: string,
  input: ScheduleFollowUpRequestDTO,
  req: Request,
): Promise<FollowUpDTO> {
  await assertAssigned(agentId, applicationId);
  const followUp = await prisma.followUp.create({
    data: { applicationId, agentId, dueAt: new Date(input.dueAt), note: input.note },
    include: FOLLOW_UP_INCLUDE,
  });
  await recordAuditEvent({
    actorUserId: agentId,
    action: "agent.followup.schedule",
    entityType: "Application",
    entityId: applicationId,
    metadata: { followUpId: followUp.id, dueAt: followUp.dueAt.toISOString() },
    req,
  });
  return toFollowUpDTO(followUp);
}

export async function listApplicationFollowUps(agentId: string, applicationId: string): Promise<FollowUpDTO[]> {
  await assertAssigned(agentId, applicationId);
  const rows = await prisma.followUp.findMany({
    where: { applicationId, agentId },
    orderBy: [{ completedAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }],
    include: FOLLOW_UP_INCLUDE,
  });
  return rows.map(toFollowUpDTO);
}

// Pure so the filter → query mapping can be unit-tested.
export function followUpWhere(agentId: string, filter: FollowUpFilter, now: Date): Prisma.FollowUpWhereInput {
  switch (filter) {
    case "upcoming":
      return { agentId, completedAt: null, dueAt: { gte: now } };
    case "overdue":
      return { agentId, completedAt: null, dueAt: { lt: now } };
    case "completed":
      return { agentId, completedAt: { not: null } };
    case "all":
      return { agentId };
  }
}

export async function listFollowUps(agentId: string, filter: FollowUpFilter): Promise<FollowUpListResponseDTO> {
  const now = new Date();
  const [rows, overdue, upcoming, completed] = await Promise.all([
    prisma.followUp.findMany({
      where: followUpWhere(agentId, filter, now),
      orderBy: filter === "completed" ? [{ completedAt: "desc" }] : [{ dueAt: "asc" }],
      take: 200,
      include: FOLLOW_UP_INCLUDE,
    }),
    prisma.followUp.count({ where: followUpWhere(agentId, "overdue", now) }),
    prisma.followUp.count({ where: followUpWhere(agentId, "upcoming", now) }),
    prisma.followUp.count({ where: followUpWhere(agentId, "completed", now) }),
  ]);
  return { followUps: rows.map(toFollowUpDTO), counts: { overdue, upcoming, completed } };
}

export async function completeFollowUp(agentId: string, id: string, req: Request): Promise<FollowUpDTO> {
  const updated = await prisma.followUp.updateMany({
    where: { id, agentId, completedAt: null },
    data: { completedAt: new Date() },
  });
  const row = await prisma.followUp.findFirst({ where: { id, agentId }, include: FOLLOW_UP_INCLUDE });
  if (!row) throw new HttpError(404, "Follow-up not found");
  if (updated.count === 0) throw new HttpError(409, "This follow-up is already complete");
  await recordAuditEvent({
    actorUserId: agentId,
    action: "agent.followup.complete",
    entityType: "Application",
    entityId: row.applicationId,
    metadata: { followUpId: id },
    req,
  });
  return toFollowUpDTO(row);
}

export async function deleteFollowUp(agentId: string, id: string, req: Request): Promise<void> {
  const row = await prisma.followUp.findFirst({ where: { id, agentId } });
  if (!row) throw new HttpError(404, "Follow-up not found");
  await prisma.followUp.delete({ where: { id } });
  await recordAuditEvent({
    actorUserId: agentId,
    action: "agent.followup.delete",
    entityType: "Application",
    entityId: row.applicationId,
    metadata: { followUpId: id },
    req,
  });
}

// ─── Internal notes ──────────────────────────────────────────────────────────

const NOTE_INCLUDE = { author: { select: { id: true, firstName: true, lastName: true, role: true } } } as const;

export function toNoteDTO(n: Prisma.ApplicationNoteGetPayload<{ include: typeof NOTE_INCLUDE }>): ApplicationNoteDTO {
  return { id: n.id, body: n.body, author: n.author, createdAt: n.createdAt.toISOString() };
}

export async function listNotesForApplication(applicationId: string): Promise<ApplicationNoteDTO[]> {
  const rows = await prisma.applicationNote.findMany({
    where: { applicationId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: NOTE_INCLUDE,
  });
  return rows.map(toNoteDTO);
}

export async function listNotes(agentId: string, applicationId: string): Promise<ApplicationNoteDTO[]> {
  await assertAssigned(agentId, applicationId);
  return listNotesForApplication(applicationId);
}

export async function addNote(agentId: string, applicationId: string, body: string, req: Request): Promise<ApplicationNoteDTO> {
  await assertAssigned(agentId, applicationId);
  const note = await prisma.applicationNote.create({
    data: { applicationId, authorId: agentId, body },
    include: NOTE_INCLUDE,
  });
  // The note text itself can hold PHI, so the audit row records only that one was written.
  await recordAuditEvent({
    actorUserId: agentId,
    action: "agent.application.note",
    entityType: "Application",
    entityId: applicationId,
    metadata: { noteId: note.id },
    req,
  });
  return toNoteDTO(note);
}

// ─── Agent's own performance ─────────────────────────────────────────────────

const MONTHS_OF_HISTORY = 6;

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

// The last N calendar months (UTC), oldest first, ending with the current one.
export function recentMonths(now: Date, count = MONTHS_OF_HISTORY): string[] {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return months;
}

export async function getOwnPerformance(agentId: string): Promise<AgentSelfPerformanceResponseDTO> {
  const now = new Date();
  const months = recentMonths(now);
  const since = new Date(`${months[0]}-01T00:00:00Z`);
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [performanceMap, created, decided, commissions, openDocumentRequests, overdue, dueToday, upcoming] =
    await Promise.all([
      loadAgentPerformance([agentId]),
      prisma.application.findMany({ where: { agentId, createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.application.findMany({
        where: { agentId, reviewedAt: { gte: since }, status: { in: ["APPROVED", "REJECTED"] } },
        select: { status: true, reviewedAt: true },
      }),
      prisma.commission.findMany({
        where: { agentId, createdAt: { gte: since }, status: { not: "VOID" } },
        select: { createdAt: true, amountCents: true },
      }),
      prisma.documentRequest.count({ where: { agentId, resolvedAt: null } }),
      prisma.followUp.count({ where: { agentId, completedAt: null, dueAt: { lt: now } } }),
      prisma.followUp.count({ where: { agentId, completedAt: null, dueAt: { gte: now, lt: endOfToday } } }),
      prisma.followUp.count({ where: { agentId, completedAt: null, dueAt: { gte: endOfToday } } }),
    ]);

  const monthly = new Map(months.map((m) => [m, { month: m, applications: 0, approved: 0, rejected: 0, commissionCents: 0 }]));
  for (const a of created) {
    const row = monthly.get(monthKey(a.createdAt));
    if (row) row.applications += 1;
  }
  for (const a of decided) {
    const row = a.reviewedAt ? monthly.get(monthKey(a.reviewedAt)) : undefined;
    if (!row) continue;
    if (a.status === "APPROVED") row.approved += 1;
    else row.rejected += 1;
  }
  for (const c of commissions) {
    const row = monthly.get(monthKey(c.createdAt));
    if (row) row.commissionCents += c.amountCents;
  }

  return {
    performance: performanceMap.get(agentId)!,
    monthly: [...monthly.values()],
    openDocumentRequests,
    followUps: { overdue, dueToday, upcoming },
  };
}
