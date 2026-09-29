import { z } from "zod";
import type { ApplicationStatus, DocumentType, SubmissionStatus } from "@insurance/shared";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, HEALTH_CONDITIONS, REQUIRED_DOCUMENT_TYPES } from "@insurance/shared";
import { ZIP_CODE_PATTERN } from "../../integrations/zipLookup";

// Accepts 123-45-6789 or 123456789; normalizes to 9 digits. Rejects numbers
// the SSA never issues (area 000/666/9xx, group 00, serial 0000).
export const ssnSchema = z
  .string()
  .trim()
  .regex(/^\d{3}-?\d{2}-?\d{4}$/, "SSN must be 9 digits")
  .transform((s) => s.replace(/-/g, ""))
  .refine((s) => {
    const area = s.slice(0, 3);
    return area !== "000" && area !== "666" && area[0] !== "9" && s.slice(3, 5) !== "00" && s.slice(5) !== "0000";
  }, "Not a valid SSN");

const MAX_AGE_YEARS = 120;

export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    // Round-trip check rejects impossible dates like 2020-02-31.
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, "Not a valid date")
  .refine((s) => new Date(`${s}T00:00:00Z`) < new Date(), "Date of birth must be in the past")
  .refine((s) => {
    const oldest = new Date();
    oldest.setUTCFullYear(oldest.getUTCFullYear() - MAX_AGE_YEARS);
    return new Date(`${s}T00:00:00Z`) > oldest;
  }, "Date of birth is too far in the past");

export const healthInfoSchema = z.object({
  conditions: z
    .array(z.enum(HEALTH_CONDITIONS))
    .max(HEALTH_CONDITIONS.length)
    .transform((list) => [...new Set(list)]),
  otherConditions: z.string().trim().max(1000).default(""),
  preferredDoctors: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        specialty: z.string().trim().max(100).default(""),
      }),
    )
    .max(10)
    .default([]),
});

const personalBase = {
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: dateOfBirthSchema,
  zipCode: z.string().trim().regex(ZIP_CODE_PATTERN, "ZIP code must be 5 digits"),
};

export const createApplicationSchema = z.object({
  planId: z.string().min(1),
  personal: z.object({ ...personalBase, ssn: ssnSchema }),
  healthInfo: healthInfoSchema,
});

export const updateApplicationSchema = z.object({
  // Blank/omitted SSN on update keeps the one on file — the client never
  // holds onto the SSN after the first save.
  personal: z.object({
    ...personalBase,
    ssn: z.preprocess((v) => (v === "" ? undefined : v), ssnSchema.optional()),
  }),
  healthInfo: healthInfoSchema,
});

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

const EXTENSION_BY_MIME = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
} as const;
export type AllowedDocumentMime = keyof typeof EXTENSION_BY_MIME;

// Identify the file from its leading bytes rather than trusting the
// client-supplied Content-Type or file extension.
export function sniffDocumentMime(data: Buffer): AllowedDocumentMime | null {
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  return null;
}

export function extensionForMime(mime: AllowedDocumentMime): string {
  return EXTENSION_BY_MIME[mime];
}

// How long a PENDING submission can sit before we assume the request died
// mid-flight and let the applicant retry.
export const STALE_PENDING_MS = 5 * 60 * 1000;

export function isEditable(app: { status: ApplicationStatus; submissionStatus: SubmissionStatus }): boolean {
  return app.status === "DRAFT" && app.submissionStatus !== "PENDING";
}

interface SubmittableState {
  status: ApplicationStatus;
  submissionStatus: SubmissionStatus;
  documents: Array<{ type: DocumentType }>;
  planAvailable: boolean;
}

// Checks shared by the applicant's first submission and an agent's resubmission.
function readinessBlocker(app: SubmittableState): string | null {
  if (app.submissionStatus === "PENDING") return "This application is already being submitted";
  if (!app.planAvailable) return "This plan is no longer available";
  const uploaded = new Set(app.documents.map((d) => d.type));
  const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !uploaded.has(t));
  if (missing.length) return `Missing required documents: ${missing.map((t) => DOCUMENT_TYPE_LABELS[t]).join(", ")}`;
  return null;
}

// Returns why the applicant can't submit yet, or null if they can.
export function submissionBlocker(app: SubmittableState): string | null {
  if (app.status !== "DRAFT") return "This application has already been submitted";
  return readinessBlocker(app);
}

// Agents can resubmit what the carrier rejected or never received. An admin
// rejection (REJECTED with the carrier's ACCEPTED still on record) is final.
export function isResubmittable(app: { status: ApplicationStatus; submissionStatus: SubmissionStatus }): boolean {
  if (app.status === "REJECTED") return app.submissionStatus === "REJECTED" || app.submissionStatus === "FAILED";
  return app.status === "DRAFT" && app.submissionStatus === "FAILED";
}

// Carrier accepted receipt; waiting on an admin decision.
export function isAwaitingReview(app: { status: ApplicationStatus; submissionStatus: SubmissionStatus }): boolean {
  return app.status === "SUBMITTED" && app.submissionStatus === "ACCEPTED";
}

export function resubmitBlocker(app: SubmittableState): string | null {
  if (app.submissionStatus === "PENDING") return "This application is already being submitted";
  if (!isResubmittable(app)) return "Only rejected or failed submissions can be resubmitted";
  return readinessBlocker(app);
}

// Drafts accept any document. After submission the applicant can only upload
// types an agent has asked for (and not while a submission is in flight or
// once approved).
export function uploadBlocker(
  app: { status: ApplicationStatus; submissionStatus: SubmissionStatus },
  type: DocumentType,
  openRequestedTypes: DocumentType[],
): string | null {
  if (isEditable(app)) return null;
  if (app.submissionStatus === "PENDING" || app.status === "APPROVED" || !openRequestedTypes.includes(type)) {
    return "This application can no longer be changed";
  }
  return null;
}

export const requestDocumentsSchema = z.object({
  requestedTypes: z
    .array(z.enum(DOCUMENT_TYPES))
    .min(1, "Choose at least one document type")
    .transform((list) => [...new Set(list)]),
  message: z.string().trim().min(1, "Add a message for the applicant").max(2000),
});
