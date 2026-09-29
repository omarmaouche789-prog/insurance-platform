import type { Request } from "express";
import type { Application, ApplicationDocument, Carrier, Plan, Prisma, User } from "@prisma/client";
import type { HealthInfoDTO } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { decryptField, decryptJson } from "../../lib/fieldCrypto";
import { HttpError } from "../../middleware/errorHandler";
import { carrierSubmission, type CarrierSubmissionResult } from "../../integrations/carrierSubmission";
import { notifications } from "../../integrations/notifications";
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

// Sends an application to its carrier and records the outcome. Used both for
// the applicant's first submission and an agent's resubmission.
export async function sendToCarrier(app: SubmittableApplication, opts: SendOptions): Promise<void> {
  const claimed = await prisma.application.updateMany({
    where: { id: app.id, ...opts.claimWhere },
    data: { submissionStatus: "PENDING", submissionAttempts: { increment: 1 } },
  });
  if (claimed.count === 0) throw new HttpError(409, "This application is already being submitted");

  const attempt = app.submissionAttempts + 1;
  let result: CarrierSubmissionResult;
  try {
    result = await carrierSubmission.submit({
      carrierCode: app.plan.carrier.code,
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
    console.error("Carrier submission failed", err);
    // Workflow status is left as-is (DRAFT or REJECTED) so it stays retryable.
    await prisma.application.update({
      where: { id: app.id },
      data: { submissionStatus: "FAILED", carrierMessage: "The carrier could not be reached. Please try again." },
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
    if (!rate) console.warn(`No commission rate for carrier ${app.plan.carrier.code}; booking at 0`);
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

  if (!accepted) {
    await notifications.send({
      to: app.user.email,
      subject: "Update on your insurance application",
      body: `${app.plan.carrier.name} needs more information about your application. Sign in to see the details.`,
    });
  }

  await recordAuditEvent({
    actorUserId: opts.actorUserId,
    action: opts.auditAction,
    entityType: "Application",
    entityId: app.id,
    metadata: { outcome: result.outcome, attempt, carrierReference: result.reference },
    req: opts.req,
  });
}
