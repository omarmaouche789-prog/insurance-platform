import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import type {
  AdminApplicationDTO,
  AdminPendingResponseDTO,
  AdminQueueItemDTO,
  AdminQueueResponseDTO,
  ApprovalMetricsDTO,
  BulkDecisionResponseDTO,
} from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { HttpError } from "../../middleware/errorHandler";
import { carrierSubmission } from "../../integrations/carrierSubmission";
import { documentStorage } from "../../integrations/documentStorage";
import { email } from "../../integrations/email";
import { emailTemplates } from "../../integrations/emailTemplates";
import { CarrierSubmissionError } from "../../integrations/carrierSubmission";
import { recordCarrierResponse } from "../applications/carrierSubmit";
import { FULL_INCLUDE, type FullApplication } from "../applications/applications.service";
import { isAwaitingReview } from "../applications/applications.validation";
import { toAgentApplicationDTO } from "../agent/agent.service";
import { buildAdminQueueQuery, computeApprovalMetrics, type AdminQueueFilters } from "./review.metrics";

export const PENDING_LIST_CAP = 200;

// What "pending admin review" means; also the precondition every decision
// re-checks atomically.
const AWAITING_REVIEW = { status: "SUBMITTED", submissionStatus: "ACCEPTED" } as const;

const QUEUE_INCLUDE = {
  plan: { include: { carrier: true } },
  agent: { select: { firstName: true, lastName: true } },
} satisfies Prisma.ApplicationInclude;

type QueueRow = Prisma.ApplicationGetPayload<{ include: typeof QUEUE_INCLUDE }>;

function toQueueItem(a: QueueRow): AdminQueueItemDTO {
  return {
    id: a.id,
    applicantName: `${a.firstName} ${a.lastName}`,
    agentName: a.agent ? `${a.agent.firstName} ${a.agent.lastName}` : null,
    planName: a.plan.name,
    carrierName: a.plan.carrier.name,
    monthlyPremiumCents: a.plan.monthlyPremiumCents,
    status: a.status,
    submissionStatus: a.submissionStatus,
    carrierReference: a.carrierReference,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    reviewedAt: a.reviewedAt?.toISOString() ?? null,
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function toAdminApplicationDTO(app: FullApplication): AdminApplicationDTO {
  return {
    ...toAgentApplicationDTO(app),
    reviewerName: app.reviewedBy ? `${app.reviewedBy.firstName} ${app.reviewedBy.lastName}` : null,
    reviewNotes: app.reviewNotes,
    commission: app.commission,
    awaitingDecision: isAwaitingReview(app),
  };
}

async function findApplication(id: string): Promise<FullApplication> {
  const app = await prisma.application.findUnique({ where: { id }, include: FULL_INCLUDE });
  if (!app) throw new HttpError(404, "Application not found");
  return app;
}

export async function listPending(): Promise<AdminPendingResponseDTO> {
  const [total, rows] = await Promise.all([
    prisma.application.count({ where: AWAITING_REVIEW }),
    prisma.application.findMany({
      where: AWAITING_REVIEW,
      orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
      take: PENDING_LIST_CAP,
      include: QUEUE_INCLUDE,
    }),
  ]);
  return { total, items: rows.map(toQueueItem) };
}

export async function listQueue(filters: AdminQueueFilters): Promise<AdminQueueResponseDTO> {
  const { where, orderBy } = buildAdminQueueQuery(filters);
  const [total, rows] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: QUEUE_INCLUDE,
    }),
  ]);
  return { total, page: filters.page, pageSize: filters.pageSize, items: rows.map(toQueueItem) };
}

export async function getApplicationForAdmin(adminId: string, id: string, req: Request): Promise<AdminApplicationDTO> {
  const app = await findApplication(id);
  await recordAuditEvent({ actorUserId: adminId, action: "admin.application.view", entityType: "Application", entityId: id, req });
  return toAdminApplicationDTO(app);
}

export async function getDocumentForAdmin(adminId: string, id: string, documentId: string, req: Request) {
  const app = await findApplication(id);
  const document = app.documents.find((d) => d.id === documentId);
  if (!document) throw new HttpError(404, "Document not found");
  const data = await documentStorage.get(document.storageKey);
  await recordAuditEvent({
    actorUserId: adminId,
    action: "admin.document.download",
    entityType: "Application",
    entityId: id,
    metadata: { documentId, type: document.type },
    req,
  });
  return { document, data };
}

// Moves an application out of review and settles its commission in one
// transaction. The status check is part of the UPDATE, so of two concurrent
// decisions exactly one wins and the other gets a 409.
async function recordDecision(
  id: string,
  adminId: string,
  decision: "APPROVED" | "REJECTED",
  notes: string | null,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.application.updateMany({
      where: { id, ...AWAITING_REVIEW },
      data: { status: decision, reviewedAt: new Date(), reviewedById: adminId, reviewNotes: notes },
    });
    if (claimed.count === 0) throw new HttpError(409, "This application isn't awaiting review");

    const settled = await tx.commission.updateMany({
      where: { applicationId: id, status: "PENDING" },
      data: { status: decision === "APPROVED" ? "EARNED" : "VOID" },
    });
    return settled.count;
  });
}

export async function approveApplication(
  adminId: string,
  id: string,
  notes: string | undefined,
  req: Request,
): Promise<AdminApplicationDTO> {
  const app = await findApplication(id);
  if (!isAwaitingReview(app)) throw new HttpError(409, "This application isn't awaiting review");

  const commissionsEarned = await recordDecision(id, adminId, "APPROVED", notes || null);

  // Side effects run after commit. The carrier adapter already retries
  // transient failures; if the notice still fails the approval stands and the
  // failure is in the audit trail (carrier.response ERROR) for follow-up.
  let carrierNotified = true;
  const carrierCode = app.plan.carrier.code;
  try {
    const meta = await carrierSubmission.notifyDecision({
      carrierCode,
      carrierReference: app.carrierReference,
      applicationId: id,
      decision: "APPROVED",
    });
    await recordCarrierResponse(id, adminId, req, { operation: "decision", carrierCode, outcome: "NOTIFIED", meta });
  } catch (err) {
    carrierNotified = false;
    console.error(`Carrier approval notice failed for ${id}:`, err instanceof Error ? err.message : err);
    const known = err instanceof CarrierSubmissionError ? err : null;
    await recordCarrierResponse(id, adminId, req, {
      operation: "decision",
      carrierCode,
      outcome: "ERROR",
      message: known?.message ?? "Unexpected error",
      retryable: known?.retryable ?? true,
      meta: known?.meta,
    });
  }
  await email.send({
    to: app.user.email,
    ...emailTemplates.approval({ firstName: app.firstName, applicationId: id, confirmationNumber: app.carrierReference }),
  });

  await recordAuditEvent({
    actorUserId: adminId,
    action: "admin.application.approve",
    entityType: "Application",
    entityId: id,
    metadata: { notesProvided: Boolean(notes), commissionsEarned, carrierNotified },
    req,
  });
  return toAdminApplicationDTO(await findApplication(id));
}

export async function rejectApplication(
  adminId: string,
  id: string,
  reason: string,
  req: Request,
): Promise<AdminApplicationDTO> {
  const app = await findApplication(id);
  if (!isAwaitingReview(app)) throw new HttpError(409, "This application isn't awaiting review");

  const commissionsVoided = await recordDecision(id, adminId, "REJECTED", reason);

  // The reason stays in the portal; emails only say there's an update.
  if (app.agent) {
    await email.send({
      to: app.agent.email,
      ...emailTemplates.rejectionToAgent({
        agentFirstName: app.agent.firstName,
        applicantName: `${app.firstName} ${app.lastName}`,
        applicationId: id,
      }),
    });
  }
  await email.send({ to: app.user.email, ...emailTemplates.rejectionToApplicant({ firstName: app.firstName, applicationId: id }) });

  await recordAuditEvent({
    actorUserId: adminId,
    action: "admin.application.reject",
    entityType: "Application",
    entityId: id,
    metadata: { commissionsVoided },
    req,
  });
  return toAdminApplicationDTO(await findApplication(id));
}

// Each id is decided independently so one bad id doesn't block the rest;
// sequential to keep notification/audit ordering predictable.
export async function bulkDecide(
  adminId: string,
  action: "approve" | "reject",
  ids: string[],
  notes: string | undefined,
  req: Request,
): Promise<BulkDecisionResponseDTO> {
  const results: BulkDecisionResponseDTO["results"] = [];
  for (const id of ids) {
    try {
      if (action === "approve") await approveApplication(adminId, id, notes, req);
      else await rejectApplication(adminId, id, notes!, req);
      results.push({ id, ok: true });
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(`Bulk ${action} failed for ${id}`, err);
      results.push({ id, ok: false, error: err instanceof HttpError ? err.message : "Internal error" });
    }
  }
  await recordAuditEvent({
    actorUserId: adminId,
    action: `admin.application.bulk_${action}`,
    entityType: "Application",
    metadata: { requested: ids.length, succeeded: results.filter((r) => r.ok).length },
    req,
  });
  return { results };
}

export async function getApprovalMetrics(windowDays: number): Promise<ApprovalMetricsDTO> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const [pendingCount, oldest, decided] = await Promise.all([
    prisma.application.count({ where: AWAITING_REVIEW }),
    prisma.application.findFirst({
      where: AWAITING_REVIEW,
      orderBy: { submittedAt: "asc" },
      select: { submittedAt: true },
    }),
    prisma.application.findMany({
      where: { reviewedAt: { gte: since }, status: { in: ["APPROVED", "REJECTED"] } },
      select: { status: true, submittedAt: true, reviewedAt: true },
    }),
  ]);

  return {
    windowDays,
    pendingCount,
    oldestPendingSubmittedAt: oldest?.submittedAt?.toISOString() ?? null,
    ...computeApprovalMetrics(
      decided.map((d) => ({
        status: d.status as "APPROVED" | "REJECTED",
        submittedAt: d.submittedAt,
        reviewedAt: d.reviewedAt!,
      })),
    ),
  };
}
