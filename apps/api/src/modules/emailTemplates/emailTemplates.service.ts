import type { Request } from "express";
import sanitizeHtml from "sanitize-html";
import type { EmailTemplate } from "@prisma/client";
import type { EmailTemplateDTO, EmailTemplateKey, EmailTemplateVariable, UpdateEmailTemplateRequestDTO } from "@insurance/shared";
import {
  EMAIL_BODY_MAX,
  EMAIL_SUBJECT_MAX,
  EMAIL_TEMPLATE_KEYS,
  EMAIL_TEMPLATE_VARIABLES,
  fillEmailTemplate,
  unknownEmailVariables,
} from "@insurance/shared";
import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { HttpError } from "../../middleware/errorHandler";
import { email, type EmailMessage } from "../../integrations/email";
import { EMAIL_TEMPLATE_CATALOG } from "./catalog";
import { getSystemSettings } from "../settings/settings.service";

// ─── HTML handling ───────────────────────────────────────────────────────────

// What the editor can produce, minus images (an email body shouldn't load
// remote images). Links must be http(s) or mailto.
const EMAIL_HTML: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "hr", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s", "code", "blockquote", "ul", "ol", "li", "a"],
  allowedAttributes: { a: ["href", "title"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  transformTags: { h1: "h2" },
  disallowedTagsMode: "discard",
};

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, EMAIL_HTML).trim();
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

// Plain-text alternative for the email: block elements become line breaks,
// list items get a dash, links keep their URL.
export function emailHtmlToText(html: string): string {
  return html
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_m, href: string, label: string) => (label === href ? href : `${label} (${href})`))
    // The editor wraps list-item text in <p>; a list reads as one line per item.
    .replace(/<li[^>]*>\s*(<p[^>]*>)?/gi, "- ")
    .replace(/(<\/p>\s*)?<\/li>/gi, "\n")
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h\d|blockquote)>/gi, "\n\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e])
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// ─── Rows ────────────────────────────────────────────────────────────────────

const UPDATED_BY = { updatedBy: { select: { firstName: true, lastName: true } } } as const;
type Row = EmailTemplate & { updatedBy: { firstName: string; lastName: string } | null };

function isTemplateKey(key: string): key is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(key);
}

export function toEmailTemplateDTO(row: Row): EmailTemplateDTO {
  const def = EMAIL_TEMPLATE_CATALOG[row.key as EmailTemplateKey];
  return {
    id: row.id,
    key: row.key as EmailTemplateKey,
    name: def.name,
    description: def.description,
    audience: "Applicant",
    subject: row.subject,
    body: row.body,
    variables: def.variables,
    isDefault: row.isDefault,
    callToAction: def.callToAction.label,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy ? `${row.updatedBy.firstName} ${row.updatedBy.lastName}` : null,
  };
}

// Creates any missing template rows from the defaults and keeps the
// catalog-owned columns (name, description, variables) in step with the code.
// Never touches an admin's subject or body. Runs once per process.
let ensured: Promise<void> | null = null;

export function ensureEmailTemplates(): Promise<void> {
  ensured ??= (async () => {
    const rows = await prisma.emailTemplate.findMany({ select: { key: true, name: true, description: true, variables: true } });
    const existing = new Map(rows.map((r) => [r.key, r]));
    const missing = EMAIL_TEMPLATE_KEYS.filter((key) => !existing.has(key));
    if (missing.length) {
      await prisma.emailTemplate.createMany({
        data: missing.map((key) => {
          const d = EMAIL_TEMPLATE_CATALOG[key];
          return { key, name: d.name, description: d.description, variables: d.variables, subject: d.subject, body: d.body, isDefault: true };
        }),
        skipDuplicates: true,
      });
    }
    for (const [key, row] of existing) {
      if (!isTemplateKey(key)) continue;
      const d = EMAIL_TEMPLATE_CATALOG[key];
      if (row.name !== d.name || row.description !== d.description || JSON.stringify(row.variables) !== JSON.stringify(d.variables)) {
        await prisma.emailTemplate.update({ where: { key }, data: { name: d.name, description: d.description, variables: d.variables } });
      }
    }
  })().catch((err) => {
    ensured = null; // try again next time
    throw err;
  });
  return ensured;
}

export function resetEmailTemplateCache(): void {
  ensured = null;
}

export async function listEmailTemplates(): Promise<EmailTemplateDTO[]> {
  await ensureEmailTemplates();
  const rows = await prisma.emailTemplate.findMany({ where: { key: { in: [...EMAIL_TEMPLATE_KEYS] } }, include: UPDATED_BY });
  const order = new Map(EMAIL_TEMPLATE_KEYS.map((k, i) => [k as string, i]));
  return rows.sort((a, b) => order.get(a.key)! - order.get(b.key)!).map(toEmailTemplateDTO);
}

async function findTemplate(id: string): Promise<Row> {
  await ensureEmailTemplates();
  const row = await prisma.emailTemplate.findUnique({ where: { id }, include: UPDATED_BY });
  if (!row || !isTemplateKey(row.key)) throw new HttpError(404, "Email template not found");
  return row;
}

export async function getEmailTemplate(id: string): Promise<EmailTemplateDTO> {
  return toEmailTemplateDTO(await findTemplate(id));
}

// ─── Editing ─────────────────────────────────────────────────────────────────

function variableError(unknown: string[], allowed: readonly string[]): HttpError {
  const list = unknown.map((v) => `{${v}}`).join(", ");
  return new HttpError(400, `Unknown variable${unknown.length > 1 ? "s" : ""}: ${list}. This template can use ${allowed.map((v) => `{${v}}`).join(", ")}.`);
}

// Validates and normalizes an edit. Exported for tests.
export function validateTemplateInput(key: EmailTemplateKey, input: UpdateEmailTemplateRequestDTO): UpdateEmailTemplateRequestDTO {
  const allowed = EMAIL_TEMPLATE_CATALOG[key].variables;
  const subject = input.subject.replace(/\s+/g, " ").trim();
  if (!subject) throw new HttpError(400, "Subject can't be empty");
  if (subject.length > EMAIL_SUBJECT_MAX) throw new HttpError(400, `Keep the subject under ${EMAIL_SUBJECT_MAX} characters`);

  const body = sanitizeEmailHtml(input.body);
  if (!emailHtmlToText(body)) throw new HttpError(400, "Body can't be empty");
  if (body.length > EMAIL_BODY_MAX) throw new HttpError(400, "The email body is too long");

  const unknown = [...new Set([...unknownEmailVariables(subject, allowed), ...unknownEmailVariables(emailHtmlToText(body), allowed)])];
  if (unknown.length) throw variableError(unknown, allowed);
  return { subject, body };
}

export async function updateEmailTemplate(actorUserId: string, id: string, input: UpdateEmailTemplateRequestDTO, req: Request): Promise<EmailTemplateDTO> {
  const current = await findTemplate(id);
  const key = current.key as EmailTemplateKey;
  const next = validateTemplateInput(key, input);
  const d = EMAIL_TEMPLATE_CATALOG[key];

  const changed = [next.subject !== current.subject && "subject", next.body !== current.body && "body"].filter(Boolean) as string[];
  const row = await prisma.emailTemplate.update({
    where: { id },
    data: { subject: next.subject, body: next.body, isDefault: next.subject === d.subject && next.body === d.body, updatedById: actorUserId },
    include: UPDATED_BY,
  });
  // Template wording isn't personal data, so the subject change is recorded
  // in full; the body is summarized by length.
  await recordAuditEvent({
    actorUserId,
    action: "admin.email_template.update",
    entityType: "EmailTemplate",
    entityId: id,
    metadata: {
      key,
      changed,
      ...(changed.includes("subject") ? { subjectBefore: current.subject, subjectAfter: next.subject } : {}),
      bodyLength: next.body.length,
    },
    req,
  });
  return toEmailTemplateDTO(row);
}

export async function revertEmailTemplate(actorUserId: string, id: string, req: Request): Promise<EmailTemplateDTO> {
  const current = await findTemplate(id);
  const key = current.key as EmailTemplateKey;
  const d = EMAIL_TEMPLATE_CATALOG[key];
  const row = await prisma.emailTemplate.update({
    where: { id },
    data: { subject: d.subject, body: d.body, isDefault: true, updatedById: actorUserId },
    include: UPDATED_BY,
  });
  await recordAuditEvent({ actorUserId, action: "admin.email_template.revert", entityType: "EmailTemplate", entityId: id, metadata: { key }, req });
  return toEmailTemplateDTO(row);
}

// ─── Sending ─────────────────────────────────────────────────────────────────

export type EmailTemplateValues = Partial<Record<EmailTemplateVariable, string | null>>;

// Renders a template into a ready-to-send email: the admin's body with the
// values merged in, then the fixed call-to-action link and privacy footer.
export function renderEmailTemplate(
  key: EmailTemplateKey,
  template: { subject: string; body: string },
  values: EmailTemplateValues,
  applicationId: string,
): Omit<EmailMessage, "to"> {
  const d = EMAIL_TEMPLATE_CATALOG[key];
  const allowed = new Set<string>(d.variables);
  const vals = Object.fromEntries(
    EMAIL_TEMPLATE_VARIABLES.filter((v) => allowed.has(v)).map((v) => [v, values[v] ?? (v === "agentName" ? "your agent" : "")]),
  ) as Partial<Record<EmailTemplateVariable, string>>;

  const subject = fillEmailTemplate(template.subject, vals).replace(/\s+/g, " ").trim();
  const bodyHtml = fillEmailTemplate(template.body, vals, escapeHtml);
  const url = `${env.appUrl}${d.callToAction.path(applicationId)}`;
  const html = [
    bodyHtml,
    `<p><a href="${escapeHtml(url)}">${escapeHtml(d.callToAction.label)}</a></p>`,
    `<p style="color:#6b7280;font-size:12px">For your privacy, details are only available after you sign in.</p>`,
  ].join("\n");
  const text = [emailHtmlToText(bodyHtml), "", `${d.callToAction.label}: ${url}`].join("\n");
  return { subject, text, html };
}

// Sends an editable template. Falls back to the built-in wording if the
// database can't be read, and like email.send it never throws.
// Application-update emails to applicants and agents. Skipped while System
// Settings → "Email Notifications" is off; security and account emails
// (password reset, 2FA notices, invites) don't go through here and always send.
export async function sendNotificationEmail(message: EmailMessage, label: string): Promise<boolean> {
  if (!(await getSystemSettings()).features.emailNotifications) {
    console.info(`[email] "${label}" not sent: email notifications are turned off in System settings`);
    return false;
  }
  return email.send(message);
}

export async function sendTemplatedEmail(
  key: EmailTemplateKey,
  to: string,
  applicationId: string,
  values: EmailTemplateValues,
): Promise<boolean> {
  if (!(await getSystemSettings()).features.emailNotifications) {
    console.info(`[email] ${key} not sent: email notifications are turned off in System settings`);
    return false;
  }
  let source: { subject: string; body: string } = EMAIL_TEMPLATE_CATALOG[key];
  try {
    const row = await prisma.emailTemplate.findUnique({ where: { key }, select: { subject: true, body: true } });
    if (row) source = row;
  } catch (err) {
    console.error(`Couldn't load email template ${key}; using the default:`, err instanceof Error ? err.message : err);
  }
  try {
    return await email.send({ to, ...renderEmailTemplate(key, source, values, applicationId) });
  } catch (err) {
    console.error(`Rendering email template ${key} failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}
