import crypto from "node:crypto";
import type { HealthInfoDTO } from "@insurance/shared";

// Adapter boundary for submitting an enrollment to the plan's carrier. Real
// per-carrier API clients land in the Phase 6 integrations layer.
export interface CarrierSubmissionRequest {
  carrierCode: string;
  planId: string;
  applicationId: string;
  // 1 for the first submission, incremented on each resubmission.
  attempt: number;
  applicant: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    zipCode: string | null;
    ssn: string;
  };
  healthInfo: HealthInfoDTO | null;
  documentTypes: string[];
}

export type CarrierSubmissionResult =
  | { outcome: "ACCEPTED"; reference: string; message: string }
  | { outcome: "REJECTED"; reference: string | null; message: string };

export interface CarrierDecisionNotice {
  carrierCode: string;
  carrierReference: string | null;
  applicationId: string;
  decision: "APPROVED";
}

export interface CarrierSubmissionAdapter {
  // Throws on transport failure (timeout, 5xx); the caller records that as FAILED
  // so the application can be retried.
  submit(request: CarrierSubmissionRequest): Promise<CarrierSubmissionResult>;
  // Tells the carrier we've approved the enrollment so it can bind coverage.
  notifyDecision(notice: CarrierDecisionNotice): Promise<void>;
}

export class CarrierUnavailableError extends Error {}

// Scripted test SSNs, in the spirit of payment processors' test card numbers,
// so the reject → resubmit and fail → retry paths can be exercised by hand:
//   SSN ending 0001 → REJECTED on the first attempt, accepted on resubmission
//   SSN ending 0002 → transport failure on the first attempt, accepted on retry
// Everything else is accepted.
export class MockCarrierSubmissionAdapter implements CarrierSubmissionAdapter {
  constructor(private readonly latencyMs = 300) {}

  async submit(request: CarrierSubmissionRequest): Promise<CarrierSubmissionResult> {
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    const firstAttempt = request.attempt === 1;

    if (firstAttempt && request.applicant.ssn.endsWith("0002")) {
      throw new CarrierUnavailableError(`${request.carrierCode} enrollment API timed out`);
    }
    if (firstAttempt && request.applicant.ssn.endsWith("0001")) {
      return {
        outcome: "REJECTED",
        reference: null,
        message: "Identity could not be verified. Please provide additional identification and resubmit.",
      };
    }

    return {
      outcome: "ACCEPTED",
      reference: `${request.carrierCode}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      message: "Application received. The carrier will confirm coverage within 5 business days.",
    };
  }

  readonly decisions: CarrierDecisionNotice[] = [];

  async notifyDecision(notice: CarrierDecisionNotice): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    this.decisions.push(notice);
    console.info(`[mock carrier] ${notice.carrierCode} notified: ${notice.carrierReference} ${notice.decision}`);
  }
}

export const carrierSubmission: CarrierSubmissionAdapter = new MockCarrierSubmissionAdapter();
