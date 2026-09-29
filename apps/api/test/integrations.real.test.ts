import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { S3StorageAdapter } from "../src/integrations/documentStorage";
import { email, emailTransport, maskEmail, SendGridEmailTransport } from "../src/integrations/email";
import { emailTemplates } from "../src/integrations/emailTemplates";
import { MockZipLookupAdapter, SmartyZipLookupAdapter } from "../src/integrations/zipLookup";
import {
  CarrierSubmissionError,
  CarrierUnavailableError,
  HttpCarrierAdapter,
  MockCarrierSubmissionAdapter,
  RoutingCarrierAdapter,
  type CarrierSubmissionRequest,
} from "../src/integrations/carrierSubmission";
import { fetchWithRetry, HttpRetryExhaustedError, isRetryableStatus, retryDelayMs } from "../src/lib/http";
import { assertProductionIntegrations, env, parseCarrierEndpoints } from "../src/lib/env";

// The real adapters, with their external services faked at the transport
// boundary (fetch / the S3 client), so request shapes, retries and error
// handling are exercised without network access or credentials.

const noSleep = async () => undefined;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

// A fake fetch that replays a scripted sequence and records calls.
function scriptedFetch(...responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetchImpl, calls };
}

describe("fetchWithRetry", () => {
  const opts = { maxAttempts: 3, timeoutMs: 1000, baseDelayMs: 10, sleep: noSleep };

  it("retries transient statuses and network errors, then succeeds", async () => {
    const { fetchImpl } = scriptedFetch(new TypeError("fetch failed"), json(503, {}), json(200, { ok: true }));
    const { response, attempts } = await fetchWithRetry("https://x.test", {}, { ...opts, fetchImpl });
    expect(response.status).toBe(200);
    expect(attempts).toBe(3);
  });

  it("doesn't retry a 4xx", async () => {
    const { fetchImpl } = scriptedFetch(json(400, {}));
    const { response, attempts } = await fetchWithRetry("https://x.test", {}, { ...opts, fetchImpl });
    expect(response.status).toBe(400);
    expect(attempts).toBe(1);
  });

  it("gives up after maxAttempts with the last status", async () => {
    const { fetchImpl } = scriptedFetch(json(502, {}), json(503, {}), json(503, {}));
    const err = await fetchWithRetry("https://x.test", {}, { ...opts, fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpRetryExhaustedError);
    expect(err).toMatchObject({ attempts: 3, lastStatus: 503 });
  });

  it("classifies retryable statuses", () => {
    expect([408, 425, 429, 500, 503].every(isRetryableStatus)).toBe(true);
    expect([200, 400, 401, 404, 422].some(isRetryableStatus)).toBe(false);
  });

  it("honors Retry-After and caps exponential backoff", () => {
    expect(retryDelayMs(1, { baseDelayMs: 100 }, "2")).toBe(2000);
    expect(retryDelayMs(1, { baseDelayMs: 100, maxDelayMs: 500 }, "60")).toBe(500);
    expect(retryDelayMs(3, { baseDelayMs: 100 }, null, () => 1)).toBe(400);
    expect(retryDelayMs(20, { baseDelayMs: 100, maxDelayMs: 5000 }, null, () => 1)).toBe(5000);
  });
});

describe("S3StorageAdapter", () => {
  function fakeS3(body?: Uint8Array) {
    const send = vi.fn(async (command: unknown) =>
      command instanceof GetObjectCommand ? { Body: body && { transformToByteArray: async () => body } } : {},
    );
    return { send };
  }

  it("writes with SSE-S3 by default, under the configured prefix", async () => {
    const client = fakeS3();
    await new S3StorageAdapter(client, { bucket: "docs", prefix: "staging/" }).put("applications/a/1.pdf", Buffer.from("%PDF"), "application/pdf");

    const command = client.send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: "docs",
      Key: "staging/applications/a/1.pdf",
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256",
    });
  });

  it("uses the customer-managed KMS key when configured", async () => {
    const client = fakeS3();
    await new S3StorageAdapter(client, { bucket: "docs", kmsKeyId: "arn:aws:kms:key/1" }).put("k.pdf", Buffer.from("x"), "application/pdf");
    expect((client.send.mock.calls[0][0] as PutObjectCommand).input).toMatchObject({
      ServerSideEncryption: "aws:kms",
      SSEKMSKeyId: "arn:aws:kms:key/1",
    });
  });

  it("reads objects back as a Buffer and deletes by key", async () => {
    const client = fakeS3(new TextEncoder().encode("%PDF-body"));
    const adapter = new S3StorageAdapter(client, { bucket: "docs" });

    expect((await adapter.get("k.pdf")).toString()).toBe("%PDF-body");
    await adapter.delete("k.pdf");
    expect(client.send.mock.calls[1][0]).toBeInstanceOf(DeleteObjectCommand);
    expect((client.send.mock.calls[1][0] as DeleteObjectCommand).input).toEqual({ Bucket: "docs", Key: "k.pdf" });
  });

  it("rejects traversal and absolute keys before calling S3", async () => {
    const client = fakeS3();
    const adapter = new S3StorageAdapter(client, { bucket: "docs" });
    for (const key of ["../x", "/etc/passwd", "a//b", "a/../../b"]) {
      await expect(adapter.get(key)).rejects.toThrow("Invalid storage key");
    }
    expect(client.send).not.toHaveBeenCalled();
  });
});

describe("SendGridEmailTransport", () => {
  const message = { to: "uma@example.com", subject: "Hi", text: "plain", html: "<p>html</p>" };

  it("posts the v3 mail/send payload with tracking disabled", async () => {
    const { fetchImpl, calls } = scriptedFetch(new Response(null, { status: 202 }));
    await new SendGridEmailTransport({ apiKey: "SG.key", from: "no-reply@example.com", fromName: "Market", fetchImpl, sleep: noSleep }).send(message);

    expect(calls[0].url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer SG.key");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      personalizations: [{ to: [{ email: "uma@example.com" }] }],
      from: { email: "no-reply@example.com", name: "Market" },
      subject: "Hi",
      content: [
        { type: "text/plain", value: "plain" },
        { type: "text/html", value: "<p>html</p>" },
      ],
      tracking_settings: { click_tracking: { enable: false }, open_tracking: { enable: false } },
    });
  });

  it("retries a 429 and throws on a permanent error", async () => {
    const { fetchImpl } = scriptedFetch(json(429, {}), new Response(null, { status: 202 }));
    await new SendGridEmailTransport({ apiKey: "k", from: "f@x.com", fromName: "n", fetchImpl, sleep: noSleep }).send(message);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const bad = scriptedFetch(json(403, { errors: [{ message: "sender not verified" }] }));
    await expect(
      new SendGridEmailTransport({ apiKey: "k", from: "f@x.com", fromName: "n", fetchImpl: bad.fetchImpl, sleep: noSleep }).send(message),
    ).rejects.toThrow(/403.*sender not verified/);
  });
});

describe("email.send", () => {
  it("never throws: a failed send is logged (masked) and reported as false", async () => {
    vi.spyOn(emailTransport, "send").mockRejectedValueOnce(new Error("SendGrid responded 500"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(email.send({ to: "uma@example.com", subject: "s", text: "t", html: "h" })).resolves.toBe(false);
    expect(error.mock.calls[0][0]).toContain("u***@example.com");
    expect(error.mock.calls[0][0]).not.toContain("uma@example.com");
  });

  it("masks addresses", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j***@example.com");
    expect(maskEmail("not-an-email")).toBe("***");
  });
});

describe("emailTemplates", () => {
  it("links to the portal and escapes names in HTML", () => {
    const t = emailTemplates.enrollmentConfirmation({ firstName: "<Uma>", applicationId: "app-1", confirmationNumber: "REF-1" });
    expect(t.text).toContain(`${env.appUrl}/account/applications/app-1`);
    expect(t.text).toContain("REF-1");
    expect(t.html).toContain("&lt;Uma&gt;");
    expect(t.html).not.toContain("<Uma>");
  });

  it("covers every lifecycle email", () => {
    const base = { firstName: "Uma", applicationId: "a" };
    const subjects = [
      emailTemplates.enrollmentConfirmation({ ...base, confirmationNumber: "R" }),
      emailTemplates.carrierNeedsInfo(base),
      emailTemplates.documentRequest({ ...base, documentLabels: ["Proof of income"] }),
      emailTemplates.resubmissionOutcome({ ...base, accepted: true, confirmationNumber: "R" }),
      emailTemplates.approval({ ...base, confirmationNumber: "R" }),
      emailTemplates.rejectionToApplicant(base),
      emailTemplates.rejectionToAgent({ agentFirstName: "Alex", applicantName: "Uma User", applicationId: "a" }),
    ].map((t) => t.subject);
    expect(subjects.every(Boolean)).toBe(true);
  });
});

describe("SmartyZipLookupAdapter", () => {
  const smarty = (fetchImpl: ReturnType<typeof scriptedFetch>["fetchImpl"]) =>
    new SmartyZipLookupAdapter({ authId: "id", authToken: "tok", fallback: new MockZipLookupAdapter(), fetchImpl, sleep: noSleep });

  it("resolves city and state and sends credentials as query params", async () => {
    const { fetchImpl, calls } = scriptedFetch(
      json(200, [{ input_index: 0, city_states: [{ city: "Chicago", state_abbreviation: "IL" }] }]),
    );
    expect(await smarty(fetchImpl).lookup("60601")).toEqual({ zipCode: "60601", city: "Chicago", state: "IL" });
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://us-zipcode.api.smarty.com/lookup");
    expect(Object.fromEntries(url.searchParams)).toEqual({ "auth-id": "id", "auth-token": "tok", zipcode: "60601" });
  });

  it("returns null for a ZIP Smarty says is invalid, and caches it", async () => {
    const { fetchImpl } = scriptedFetch(json(200, [{ input_index: 0, status: "invalid_zipcode", reason: "Invalid ZIP Code." }]));
    const adapter = smarty(fetchImpl);
    expect(await adapter.lookup("00000")).toBeNull();
    expect(await adapter.lookup("00000")).toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("caches successful lookups", async () => {
    const { fetchImpl } = scriptedFetch(json(200, [{ city_states: [{ city: "Austin", state_abbreviation: "TX" }] }]));
    const adapter = smarty(fetchImpl);
    await adapter.lookup("78701");
    await adapter.lookup("78701");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("falls back to the static table on outages and auth errors, without caching", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { fetchImpl } = scriptedFetch(new TypeError("fetch failed"), new TypeError("fetch failed"), json(401, {}));
    const adapter = smarty(fetchImpl);

    expect(await adapter.lookup("10001")).toEqual({ zipCode: "10001", city: "New York", state: "NY" });
    expect(await adapter.lookup("10001")).toEqual({ zipCode: "10001", city: "New York", state: "NY" });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 2 tries for the outage, then 1 for the 401
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("skips the network for malformed ZIPs", async () => {
    const { fetchImpl } = scriptedFetch();
    expect(await smarty(fetchImpl).lookup("1234")).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("HttpCarrierAdapter", () => {
  const endpoint = { baseUrl: "https://carrier.test/v1", apiKey: "ck_live" };
  const request: CarrierSubmissionRequest = {
    carrierCode: "BLUEPEAK",
    planId: "plan-1",
    applicationId: "app-1",
    attempt: 2,
    applicant: { firstName: "Uma", lastName: "User", dateOfBirth: "1990-06-15", zipCode: "10001", ssn: "123456789" },
    healthInfo: null,
    documentTypes: ["PHOTO_ID", "PROOF_OF_ADDRESS"],
  };
  const adapter = (fetchImpl: ReturnType<typeof scriptedFetch>["fetchImpl"]) => new HttpCarrierAdapter(endpoint, { fetchImpl, sleep: noSleep });

  it("posts the enrollment with auth and an idempotency key, and maps acceptance", async () => {
    const { fetchImpl, calls } = scriptedFetch(json(201, { status: "accepted", reference: "BP-123", message: "Received" }));
    const result = await adapter(fetchImpl).submit(request);

    expect(calls[0].url).toBe("https://carrier.test/v1/enrollments");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers).toMatchObject({ Authorization: "Bearer ck_live", "Idempotency-Key": "app-1-2" });
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ externalId: "app-1", attempt: 2, applicant: { ssn: "123456789" } });
    expect(result).toEqual({
      outcome: "ACCEPTED",
      reference: "BP-123",
      message: "Received",
      meta: expect.objectContaining({ transport: "http", httpStatus: 201, attempts: 1 }),
    });
  });

  it("maps a business rejection", async () => {
    const { fetchImpl } = scriptedFetch(json(200, { status: "rejected", message: "Identity not verified" }));
    expect(await adapter(fetchImpl).submit(request)).toMatchObject({ outcome: "REJECTED", reference: null, message: "Identity not verified" });
  });

  it("retries transient failures with the same idempotency key", async () => {
    const { fetchImpl, calls } = scriptedFetch(json(503, {}), new TypeError("socket hang up"), json(200, { status: "accepted", reference: "BP-9" }));
    const result = await adapter(fetchImpl).submit(request);
    expect(result.meta).toMatchObject({ attempts: 3, httpStatus: 200 });
    expect(new Set(calls.map((c) => (c.init.headers as Record<string, string>)["Idempotency-Key"]))).toEqual(new Set(["app-1-2"]));
  });

  it("throws a retryable CarrierUnavailableError when retries run out", async () => {
    const { fetchImpl } = scriptedFetch(json(503, {}), json(503, {}), json(504, {}));
    const err = await adapter(fetchImpl).submit(request).catch((e) => e);
    expect(err).toBeInstanceOf(CarrierUnavailableError);
    expect(err).toMatchObject({ retryable: true, meta: { httpStatus: 504, attempts: 3 } });
  });

  it("fails a 4xx without retrying and without echoing the response body", async () => {
    const { fetchImpl } = scriptedFetch(json(422, { error: "invalid ssn 123456789" }));
    const err = await adapter(fetchImpl).submit(request).catch((e) => e);
    expect(err).toBeInstanceOf(CarrierSubmissionError);
    expect(err).toMatchObject({ retryable: false, meta: { httpStatus: 422, attempts: 1 } });
    expect(err.message).not.toContain("123456789");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("treats an unreadable 2xx as retryable (it may have been accepted)", async () => {
    const { fetchImpl } = scriptedFetch(new Response("<html>oops</html>", { status: 200 }));
    await expect(adapter(fetchImpl).submit(request)).rejects.toMatchObject({ retryable: true });
  });

  it("posts approval decisions to the enrollment by reference", async () => {
    const { fetchImpl, calls } = scriptedFetch(json(200, {}));
    const meta = await adapter(fetchImpl).notifyDecision({
      carrierCode: "BLUEPEAK",
      carrierReference: "BP/1",
      applicationId: "app-1",
      decision: "APPROVED",
    });
    expect(calls[0].url).toBe("https://carrier.test/v1/enrollments/BP%2F1/decision");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ externalId: "app-1", decision: "approved" });
    expect(meta).toMatchObject({ httpStatus: 200 });
  });
});

describe("RoutingCarrierAdapter", () => {
  const request = { carrierCode: "SUMMIT" } as CarrierSubmissionRequest;

  it("routes by carrier code", async () => {
    const summit = { submit: vi.fn(async () => ({ outcome: "ACCEPTED" as const, reference: "S", message: "" })), notifyDecision: vi.fn() };
    await new RoutingCarrierAdapter({ SUMMIT: summit }, null).submit(request);
    expect(summit.submit).toHaveBeenCalledWith(request);
  });

  it("falls back to the mock for unconfigured carriers outside production", async () => {
    const mock = new MockCarrierSubmissionAdapter(0);
    const spy = vi.spyOn(mock, "submit").mockResolvedValue({ outcome: "ACCEPTED", reference: "M", message: "" });
    await new RoutingCarrierAdapter({}, mock).submit(request);
    expect(spy).toHaveBeenCalled();
  });

  it("fails non-retryably when a carrier has no API and there's no fallback", async () => {
    await expect(new RoutingCarrierAdapter({}, null).submit(request)).rejects.toMatchObject({
      retryable: false,
      message: "No API is configured for carrier SUMMIT",
    });
  });
});

describe("env integration config", () => {
  it("parses per-carrier endpoints, requiring both URL and key", () => {
    expect(
      parseCarrierEndpoints({
        CARRIER_BLUEPEAK_API_URL: "https://bp.test/v1/",
        CARRIER_BLUEPEAK_API_KEY: "k1",
        CARRIER_SUMMIT_API_URL: "https://summit.test",
        NOT_A_CARRIER: "x",
      }),
    ).toEqual({ BLUEPEAK: { baseUrl: "https://bp.test/v1", apiKey: "k1" } });
  });

  const configured = {
    ...env,
    isProduction: true,
    allowMockIntegrations: false,
    s3: { bucket: "b", region: "us-east-1", prefix: "", accessKeyId: undefined, secretAccessKey: undefined, kmsKeyId: undefined },
    sendgrid: { apiKey: "k", from: "no-reply@x.com", fromName: "n" },
    smarty: { authId: "i", authToken: "t" },
    carriers: { BLUEPEAK: { baseUrl: "https://bp.test", apiKey: "k" } },
  };

  it("accepts a fully configured production environment", () => {
    expect(() => assertProductionIntegrations(configured)).not.toThrow();
  });

  it("lists everything missing in production", () => {
    expect(() =>
      assertProductionIntegrations({ ...configured, s3: null, smarty: null, carriers: { X: { baseUrl: "http://plain.test", apiKey: "k" } } }),
    ).toThrow(/AWS_S3_BUCKET[\s\S]*SMARTY_AUTH_ID[\s\S]*CARRIER_X_API_URL must use https/);
  });

  it("requires a verified sender with SendGrid", () => {
    expect(() => assertProductionIntegrations({ ...configured, sendgrid: { apiKey: "k", from: "", fromName: "n" } })).toThrow(/EMAIL_FROM/);
  });

  it("is skipped outside production or when mocks are explicitly allowed", () => {
    expect(() => assertProductionIntegrations({ ...configured, s3: null, isProduction: false })).not.toThrow();
    expect(() => assertProductionIntegrations({ ...configured, s3: null, allowMockIntegrations: true })).not.toThrow();
  });
});
