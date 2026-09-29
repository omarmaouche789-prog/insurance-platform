import crypto from "node:crypto";
import { z } from "zod";
import type { HealthInfoDTO } from "@insurance/shared";
import { env, type CarrierEndpoint } from "../lib/env";
import { fetchWithRetry, HttpRetryExhaustedError, type FetchLike } from "../lib/http";

// Adapter boundary for carrier enrollment APIs.
//
// HttpCarrierAdapter speaks a generic JSON contract (documented in
// DEPLOYMENT.md). Real carriers each have their own API or EDI 834 feed; each
// one gets its own request/response mapping behind this same interface.
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

// How the call went at the transport level — recorded in the audit trail
// for every carrier response, success or failure.
export interface CarrierCallMeta {
  transport: "http" | "mock";
  httpStatus: number | null;
  // HTTP attempts made within this one submission (retries included).
  attempts: number;
  durationMs: number;
}

export type CarrierSubmissionResult = (
  | { outcome: "ACCEPTED"; reference: string; message: string }
  | { outcome: "REJECTED"; reference: string | null; message: string }
) & { meta?: CarrierCallMeta };

export interface CarrierDecisionNotice {
  carrierCode: string;
  carrierReference: string | null;
  applicationId: string;
  decision: "APPROVED";
}

export interface CarrierSubmissionAdapter {
  // Throws CarrierSubmissionError when no definitive answer was received; the
  // caller records FAILED so the application can be retried.
  submit(request: CarrierSubmissionRequest): Promise<CarrierSubmissionResult>;
  // Tells the carrier we've approved the enrollment so it can bind coverage.
  notifyDecision(notice: CarrierDecisionNotice): Promise<CarrierCallMeta>;
}

export class CarrierSubmissionError extends Error {
  constructor(
    message: string,
    public readonly meta: CarrierCallMeta | null,
    // False when retrying the same request can't help (e.g. a 400 from the
    // carrier, or no API configured for it).
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class CarrierUnavailableError extends CarrierSubmissionError {}

// ─── Mock ────────────────────────────────────────────────────────────────────

// Scripted test SSNs, in the spirit of payment processors' test card numbers,
// so the reject → resubmit and fail → retry paths can be exercised by hand:
//   SSN ending 0001 → REJECTED on the first attempt, accepted on resubmission
//   SSN ending 0002 → transport failure on the first attempt, accepted on retry
// Everything else is accepted.
export class MockCarrierSubmissionAdapter implements CarrierSubmissionAdapter {
  readonly decisions: CarrierDecisionNotice[] = [];

  constructor(private readonly latencyMs = 300) {}

  private meta(started: number): CarrierCallMeta {
    return { transport: "mock", httpStatus: null, attempts: 1, durationMs: Date.now() - started };
  }

  async submit(request: CarrierSubmissionRequest): Promise<CarrierSubmissionResult> {
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    const firstAttempt = request.attempt === 1;

    if (firstAttempt && request.applicant.ssn.endsWith("0002")) {
      throw new CarrierUnavailableError(`${request.carrierCode} enrollment API timed out`, this.meta(started), true);
    }
    if (firstAttempt && request.applicant.ssn.endsWith("0001")) {
      return {
        outcome: "REJECTED",
        reference: null,
        message: "Identity could not be verified. Please provide additional identification and resubmit.",
        meta: this.meta(started),
      };
    }
    return {
      outcome: "ACCEPTED",
      reference: `${request.carrierCode}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
      message: "Application received. The carrier will confirm coverage within 5 business days.",
      meta: this.meta(started),
    };
  }

  async notifyDecision(notice: CarrierDecisionNotice): Promise<CarrierCallMeta> {
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    this.decisions.push(notice);
    console.info(`[mock carrier] ${notice.carrierCode} notified: ${notice.carrierReference} ${notice.decision}`);
    return this.meta(started);
  }
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

const enrollmentResponseSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
  reference: z.string().min(1).nullish(),
  message: z.string().max(2000).nullish(),
});

export interface HttpCarrierOptions {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  timeoutMs?: number;
}

export class HttpCarrierAdapter implements CarrierSubmissionAdapter {
  constructor(
    private readonly endpoint: CarrierEndpoint,
    private readonly opts: HttpCarrierOptions = {},
  ) {}

  private async post(path: string, idempotencyKey: string, body: unknown) {
    const retry = {
      maxAttempts: this.opts.maxAttempts ?? 3,
      timeoutMs: this.opts.timeoutMs ?? 10_000,
      baseDelayMs: 1_000,
      fetchImpl: this.opts.fetchImpl,
      sleep: this.opts.sleep,
    };
    try {
      const { response, attempts, durationMs } = await fetchWithRetry(
        `${this.endpoint.baseUrl}${path}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.endpoint.apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            // Same key on every retry of this request, so a carrier that
            // received a timed-out attempt doesn't enroll the applicant twice.
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(body),
        },
        retry,
      );
      const meta: CarrierCallMeta = { transport: "http", httpStatus: response.status, attempts, durationMs };
      if (!response.ok) {
        // Deliberately not including the response body: carriers may echo the
        // submitted (PHI-bearing) payload back in validation errors.
        throw new CarrierSubmissionError(`Carrier API responded ${response.status}`, meta, false);
      }
      return { response, meta };
    } catch (err) {
      if (err instanceof CarrierSubmissionError) throw err;
      if (err instanceof HttpRetryExhaustedError) {
        throw new CarrierUnavailableError(
          `Carrier API unavailable: ${err.message}`,
          { transport: "http", httpStatus: err.lastStatus, attempts: err.attempts, durationMs: err.durationMs },
          true,
        );
      }
      throw err;
    }
  }

  async submit(request: CarrierSubmissionRequest): Promise<CarrierSubmissionResult> {
    const { response, meta } = await this.post(`/enrollments`, `${request.applicationId}-${request.attempt}`, {
      externalId: request.applicationId,
      attempt: request.attempt,
      planId: request.planId,
      applicant: request.applicant,
      healthInfo: request.healthInfo,
      documentTypes: request.documentTypes,
    });

    const parsed = enrollmentResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      // A 2xx we can't read is ambiguous (it may have been accepted), so it's
      // retryable: the carrier dedupes on externalId + Idempotency-Key.
      throw new CarrierSubmissionError("Carrier API returned an unreadable response", meta, true);
    }
    const { status, reference, message } = parsed.data;
    if (status === "accepted") {
      if (!reference) throw new CarrierSubmissionError("Carrier accepted without a reference number", meta, true);
      return { outcome: "ACCEPTED", reference, message: message ?? "Application received by the carrier.", meta };
    }
    return { outcome: "REJECTED", reference: reference ?? null, message: message ?? "The carrier declined the application.", meta };
  }

  async notifyDecision(notice: CarrierDecisionNotice): Promise<CarrierCallMeta> {
    if (!notice.carrierReference) {
      throw new CarrierSubmissionError("Can't notify the carrier without its reference number", null, false);
    }
    const { meta } = await this.post(
      `/enrollments/${encodeURIComponent(notice.carrierReference)}/decision`,
      `${notice.applicationId}-decision`,
      { externalId: notice.applicationId, decision: notice.decision.toLowerCase() },
    );
    return meta;
  }
}

// ─── Routing ─────────────────────────────────────────────────────────────────

// Sends each request to its carrier's configured API. Carriers without one go
// to `fallback` (the mock, outside production) or fail non-retryably.
export class RoutingCarrierAdapter implements CarrierSubmissionAdapter {
  constructor(
    private readonly adapters: Record<string, CarrierSubmissionAdapter>,
    private readonly fallback: CarrierSubmissionAdapter | null,
  ) {}

  private pick(carrierCode: string): CarrierSubmissionAdapter {
    const adapter = this.adapters[carrierCode] ?? this.fallback;
    if (!adapter) throw new CarrierSubmissionError(`No API is configured for carrier ${carrierCode}`, null, false);
    return adapter;
  }

  // async so a missing carrier surfaces as a rejected promise, not a sync throw.
  async submit(request: CarrierSubmissionRequest): Promise<CarrierSubmissionResult> {
    return this.pick(request.carrierCode).submit(request);
  }

  async notifyDecision(notice: CarrierDecisionNotice): Promise<CarrierCallMeta> {
    return this.pick(notice.carrierCode).notifyDecision(notice);
  }
}

function createCarrierAdapter(): CarrierSubmissionAdapter {
  const adapters = Object.fromEntries(
    Object.entries(env.carriers).map(([code, endpoint]) => [code, new HttpCarrierAdapter(endpoint)]),
  );
  const allowMock = !env.isProduction || env.allowMockIntegrations;
  return new RoutingCarrierAdapter(adapters, allowMock ? new MockCarrierSubmissionAdapter() : null);
}

export const carrierSubmission: CarrierSubmissionAdapter = createCarrierAdapter();
