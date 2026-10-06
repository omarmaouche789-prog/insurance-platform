import type { Request } from "express";
import type {
  EmailTemplatePreviewDTO,
  SmsTemplateDTO,
  SmsTemplateKey,
  SmsTemplateVariable,
  SmsTestSendResponseDTO,
} from "@insurance/shared";
import { renderSmsTemplate, SMS_BODY_MAX, SMS_TEMPLATE_KEYS, smsSegmentInfo, unknownSmsVariables } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { HttpError } from "../../middleware/errorHandler";
import { emailTemplates } from "../../integrations/emailTemplates";
import { maskPhone, smsTransport } from "../../integrations/sms";

// ─── SMS ─────────────────────────────────────────────────────────────────────
// The catalog and default wording live here; sms_templates only holds an
// admin's edits. So every environment has working defaults without seeding,
// and "reset to default" is just deleting the row.

export const SMS_TEMPLATE_DEFAULTS: Record<SmsTemplateKey, { name: string; description: string; body: string }> = {
  USER_WELCOME: {
    name: "User welcome",
    description: "Sent after someone creates an account.",
    body: "Hi {userName}, welcome to Insurance Marketplace! Compare plans and track your application anytime at insurancemarketplace.example. Reply STOP to opt out.",
  },
  DOCUMENT_REQUEST: {
    name: "Document request",
    description: "An agent asked the applicant for more documents.",
    body: "Hi {userName}, your agent needs more documents for application {appId}. Sign in to upload them. Reply STOP to opt out.",
  },
  APPLICATION_SUBMITTED: {
    name: "Application submitted",
    description: "The carrier received the application.",
    body: "Hi {userName}, we received your application {appId}. We'll text you when there's an update. Reply STOP to opt out.",
  },
  APPLICATION_APPROVED: {
    name: "Application approved",
    description: "An admin approved the application.",
    body: "Good news, {userName}! Application {appId} was approved. Your carrier will send your coverage documents. Reply STOP to opt out.",
  },
  APPLICATION_NOT_APPROVED: {
    name: "Application not approved",
    description: "An admin rejected the application. The reason stays in the portal.",
    body: "Hi {userName}, there's an update on application {appId}. Sign in to see the details and next steps. Reply STOP to opt out.",
  },
  APPLICATION_STATUS_UPDATE: {
    name: "Status update",
    description: "Generic status change notice.",
    body: "Hi {userName}, application {appId} is now: {status}. Sign in for details. Reply STOP to opt out.",
  },
};

// Sample values for previews and test sends when the admin leaves them blank.
export const SMS_SAMPLE_VARIABLES: Record<SmsTemplateVariable, string> = {
  userName: "Uma",
  appId: "APP-4F2A",
  status: "Approved",
};

export function validateSmsBody(body: string): void {
  const unknown = unknownSmsVariables(body);
  if (unknown.length) {
    throw new HttpError(400, `Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown.map((v) => `{${v}}`).join(", ")}. Use {userName}, {appId} or {status}.`);
  }
  if (!body.trim()) throw new HttpError(400, "The message can't be empty");
  if (body.length > SMS_BODY_MAX) throw new HttpError(400, `Keep the message under ${SMS_BODY_MAX} characters`);
}

type SmsRow = { key: string; body: string; isActive: boolean; updatedAt: Date; updatedBy: { firstName: string; lastName: string } | null };

export function toSmsTemplateDTO(key: SmsTemplateKey, row: SmsRow | undefined): SmsTemplateDTO {
  const d = SMS_TEMPLATE_DEFAULTS[key];
  return {
    key,
    name: d.name,
    description: d.description,
    body: row?.body ?? d.body,
    defaultBody: d.body,
    isCustomized: Boolean(row && row.body !== d.body),
    isActive: row?.isActive ?? true,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedBy: row?.updatedBy ? `${row.updatedBy.firstName} ${row.updatedBy.lastName}` : null,
  };
}

const UPDATED_BY = { updatedBy: { select: { firstName: true, lastName: true } } } as const;

export async function listSmsTemplates(): Promise<SmsTemplateDTO[]> {
  const rows = await prisma.smsTemplate.findMany({ include: UPDATED_BY });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return SMS_TEMPLATE_KEYS.map((key) => toSmsTemplateDTO(key, byKey.get(key)));
}

export async function updateSmsTemplate(
  actorUserId: string,
  key: SmsTemplateKey,
  input: { body: string; isActive: boolean },
  req: Request,
): Promise<SmsTemplateDTO> {
  validateSmsBody(input.body);
  const row = await prisma.smsTemplate.upsert({
    where: { key },
    create: { key, body: input.body, isActive: input.isActive, updatedById: actorUserId },
    update: { body: input.body, isActive: input.isActive, updatedById: actorUserId },
    include: UPDATED_BY,
  });
  await recordAuditEvent({
    actorUserId,
    action: "admin.notifications.sms_template.update",
    entityType: "SmsTemplate",
    entityId: key,
    metadata: { isActive: input.isActive, length: input.body.length },
    req,
  });
  return toSmsTemplateDTO(key, row);
}

export async function resetSmsTemplate(actorUserId: string, key: SmsTemplateKey, req: Request): Promise<SmsTemplateDTO> {
  await prisma.smsTemplate.deleteMany({ where: { key } });
  await recordAuditEvent({ actorUserId, action: "admin.notifications.sms_template.reset", entityType: "SmsTemplate", entityId: key, req });
  return toSmsTemplateDTO(key, undefined);
}

export async function sendTestSms(
  actorUserId: string,
  input: { to: string; templateKey?: SmsTemplateKey; body?: string; variables?: Partial<Record<SmsTemplateVariable, string>> },
  req: Request,
): Promise<SmsTestSendResponseDTO> {
  let source = input.body;
  if (source === undefined) {
    if (!input.templateKey) throw new HttpError(400, "Choose a template or enter a message");
    const row = await prisma.smsTemplate.findUnique({ where: { key: input.templateKey } });
    source = row?.body ?? SMS_TEMPLATE_DEFAULTS[input.templateKey].body;
  }
  validateSmsBody(source);
  const vars = { ...SMS_SAMPLE_VARIABLES, ...Object.fromEntries(Object.entries(input.variables ?? {}).filter(([, v]) => v)) };
  const body = renderSmsTemplate(source, vars);

  let result;
  try {
    result = await smsTransport.send({ to: input.to, body });
  } catch (err) {
    console.error("Test SMS failed:", err instanceof Error ? err.message : err);
    throw new HttpError(502, "The SMS provider rejected the message. Check the number and the Twilio settings.");
  }
  // The number is personal data: only its last digits go in the audit log.
  await recordAuditEvent({
    actorUserId,
    action: "admin.notifications.sms_test_send",
    entityType: "SmsTemplate",
    entityId: input.templateKey ?? null,
    metadata: { to: maskPhone(input.to), transport: result.transport, segments: smsSegmentInfo(body).segments },
    req,
  });
  return {
    status: result.transport === "log" ? "logged" : "sent",
    transport: result.transport,
    to: maskPhone(input.to),
    body,
    segments: smsSegmentInfo(body).segments,
    providerMessageId: result.providerMessageId,
  };
}

// ─── Email (read-only previews) ──────────────────────────────────────────────
// Email wording is code (integrations/emailTemplates.ts). This renders each
// template with sample data so admins can see exactly what users receive.

const SAMPLE = { firstName: "Uma", applicationId: "sample-application-id", token: "sample-token" };

const EMAIL_PREVIEWS: Array<Omit<EmailTemplatePreviewDTO, "subject" | "text" | "html"> & { render: () => ReturnType<typeof emailTemplates.approval> }> = [
  { key: "enrollmentConfirmation", name: "Enrollment confirmation", audience: "Applicant", description: "The carrier accepted the application.", render: () => emailTemplates.enrollmentConfirmation({ ...SAMPLE, confirmationNumber: "BP-1A2B3C" }) },
  { key: "carrierNeedsInfo", name: "Carrier needs information", audience: "Applicant", description: "The carrier rejected the submission.", render: () => emailTemplates.carrierNeedsInfo(SAMPLE) },
  { key: "documentRequest", name: "Document request", audience: "Applicant", description: "An agent requested documents.", render: () => emailTemplates.documentRequest({ ...SAMPLE, documentLabels: ["Proof of income"] }) },
  { key: "resubmissionOutcome", name: "Resubmission outcome", audience: "Applicant", description: "An agent resubmitted to the carrier.", render: () => emailTemplates.resubmissionOutcome({ ...SAMPLE, accepted: true, confirmationNumber: "BP-1A2B3C" }) },
  { key: "approval", name: "Application approved", audience: "Applicant", description: "An admin approved the application.", render: () => emailTemplates.approval({ ...SAMPLE, confirmationNumber: "BP-1A2B3C" }) },
  { key: "rejectionToApplicant", name: "Application not approved", audience: "Applicant", description: "An admin rejected the application.", render: () => emailTemplates.rejectionToApplicant(SAMPLE) },
  { key: "rejectionToAgent", name: "Rejection (agent copy)", audience: "Agent", description: "Tells the assigned agent about a rejection.", render: () => emailTemplates.rejectionToAgent({ agentFirstName: "Alex", applicantName: "Uma User", applicationId: SAMPLE.applicationId }) },
  { key: "agentInvite", name: "Agent invite", audience: "Agent", description: "New agent account: set a password.", render: () => emailTemplates.agentInvite({ ...SAMPLE, firstName: "Alex", expiresInHours: 72 }) },
  { key: "passwordReset", name: "Password reset", audience: "Any user", description: "Self-service or admin-issued reset link.", render: () => emailTemplates.passwordReset({ ...SAMPLE, expiresInHours: 1, byAdmin: false }) },
  { key: "twoFactorEnabled", name: "Two-factor turned on", audience: "Any user", description: "Security notice after enabling 2FA.", render: () => emailTemplates.twoFactorEnabled(SAMPLE) },
  { key: "twoFactorDisabled", name: "Two-factor turned off", audience: "Any user", description: "Security notice after disabling or an admin reset.", render: () => emailTemplates.twoFactorDisabled({ ...SAMPLE, byAdmin: false }) },
  { key: "backupCodesRegenerated", name: "New backup codes", audience: "Any user", description: "Security notice after regenerating codes.", render: () => emailTemplates.backupCodesRegenerated(SAMPLE) },
  { key: "accountSuspended", name: "Account suspended", audience: "Any user", description: "An admin suspended the account.", render: () => emailTemplates.accountSuspended(SAMPLE) },
  { key: "accountReactivated", name: "Account reactivated", audience: "Any user", description: "An admin reactivated the account.", render: () => emailTemplates.accountReactivated(SAMPLE) },
  { key: "accountDeleted", name: "Account deleted", audience: "Any user", description: "Sent before the account is anonymized.", render: () => emailTemplates.accountDeleted(SAMPLE) },
];

export function listEmailTemplatePreviews(): EmailTemplatePreviewDTO[] {
  return EMAIL_PREVIEWS.map(({ render, ...meta }) => ({ ...meta, ...render() }));
}
