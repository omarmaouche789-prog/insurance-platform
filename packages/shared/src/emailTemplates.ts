// ─── Admin-editable email templates ──────────────────────────────────────────
// Five applicant-facing emails can be reworded by admins (SUPER/OPERATIONS,
// see NOTIFICATION_TEMPLATE_EDITOR_ROLES). The remaining system emails
// (security notices, password reset, account changes) keep fixed wording.

export const EMAIL_TEMPLATE_KEYS = [
  "APPLICATION_SUBMITTED",
  "APPLICATION_APPROVED",
  "APPLICATION_REJECTED",
  "AGENT_ASSIGNED",
  "DOCUMENTS_REQUESTED",
] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

// Email isn't a secure channel: these are the only values that can be merged
// into a template, so no health details, SSNs or rejection reasons can leak.
export const EMAIL_TEMPLATE_VARIABLES = ["userName", "appId", "status", "agentName", "confirmationNumber", "documents"] as const;
export type EmailTemplateVariable = (typeof EMAIL_TEMPLATE_VARIABLES)[number];

export const EMAIL_TEMPLATE_VARIABLE_INFO: Record<EmailTemplateVariable, { hint: string; sample: string }> = {
  userName: { hint: "Applicant's first name", sample: "Uma" },
  appId: { hint: "Short application reference", sample: "APP-4F2A9C1E" },
  status: { hint: "Application status, e.g. Approved", sample: "Approved" },
  agentName: { hint: "Assigned agent's full name", sample: "Alex Agent" },
  confirmationNumber: { hint: "Carrier confirmation number", sample: "BP-1A2B3C" },
  documents: { hint: "Requested document types", sample: "Proof of income, Photo ID" },
};

export const EMAIL_SUBJECT_MAX = 150;
export const EMAIL_BODY_MAX = 20_000;

export interface EmailTemplateDTO {
  id: string;
  key: EmailTemplateKey;
  name: string;
  description: string;
  audience: "Applicant";
  subject: string;
  body: string; // HTML
  // The placeholders this template can use (always a subset of EMAIL_TEMPLATE_VARIABLES).
  variables: EmailTemplateVariable[];
  // True while the wording matches the built-in default.
  isDefault: boolean;
  // The button the platform adds below the body (not editable: it carries the link).
  callToAction: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface EmailTemplateListResponseDTO {
  templates: EmailTemplateDTO[];
}

export interface UpdateEmailTemplateRequestDTO {
  subject: string;
  body: string;
}

// Short, human-friendly reference for an application id, used in emails and
// shown next to the application in the portal so the two can be matched.
export function applicationReference(id: string): string {
  return `APP-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

// Replaces {variable} placeholders. `transform` escapes values for HTML.
// Placeholders without a value are left as they are.
export function fillEmailTemplate(
  template: string,
  values: Partial<Record<EmailTemplateVariable, string>>,
  transform: (value: string, name: EmailTemplateVariable) => string = (v) => v,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(EMAIL_TEMPLATE_VARIABLES as readonly string[]).includes(name)) return match;
    const value = values[name as EmailTemplateVariable];
    return value === undefined ? match : transform(value, name as EmailTemplateVariable);
  });
}

// Placeholders the template uses that it isn't allowed to.
export function unknownEmailVariables(text: string, allowed: readonly string[]): string[] {
  const found = [...text.matchAll(/\{(\w*)\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((v) => !allowed.includes(v)))];
}
