import crypto from "node:crypto";
import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import type {
  ApplicationDTO,
  ApplicationSummaryDTO,
  CreateApplicationRequestDTO,
  DocumentType,
  HealthInfoDTO,
  UpdateApplicationRequestDTO,
} from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { decryptJson, encryptField, encryptJson } from "../../lib/fieldCrypto";
import { HttpError } from "../../middleware/errorHandler";
import { documentStorage } from "../../integrations/documentStorage";
import { toPlanDTO } from "../plans/plans.service";
import { findAgentForZip } from "../agent/assignment";
import { sendToCarrier } from "./carrierSubmit";
import {
  extensionForMime,
  isEditable,
  sniffDocumentMime,
  STALE_PENDING_MS,
  submissionBlocker,
  uploadBlocker,
} from "./applications.validation";

// Everything needed to render an ApplicationDTO (and to submit it). Shared
// with the agent module so both views are built from the same shape.
export const FULL_INCLUDE = {
  plan: { include: { carrier: true } },
  documents: { orderBy: { uploadedAt: "asc" } },
  documentRequests: {
    orderBy: { createdAt: "desc" },
    include: { agent: { select: { firstName: true, lastName: true } } },
  },
  agent: { select: { firstName: true, lastName: true, email: true } },
  user: { select: { email: true, phone: true } },
  reviewedBy: { select: { firstName: true, lastName: true } },
  commission: { select: { status: true, amountCents: true } },
} satisfies Prisma.ApplicationInclude;

export type FullApplication = Prisma.ApplicationGetPayload<{ include: typeof FULL_INCLUDE }>;

const OPEN_REQUESTS = { where: { resolvedAt: null } } as const;

export function toApplicationDTO(app: FullApplication): ApplicationDTO {
  return {
    id: app.id,
    status: app.status,
    submissionStatus: app.submissionStatus,
    plan: toPlanDTO(app.plan),
    personal: {
      firstName: app.firstName,
      lastName: app.lastName,
      dateOfBirth: app.dateOfBirth.toISOString().slice(0, 10),
      zipCode: app.zipCode,
      ssnLast4: app.ssnLast4,
    },
    healthInfo: app.healthInfoEncrypted ? decryptJson<HealthInfoDTO>(app.healthInfoEncrypted) : null,
    documents: app.documents.map((d) => ({
      id: d.id,
      type: d.type,
      fileName: d.fileName,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    documentRequests: app.documentRequests.map((r) => ({
      id: r.id,
      message: r.message,
      requestedTypes: r.requestedTypes,
      agentName: `${r.agent.firstName} ${r.agent.lastName}`,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    })),
    agent: app.agent,
    submissionAttempts: app.submissionAttempts,
    review:
      app.reviewedAt && (app.status === "APPROVED" || app.status === "REJECTED")
        ? {
            decision: app.status,
            reviewedAt: app.reviewedAt.toISOString(),
            // Approval notes are internal; only a rejection reason is shared.
            reason: app.status === "REJECTED" ? app.reviewNotes : null,
          }
        : null,
    carrierReference: app.carrierReference,
    carrierMessage: app.carrierMessage,
    submittedAt: app.submittedAt?.toISOString() ?? null,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
  };
}

function personalColumns(personal: { firstName: string; lastName: string; dateOfBirth: string; zipCode: string }) {
  return {
    firstName: personal.firstName,
    lastName: personal.lastName,
    dateOfBirth: new Date(`${personal.dateOfBirth}T00:00:00Z`),
    zipCode: personal.zipCode,
  };
}

function ssnColumns(ssn: string) {
  return { ssnEncrypted: encryptField(ssn), ssnLast4: ssn.slice(-4) };
}

async function assertPlanServesZip(planId: string, zipCode: string): Promise<void> {
  const served = await prisma.planServiceArea.findUnique({ where: { planId_zipCode: { planId, zipCode } } });
  if (!served) throw new HttpError(400, `This plan isn't sold in ZIP code ${zipCode}`);
}

// Ownership is folded into the lookup: another user's application is a 404,
// not a 403, so ids can't be probed for existence.
async function findOwned(userId: string, id: string): Promise<FullApplication> {
  const app = await prisma.application.findFirst({ where: { id, userId }, include: FULL_INCLUDE });
  if (!app) throw new HttpError(404, "Application not found");
  return app;
}

function assertEditable(app: FullApplication): void {
  if (!isEditable(app)) throw new HttpError(409, "This application can no longer be changed");
}

export async function listApplications(userId: string): Promise<ApplicationSummaryDTO[]> {
  const apps = await prisma.application.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: { plan: { include: { carrier: true } }, _count: { select: { documentRequests: OPEN_REQUESTS } } },
  });
  return apps.map((a) => ({
    id: a.id,
    planId: a.planId,
    status: a.status,
    submissionStatus: a.submissionStatus,
    planName: a.plan.name,
    carrierName: a.plan.carrier.name,
    monthlyPremiumCents: a.plan.monthlyPremiumCents,
    carrierReference: a.carrierReference,
    openDocumentRequests: a._count.documentRequests,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    updatedAt: a.updatedAt.toISOString(),
  }));
}

export async function getApplication(userId: string, id: string): Promise<ApplicationDTO> {
  return toApplicationDTO(await findOwned(userId, id));
}

export async function createApplication(
  userId: string,
  input: CreateApplicationRequestDTO,
  req: Request,
): Promise<ApplicationDTO> {
  const plan = await prisma.plan.findFirst({
    where: { id: input.planId, isActive: true, carrier: { isActive: true } },
  });
  if (!plan) throw new HttpError(404, "Plan not found");
  await assertPlanServesZip(plan.id, input.personal.zipCode);

  const agentId = await findAgentForZip(input.personal.zipCode);
  const app = await prisma.application.create({
    data: {
      userId,
      planId: plan.id,
      agentId,
      ...personalColumns(input.personal),
      ...ssnColumns(input.personal.ssn),
      healthInfoEncrypted: encryptJson(input.healthInfo),
    },
    include: FULL_INCLUDE,
  });

  await recordAuditEvent({
    actorUserId: userId,
    action: "application.create",
    entityType: "Application",
    entityId: app.id,
    metadata: { agentId },
    req,
  });
  return toApplicationDTO(app);
}

export async function updateApplication(
  userId: string,
  id: string,
  input: UpdateApplicationRequestDTO,
  req: Request,
): Promise<ApplicationDTO> {
  const existing = await findOwned(userId, id);
  assertEditable(existing);
  await assertPlanServesZip(existing.planId, input.personal.zipCode);

  const app = await prisma.application.update({
    where: { id },
    data: {
      ...personalColumns(input.personal),
      ...(input.personal.ssn ? ssnColumns(input.personal.ssn) : {}),
      healthInfoEncrypted: encryptJson(input.healthInfo),
    },
    include: FULL_INCLUDE,
  });

  await recordAuditEvent({ actorUserId: userId, action: "application.update", entityType: "Application", entityId: id, req });
  return toApplicationDTO(app);
}

// Marks open requests fulfilled once every type they asked for has been
// uploaded since the request was made.
async function resolveFulfilledRequests(applicationId: string): Promise<void> {
  const [open, documents] = await Promise.all([
    prisma.documentRequest.findMany({ where: { applicationId, resolvedAt: null } }),
    prisma.applicationDocument.findMany({ where: { applicationId }, select: { type: true, uploadedAt: true } }),
  ]);
  const fulfilled = open.filter((r) =>
    r.requestedTypes.every((t) => documents.some((d) => d.type === t && d.uploadedAt >= r.createdAt)),
  );
  if (fulfilled.length) {
    await prisma.documentRequest.updateMany({
      where: { id: { in: fulfilled.map((r) => r.id) } },
      data: { resolvedAt: new Date() },
    });
  }
}

export async function uploadDocument(
  userId: string,
  id: string,
  type: DocumentType,
  file: { originalname: string; buffer: Buffer; size: number },
  req: Request,
): Promise<ApplicationDTO> {
  const app = await findOwned(userId, id);
  const openRequestedTypes = app.documentRequests.filter((r) => !r.resolvedAt).flatMap((r) => r.requestedTypes);
  const blocker = uploadBlocker(app, type, openRequestedTypes);
  if (blocker) throw new HttpError(409, blocker);

  const mimeType = sniffDocumentMime(file.buffer);
  if (!mimeType) throw new HttpError(400, "File must be a PDF, JPEG, or PNG");

  const storageKey = `applications/${id}/${crypto.randomUUID()}.${extensionForMime(mimeType)}`;
  await documentStorage.put(storageKey, file.buffer, mimeType);

  const previous = app.documents.find((d) => d.type === type);
  const fileName = file.originalname.slice(0, 255);
  await prisma.applicationDocument.upsert({
    where: { applicationId_type: { applicationId: id, type } },
    create: { applicationId: id, type, fileName, mimeType, sizeBytes: file.size, storageKey },
    update: { fileName, mimeType, sizeBytes: file.size, storageKey, uploadedAt: new Date() },
  });
  // Remove the replaced file only after the row points at the new one.
  if (previous) await documentStorage.delete(previous.storageKey).catch(() => undefined);
  if (openRequestedTypes.length) await resolveFulfilledRequests(id);

  await recordAuditEvent({
    actorUserId: userId,
    action: "application.document.upload",
    entityType: "Application",
    entityId: id,
    metadata: { type, sizeBytes: file.size, mimeType },
    req,
  });
  return getApplication(userId, id);
}

export async function submitApplication(userId: string, id: string, req: Request): Promise<ApplicationDTO> {
  const app = await findOwned(userId, id);
  const stalePending =
    app.submissionStatus === "PENDING" && Date.now() - app.updatedAt.getTime() > STALE_PENDING_MS;

  const blocker = submissionBlocker({
    status: app.status,
    submissionStatus: stalePending ? "FAILED" : app.submissionStatus,
    documents: app.documents,
    planAvailable: app.plan.isActive && app.plan.carrier.isActive,
  });
  if (blocker) throw new HttpError(409, blocker);

  await sendToCarrier(app, {
    actorUserId: userId,
    req,
    auditAction: "application.submit",
    claimWhere: {
      status: "DRAFT",
      OR: [
        { submissionStatus: { in: ["NOT_SUBMITTED", "FAILED"] } },
        { submissionStatus: "PENDING", updatedAt: { lt: new Date(Date.now() - STALE_PENDING_MS) } },
      ],
    },
  });
  return getApplication(userId, id);
}
