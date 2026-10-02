import type { PlanDTO } from "./plans";

export const APPLICATION_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const SUBMISSION_STATUSES = ["NOT_SUBMITTED", "PENDING", "ACCEPTED", "REJECTED", "FAILED"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const DOCUMENT_TYPES = ["PHOTO_ID", "PROOF_OF_ADDRESS", "PROOF_OF_INCOME", "OTHER"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// Needed before an application can be submitted; the others are only
// collected when an agent requests them.
export const REQUIRED_DOCUMENT_TYPES = ["PHOTO_ID", "PROOF_OF_ADDRESS"] as const satisfies readonly DocumentType[];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  PHOTO_ID: "Government-issued photo ID",
  PROOF_OF_ADDRESS: "Proof of address",
  PROOF_OF_INCOME: "Proof of income",
  OTHER: "Other supporting document",
};

export const ALLOWED_DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export const HEALTH_CONDITIONS = [
  "ASTHMA",
  "DIABETES",
  "HEART_DISEASE",
  "HYPERTENSION",
  "CANCER",
  "COPD",
  "MENTAL_HEALTH",
  "PREGNANCY",
] as const;
export type HealthCondition = (typeof HEALTH_CONDITIONS)[number];

export const HEALTH_CONDITION_LABELS: Record<HealthCondition, string> = {
  ASTHMA: "Asthma",
  DIABETES: "Diabetes",
  HEART_DISEASE: "Heart disease",
  HYPERTENSION: "High blood pressure",
  CANCER: "Cancer (current or past)",
  COPD: "COPD",
  MENTAL_HEALTH: "Depression / anxiety",
  PREGNANCY: "Currently pregnant",
};

export interface PreferredDoctorDTO {
  name: string;
  specialty: string;
}

export interface HealthInfoDTO {
  conditions: HealthCondition[];
  otherConditions: string;
  preferredDoctors: PreferredDoctorDTO[];
}

export interface PersonalDetailsInputDTO {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  zipCode: string; // must be in the plan's service area
  ssn: string;
}

export interface CreateApplicationRequestDTO {
  planId: string;
  personal: PersonalDetailsInputDTO;
  healthInfo: HealthInfoDTO;
}

// SSN may be omitted on update to keep the one already on file.
export interface UpdateApplicationRequestDTO {
  personal: Omit<PersonalDetailsInputDTO, "ssn"> & { ssn?: string };
  healthInfo: HealthInfoDTO;
}

export const DOCUMENT_REQUEST_STATUSES = ["OPEN", "FULFILLED", "COMPLETED", "CANCELLED"] as const;
export type DocumentRequestStatus = (typeof DOCUMENT_REQUEST_STATUSES)[number];

export const DOCUMENT_REQUEST_STATUS_LABELS: Record<DocumentRequestStatus, string> = {
  OPEN: "Waiting on applicant",
  FULFILLED: "Uploaded — needs review",
  COMPLETED: "Complete",
  CANCELLED: "Cancelled",
};

export interface DocumentRequestDTO {
  id: string;
  message: string;
  requestedTypes: DocumentType[];
  agentName: string;
  status: DocumentRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
  completedAt: string | null;
}

export interface ApplicationDocumentDTO {
  id: string;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

// An admin's decision. `reason` is the rejection reason; approval notes are
// internal and only appear in the admin view.
export interface ApplicationReviewDTO {
  decision: "APPROVED" | "REJECTED";
  reviewedAt: string;
  reason: string | null;
}

// The full SSN never leaves the API; only its last 4 digits.
export interface ApplicationDTO {
  id: string;
  status: ApplicationStatus;
  submissionStatus: SubmissionStatus;
  plan: PlanDTO;
  personal: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    zipCode: string | null;
    ssnLast4: string;
  };
  healthInfo: HealthInfoDTO | null;
  documents: ApplicationDocumentDTO[];
  documentRequests: DocumentRequestDTO[];
  agent: { firstName: string; lastName: string; email: string } | null;
  submissionAttempts: number;
  review: ApplicationReviewDTO | null;
  carrierReference: string | null;
  carrierMessage: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationSummaryDTO {
  id: string;
  planId: string;
  status: ApplicationStatus;
  submissionStatus: SubmissionStatus;
  planName: string;
  carrierName: string;
  monthlyPremiumCents: number;
  carrierReference: string | null;
  openDocumentRequests: number;
  submittedAt: string | null;
  updatedAt: string;
}
