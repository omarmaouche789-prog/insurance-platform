import type { Request } from "express";
import type { ApplicationStatus as DbApplicationStatus, Prisma } from "@prisma/client";
import type {
  AgentApplicationDTO,
  AgentApplicationListResponseDTO,
  ApplicationStatus,
  CommissionStatus,
  CommissionSummaryResponseDTO,
  RequestDocumentsRequestDTO,
  SubmissionStatus,
} from "@insurance/shared";
import { APPLICATION_STATUSES, COMMISSION_STATUSES, DOCUMENT_TYPE_LABELS } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { HttpError } from "../../middleware/errorHandler";
import { documentStorage } from "../../integrations/documentStorage";
import { notifications } from "../../integrations/notifications";
import { FULL_INCLUDE, toApplicationDTO, type FullApplication } from "../applications/applications.service";
import { sendToCarrier } from "../applications/carrierSubmit";
import { resubmitBlocker } from "../applications/applications.validation";
import { renderApplicationPdf } from "./applicationPdf";

export interface AgentApplicationFilters {
  statuses?: ApplicationStatus[];
  submissionStatuses?: SubmissionStatus[];
  search?: string;
  page: number;
  pageSize: number;
}

function blockerFor(app: FullApplication): string | null {
  return resubmitBlocker({
    status: app.status,
    submissionStatus: app.submissionStatus,
    documents: app.documents,
    planAvailable: app.plan.isActive && app.plan.carrier.isActive,
  });
}

export function toAgentApplicationDTO(app: FullApplication): AgentApplicationDTO {
  return {
    ...toApplicationDTO(app),
    applicant: { email: app.user.email, phone: app.user.phone },
    canResubmit: blockerFor(app) === null,
  };
}

// Agents only ever see applications assigned to them; anything else is a 404.
async function findAssigned(agentId: string, id: string): Promise<FullApplication> {
  const app = await prisma.application.findFirst({ where: { id, agentId }, include: FULL_INCLUDE });
  if (!app) throw new HttpError(404, "Application not found");
  return app;
}

// Pure so filter → query mapping can be unit-tested.
export function buildAgentApplicationWhere(agentId: string, f: AgentApplicationFilters): Prisma.ApplicationWhereInput {
  const where: Prisma.ApplicationWhereInput = { agentId };
  if (f.statuses?.length) where.status = { in: f.statuses };
  if (f.submissionStatuses?.length) where.submissionStatus = { in: f.submissionStatuses };
  if (f.search) {
    where.OR = [
      { firstName: { contains: f.search, mode: "insensitive" } },
      { lastName: { contains: f.search, mode: "insensitive" } },
      { carrierReference: { contains: f.search, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listAssignedApplications(
  agentId: string,
  filters: AgentApplicationFilters,
): Promise<AgentApplicationListResponseDTO> {
  const where = buildAgentApplicationWhere(agentId, filters);
  const [total, apps, grouped] = await Promise.all([
    prisma.application.count({ where }),
    prisma.application.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        plan: { include: { carrier: true } },
        _count: { select: { documentRequests: { where: { resolvedAt: null } } } },
      },
    }),
    prisma.application.groupBy({ by: ["status"], where: { agentId }, _count: { _all: true } }),
  ]);

  const statusCounts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  for (const g of grouped) statusCounts[g.status as DbApplicationStatus] = g._count._all;

  return {
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    statusCounts,
    applications: apps.map((a) => ({
      id: a.id,
      applicantName: `${a.firstName} ${a.lastName}`,
      planName: a.plan.name,
      carrierName: a.plan.carrier.name,
      monthlyPremiumCents: a.plan.monthlyPremiumCents,
      status: a.status,
      submissionStatus: a.submissionStatus,
      submissionAttempts: a.submissionAttempts,
      openDocumentRequests: a._count.documentRequests,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      updatedAt: a.updatedAt.toISOString(),
    })),
  };
}

// Viewing an application exposes PII/PHI to the agent, so every view is
// written to the audit log (HIPAA-style access logging).
export async function getAssignedApplication(agentId: string, id: string, req: Request): Promise<AgentApplicationDTO> {
  const app = await findAssigned(agentId, id);
  await recordAuditEvent({ actorUserId: agentId, action: "agent.application.view", entityType: "Application", entityId: id, req });
  return toAgentApplicationDTO(app);
}

export async function requestDocuments(
  agentId: string,
  id: string,
  input: RequestDocumentsRequestDTO,
  req: Request,
): Promise<AgentApplicationDTO> {
  const app = await findAssigned(agentId, id);
  if (app.reviewedAt) throw new HttpError(409, "An admin has already decided this application");
  if (app.submissionStatus === "PENDING") throw new HttpError(409, "This application is being submitted right now");

  await prisma.documentRequest.create({
    data: { applicationId: id, agentId, message: input.message, requestedTypes: input.requestedTypes },
  });
  // The message itself stays in the portal; email only says there's something to see.
  await notifications.send({
    to: app.user.email,
    subject: "Your agent needs documents for your application",
    body: `Your agent has requested: ${input.requestedTypes.map((t) => DOCUMENT_TYPE_LABELS[t]).join(", ")}. Sign in to your account to upload them.`,
  });
  await recordAuditEvent({
    actorUserId: agentId,
    action: "agent.application.request_documents",
    entityType: "Application",
    entityId: id,
    metadata: { requestedTypes: input.requestedTypes },
    req,
  });

  return toAgentApplicationDTO(await findAssigned(agentId, id));
}

export async function resubmitApplication(agentId: string, id: string, req: Request): Promise<AgentApplicationDTO> {
  const app = await findAssigned(agentId, id);
  const blocker = blockerFor(app);
  if (blocker) throw new HttpError(409, blocker);

  await sendToCarrier(app, {
    actorUserId: agentId,
    req,
    auditAction: "application.resubmit",
    claimWhere: {
      agentId,
      OR: [
        { status: "REJECTED", submissionStatus: { not: "PENDING" } },
        { status: "DRAFT", submissionStatus: "FAILED" },
      ],
    },
  });
  return toAgentApplicationDTO(await findAssigned(agentId, id));
}

export async function getAssignedDocument(agentId: string, id: string, documentId: string, req: Request) {
  const app = await findAssigned(agentId, id);
  const document = app.documents.find((d) => d.id === documentId);
  if (!document) throw new HttpError(404, "Document not found");

  const data = await documentStorage.get(document.storageKey);
  await recordAuditEvent({
    actorUserId: agentId,
    action: "agent.document.download",
    entityType: "Application",
    entityId: id,
    metadata: { documentId, type: document.type },
    req,
  });
  return { document, data };
}

export async function getApplicationPdf(agentId: string, id: string, req: Request): Promise<Buffer> {
  const app = await findAssigned(agentId, id);
  await recordAuditEvent({ actorUserId: agentId, action: "agent.application.pdf", entityType: "Application", entityId: id, req });
  return renderApplicationPdf(toAgentApplicationDTO(app));
}

export async function getCommissions(agentId: string, page: number, pageSize: number): Promise<CommissionSummaryResponseDTO> {
  const where = { agentId };
  const [total, rows, grouped] = await Promise.all([
    prisma.commission.count({ where }),
    prisma.commission.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        carrier: { select: { name: true } },
        application: { select: { firstName: true, lastName: true, plan: { select: { name: true } } } },
      },
    }),
    prisma.commission.groupBy({ by: ["status"], where, _sum: { amountCents: true } }),
  ]);

  const totals = Object.fromEntries(COMMISSION_STATUSES.map((s) => [s, 0])) as Record<CommissionStatus, number>;
  for (const g of grouped) totals[g.status] = g._sum.amountCents ?? 0;

  return {
    totals,
    total,
    page,
    pageSize,
    commissions: rows.map((c) => ({
      id: c.id,
      applicationId: c.applicationId,
      applicantName: `${c.application.firstName} ${c.application.lastName}`,
      planName: c.application.plan.name,
      carrierName: c.carrier.name,
      premiumCents: c.premiumCents,
      rateBps: c.rateBps,
      amountCents: c.amountCents,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}
