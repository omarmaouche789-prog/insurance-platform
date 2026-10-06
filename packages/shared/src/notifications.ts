export const NOTIFICATION_TYPES = [
  "document.uploaded",
  "document.requested",
  "followup.scheduled",
  "account.security",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponseDTO {
  unreadCount: number;
  notifications: NotificationDTO[];
}

// ─── Admin: message templates ────────────────────────────────────────────────

export const NOTIFICATION_TEMPLATE_EDITOR_ROLES = ["SUPER", "OPERATIONS"] as const;

export function canEditNotificationTemplates(adminRole: string | null): boolean {
  return adminRole !== null && (NOTIFICATION_TEMPLATE_EDITOR_ROLES as readonly string[]).includes(adminRole);
}

// SMS is not a secure channel: templates may only use these placeholders, so
// no health details, SSNs or other PHI can be merged into a text message.
export const SMS_TEMPLATE_VARIABLES = ["userName", "appId", "status"] as const;
export type SmsTemplateVariable = (typeof SMS_TEMPLATE_VARIABLES)[number];

export const SMS_TEMPLATE_VARIABLE_HINTS: Record<SmsTemplateVariable, string> = {
  userName: "Recipient's first name",
  appId: "Short application reference",
  status: "Application status, e.g. Approved",
};

export const SMS_TEMPLATE_KEYS = [
  "USER_WELCOME",
  "DOCUMENT_REQUEST",
  "APPLICATION_SUBMITTED",
  "APPLICATION_APPROVED",
  "APPLICATION_NOT_APPROVED",
  "APPLICATION_STATUS_UPDATE",
] as const;
export type SmsTemplateKey = (typeof SMS_TEMPLATE_KEYS)[number];

// Three concatenated segments; longer texts get expensive and unreliable.
export const SMS_BODY_MAX = 459;

export interface SmsTemplateDTO {
  key: SmsTemplateKey;
  name: string;
  description: string;
  body: string;
  defaultBody: string;
  isCustomized: boolean;
  isActive: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface UpdateSmsTemplateRequestDTO {
  body: string;
  isActive: boolean;
}

export interface SmsTestSendRequestDTO {
  to: string; // E.164, e.g. +15551234567
  templateKey?: SmsTemplateKey;
  // Send this text instead of the saved template (unsaved edits).
  body?: string;
  variables?: Partial<Record<SmsTemplateVariable, string>>;
}

export interface SmsTestSendResponseDTO {
  status: "sent" | "logged";
  // "twilio" or "log" (no SMS provider configured: printed to the API log).
  transport: string;
  to: string; // masked
  body: string;
  segments: number;
  providerMessageId: string | null;
}

export interface EmailTemplatePreviewDTO {
  key: string;
  name: string;
  description: string;
  audience: "Applicant" | "Agent" | "Any user";
  subject: string;
  text: string;
  html: string;
}

// SMS length rules: GSM-7 messages fit 160 characters (153 per part when
// split); anything outside GSM-7 (emoji, curly quotes…) switches the whole
// message to UCS-2 at 70 (67 per part).
const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€";

export function smsSegmentInfo(text: string): { encoding: "GSM-7" | "UCS-2"; length: number; segments: number; perSegment: number } {
  const chars = [...text];
  const gsm = chars.every((c) => GSM7.includes(c) || GSM7_EXTENDED.includes(c));
  if (gsm) {
    const length = chars.reduce((n, c) => n + (GSM7_EXTENDED.includes(c) ? 2 : 1), 0);
    const perSegment = length <= 160 ? 160 : 153;
    return { encoding: "GSM-7", length, segments: length === 0 ? 0 : Math.ceil(length / perSegment), perSegment };
  }
  const length = chars.length;
  const perSegment = length <= 70 ? 70 : 67;
  return { encoding: "UCS-2", length, segments: length === 0 ? 0 : Math.ceil(length / perSegment), perSegment };
}

// Replaces {userName}, {appId} and {status}. Unknown placeholders are left
// as-is (validation rejects them on save).
export function renderSmsTemplate(body: string, vars: Partial<Record<SmsTemplateVariable, string>>): string {
  return body.replace(/\{(\w+)\}/g, (match, name: string) =>
    (SMS_TEMPLATE_VARIABLES as readonly string[]).includes(name) && vars[name as SmsTemplateVariable] !== undefined
      ? vars[name as SmsTemplateVariable]!
      : match,
  );
}

export function unknownSmsVariables(body: string): string[] {
  const found = [...body.matchAll(/\{(\w*)\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((v) => !(SMS_TEMPLATE_VARIABLES as readonly string[]).includes(v)))];
}
