import type { Request } from "express";
import type { Application, ApplicationDocument, Carrier, Plan, Prisma, User } from "@prisma/client";
import type { HealthInfoDTO } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { decryptField, decryptJson } from "../../lib/fieldCrypto";
import { HttpError } from "../../middleware/errorHandler";
import {
  carrierSubmission,
  CarrierSubmissionError,
  type CarrierCallMeta,
  type CarrierSubmissionResult,
} from "../../integrations/carrierSubmission";
import { email } from "../../integrations/email";
import { emailTemplates } from "../../integrations/emailTemplates";
import { commissionAmountCents } from "../agent/commissions";

type SubmittableApplication = Application & {
  plan: Plan & { carrier: Carrier };
  documents: ApplicationDocument[];
  user: Pick<User, "email">;
};

interface SendOptions {
  actorUserId: string;
  req: Request;
  // Extra conditions the row must still meet at claim time; the claim is an
  // atomic update, so a concurrent submit/resubmit loses the race here.
  claimWhere: Prisma.ApplicationWhereInput;
  auditAction: "application.submit" | "application.resubmit";
}

const MAX_AUDITED_MESSAGE = 500;

// One audit row per carrier response (or failure to get one), with transport
// details for debugging integrations. PHI-free: the payload is never logged.
export async function recordCarrierResponse(
  applicationId: string,
  actorUserId: string,
  req: Request,
  details: {
    operation: "submit" | "decision";
    carrierCode: string;
    outcome: "ACCEPTED" | "REJECTED" | "ERROR" | "NOTIFIED";
    attempt?: number;
    reference?: string | null;
    message?: string | null;
    retryable?: boolean;
    meta: CarrierCallMeta | null | undefined;
  },
): Promise<void> {
  const { meta, ...rest } = details;
  await recordAuditEvent({
    actorUserId,
    action: "carrier.response",
    entityType: "Application",
    entityId: applicationId,
    metadata: {
      ...rest,
      reference: rest.reference ?? null,
      message: rest.message?.slice(0, MAX_AUDITED_MESSAGE) ?? null,
      transport: meta?.transport ?? null,
      httpStatus: meta?.httpStatus ?? null,
      httpAttempts: meta?.attempts ?? null,
      durationMs: meta?.durationMs ?? null,
    },
    req,
  });
}

// Sends an application to its carrier and records the outcome. Used both for
// the applicant's first submission and an agent's resubmission.
export async function sendToCarrier(app: SubmittableApplication, opts: SendOptions): Promise<void> {
  const claimed = await prisma.application.updateMany({
    where: { id: app.id, ...opts.claimWhere },
    data: { submissionStatus: "PENDING", submissionAttempts: { increment: 1 } },
  });
  if (claimed.count === 0) throw new HttpError(409, "This application is already being submitted");

  const attempt = app.submissionAttempts + 1;
  const carrierCode = app.plan.carrier.code;
  let result: CarrierSubmissionResult;
  try {
    result = await carrierSubmission.submit({
      carrierCode,
      planId: app.planId,
      applicationId: app.id,
      attempt,
      applicant: {
        firstName: app.firstName,
        lastName: app.lastName,
        dateOfBirth: app.dateOfBirth.toISOString().slice(0, 10),
        zipCode: app.zipCode,
        ssn: decryptField(app.ssnEncrypted),
      },
      healthInfo: app.healthInfoEncrypted ? decryptJson<HealthInfoDTO>(app.healthInfoEncrypted) : null,
      documentTypes: app.documents.map((d) => d.type),
    });
  } catch (err) {
    const known = err instanceof CarrierSubmissionError ? err : null;
    console.error(`Carrier submission failed for ${app.id}:`, err instanceof Error ? err.message : err);
    // Workflow status is left as-is (DRAFT or REJECTED) so it stays retryable.
    await prisma.application.update({
      where: { id: app.id },
      data: { submissionStatus: "FAILED", carrierMessage: "The carrier could not be reached. Please try again." },
    });
    await recordCarrierResponse(app.id, opts.actorUserId, opts.req, {
      operation: "submit",
      carrierCode,
      outcome: "ERROR",
      attempt,
      message: known?.message ?? "Unexpected error",
      retryable: known?.retryable ?? true,
      meta: known?.meta,
    });
    await recordAuditEvent({
      actorUserId: opts.actorUserId,
      action: `${opts.auditAction}.failed`,
      entityType: "Application",
      entityId: app.id,
      metadata: { attempt },
      req: opts.req,
    });
    throw new HttpError(502, "The carrier could not be reached. Please try again.");
  }

  await recordCarrierResponse(app.id, opts.actorUserId, opts.req, {
    operation: "submit",
    carrierCode,
    outcome: result.outcome,
    attempt,
    reference: result.reference,
    message: result.message,
    meta: result.meta,
  });

  const accepted = result.outcome === "ACCEPTED";
  const applicationUpdate = prisma.application.update({
    where: { id: app.id },
    data: {
      status: accepted ? "SUBMITTED" : "REJECTED",
      submissionStatus: result.outcome,
      carrierReference: result.reference,
      carrierMessage: result.message,
      submittedAt: new Date(),
    },
  });

  // The assigned agent's commission is booked (as PENDING) when the carrier
  // accepts, snapshotting today's premium and rate.
  if (accepted && app.agentId) {
    const rate = await prisma.commissionRate.findUnique({ where: { carrierId: app.plan.carrierId } });
    const rateBps = rate?.rateBps ?? 0;
    if (!rate) console.warn(`No commission rate for carrier ${carrierCode}; booking at 0`);
    await prisma.$transaction([
      applicationUpdate,
      prisma.commission.create({
        data: {
          applicationId: app.id,
          agentId: app.agentId,
          carrierId: app.plan.carrierId,
          premiumCents: app.plan.monthlyPremiumCents,
          rateBps,
          amountCents: commissionAmountCents(app.plan.monthlyPremiumCents, rateBps),
        },
      }),
    ]);
  } else {
    await applicationUpdate;
  }

  const who = { firstName: app.firstName, applicationId: app.id };
  const template =
    opts.auditAction === "application.resubmit"
      ? emailTemplates.resubmissionOutcome({ ...who, accepted, confirmationNumber: result.reference })
      : accepted
        ? emailTemplates.enrollmentConfirmation({ ...who, confirmationNumber: result.reference! })
        : emailTemplates.carrierNeedsInfo(who);
  await email.send({ to: app.user.email, ...template });

  await recordAuditEvent({
    actorUserId: opts.actorUserId,
    action: opts.auditAction,
    entityType: "Application",
    entityId: app.id,
    metadata: { outcome: result.outcome, attempt, carrierReference: result.reference },
    req: opts.req,
  });
}
