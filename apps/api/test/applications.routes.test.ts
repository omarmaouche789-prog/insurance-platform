import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOCS, installTransaction, makeApplication, makeDbMock, makeDocumentRequest, PLAN } from "./fixtures";

// HTTP-level tests with Prisma, storage, email and the carrier mocked
// out, so they exercise auth, ownership, validation, and the submit state
// machine without a database.
const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeDbMock> }));
vi.mock("../src/lib/prisma", async () => {
  const { makeDbMock: make } = await import("./fixtures");
  db.current = make();
  return { prisma: db.current };
});

const storage = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock("../src/integrations/documentStorage", () => ({ documentStorage: storage }));

const carrier = vi.hoisted(() => ({ submit: vi.fn() }));
// Keep the real error classes (the code under test uses instanceof); swap
// only the adapter instance.
vi.mock("../src/integrations/carrierSubmission", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/integrations/carrierSubmission")>()),
  carrierSubmission: carrier,
}));

const mailer = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/integrations/email", () => ({ email: mailer }));

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";

const app = createApp();
const userToken = signAccessToken({ sub: "user-1", role: "USER", adminRole: null });
const agentToken = signAccessToken({ sub: "agent-1", role: "AGENT", adminRole: null });
const auth = (token = userToken) => ({ Authorization: `Bearer ${token}` });

const validBody = {
  planId: "plan-1",
  personal: { firstName: "Uma", lastName: "User", dateOfBirth: "1990-06-15", zipCode: "10001", ssn: "123-45-6789" },
  healthInfo: { conditions: ["ASTHMA"], otherConditions: "", preferredDoctors: [{ name: "Dr. Lee" }] },
};

let prisma: ReturnType<typeof makeDbMock>;
beforeEach(() => {
  vi.resetAllMocks();
  prisma = db.current;
  installTransaction(prisma);
  prisma.documentRequest.findMany.mockResolvedValue([]);
  prisma.applicationDocument.findMany.mockResolvedValue([]);
});

describe("access control", () => {
  it("requires a token", async () => {
    const res = await request(app).get("/api/applications/app-1");
    expect(res.status).toBe(401);
  });

  it("is limited to the USER role", async () => {
    const res = await request(app).get("/api/applications/app-1").set(auth(agentToken));
    expect(res.status).toBe(403);
  });

  it("scopes lookups to the caller and 404s on someone else's application", async () => {
    prisma.application.findFirst.mockResolvedValue(null);
    const res = await request(app).get("/api/applications/app-1").set(auth());
    expect(res.status).toBe(404);
    expect(prisma.application.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app-1", userId: "user-1" } }),
    );
  });
});

describe("GET /api/applications/:id review visibility", () => {
  it("shows the applicant an admin's rejection reason", async () => {
    prisma.application.findFirst.mockResolvedValue(
      makeApplication({ status: "REJECTED", submissionStatus: "ACCEPTED", reviewedAt: new Date(), reviewNotes: "Income could not be verified" }),
    );
    const res = await request(app).get("/api/applications/app-1").set(auth());
    expect(res.body.application.review).toMatchObject({ decision: "REJECTED", reason: "Income could not be verified" });
  });

  it("hides internal approval notes", async () => {
    prisma.application.findFirst.mockResolvedValue(
      makeApplication({ status: "APPROVED", submissionStatus: "ACCEPTED", reviewedAt: new Date(), reviewNotes: "internal: fast-tracked" }),
    );
    const res = await request(app).get("/api/applications/app-1").set(auth());
    expect(res.body.application.review).toMatchObject({ decision: "APPROVED", reason: null });
    expect(JSON.stringify(res.body)).not.toContain("fast-tracked");
  });
});

describe("POST /api/applications", () => {
  beforeEach(() => {
    prisma.plan.findFirst.mockResolvedValue(PLAN);
    prisma.planServiceArea.findUnique.mockResolvedValue({ planId: "plan-1", zipCode: "10001" });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.application.create.mockImplementation(async ({ data }) => makeApplication({ ...data, documents: [] }));
  });

  it("encrypts the SSN and health info and returns only the last 4", async () => {
    const res = await request(app).post("/api/applications").set(auth()).send(validBody);

    expect(res.status).toBe(201);
    const data = prisma.application.create.mock.calls[0][0].data;
    expect(data.ssnEncrypted).toMatch(/^v1:/);
    expect(data.ssnLast4).toBe("6789");
    expect(data.healthInfoEncrypted).toMatch(/^v1:/);
    expect(JSON.stringify(res.body)).not.toContain("123456789");
    expect(res.body.application.personal.ssnLast4).toBe("6789");
    expect(res.body.application.healthInfo.preferredDoctors).toEqual([{ name: "Dr. Lee", specialty: "" }]);
  });

  it("assigns the least-loaded agent licensed in the applicant's state", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: "agent-busy", _count: { assignedApplications: 5 } },
      { id: "agent-free", _count: { assignedApplications: 1 } },
    ]);

    await request(app).post("/api/applications").set(auth()).send(validBody);

    // 10001 resolves to NY via the mock ZIP adapter.
    expect(prisma.user.findMany.mock.calls[0][0].where.agentProfile.regions).toEqual({ has: "NY" });
    expect(prisma.application.create.mock.calls[0][0].data.agentId).toBe("agent-free");
  });

  it("leaves the application unassigned when no agent covers the state", async () => {
    await request(app).post("/api/applications").set(auth()).send(validBody);
    expect(prisma.application.create.mock.calls[0][0].data.agentId).toBeNull();
  });

  it("400s when the plan isn't sold in the applicant's ZIP", async () => {
    prisma.planServiceArea.findUnique.mockResolvedValue(null);
    const res = await request(app).post("/api/applications").set(auth()).send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isn't sold in ZIP code 10001/);
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  it("400s on an invalid SSN or missing ZIP without touching the database", async () => {
    for (const personal of [
      { ...validBody.personal, ssn: "000-12-3456" },
      { ...validBody.personal, zipCode: "" },
    ]) {
      const res = await request(app).post("/api/applications").set(auth()).send({ ...validBody, personal });
      expect(res.status).toBe(400);
    }
    expect(prisma.application.create).not.toHaveBeenCalled();
  });

  it("404s for an unavailable plan", async () => {
    prisma.plan.findFirst.mockResolvedValue(null);
    const res = await request(app).post("/api/applications").set(auth()).send(validBody);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/applications/:id/documents/:type", () => {
  const upload = (type = "PHOTO_ID", body = Buffer.from("%PDF-1.7 test"), filename = "id.pdf") =>
    request(app)
      .post(`/api/applications/app-1/documents/${type}`)
      .set(auth())
      .attach("file", body, { filename, contentType: "application/pdf" });

  it("rejects a file that isn't really a PDF/JPEG/PNG", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication({ documents: [] }));
    const res = await upload("PHOTO_ID", Buffer.from("<script>alert(1)</script>"));
    expect(res.status).toBe(400);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("stores a valid PDF under a server-generated key", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication({ documents: [] }));
    const res = await upload("PHOTO_ID", Buffer.from("%PDF-1.7 test"), "../../evil.pdf");
    expect(res.status).toBe(200);
    expect(storage.put.mock.calls[0][0]).toMatch(/^applications\/app-1\/[0-9a-f-]{36}\.pdf$/);
  });

  it("400s on an unknown document type", async () => {
    const res = await upload("PASSPORT_SCAN");
    expect(res.status).toBe(400);
  });

  it("409s after submission unless an agent requested that document type", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication({ status: "SUBMITTED", submissionStatus: "ACCEPTED" }));
    const res = await upload("PHOTO_ID");
    expect(res.status).toBe(409);
  });

  it("accepts a requested document after rejection and resolves the request", async () => {
    const openRequest = makeDocumentRequest({ requestedTypes: ["PROOF_OF_INCOME"] });
    prisma.application.findFirst.mockResolvedValue(
      makeApplication({ status: "REJECTED", submissionStatus: "REJECTED", documentRequests: [openRequest] }),
    );
    prisma.documentRequest.findMany.mockResolvedValue([openRequest]);
    prisma.applicationDocument.findMany.mockResolvedValue([{ type: "PROOF_OF_INCOME", uploadedAt: new Date() }]);

    const res = await upload("PROOF_OF_INCOME");

    expect(res.status).toBe(200);
    expect(prisma.documentRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["req-1"] } } }),
    );
  });

  it("still refuses unrequested types on a rejected application", async () => {
    const openRequest = makeDocumentRequest({ requestedTypes: ["PROOF_OF_INCOME"] });
    prisma.application.findFirst.mockResolvedValue(
      makeApplication({ status: "REJECTED", submissionStatus: "REJECTED", documentRequests: [openRequest] }),
    );
    const res = await upload("PHOTO_ID");
    expect(res.status).toBe(409);
  });
});

describe("POST /api/applications/:id/submit", () => {
  beforeEach(() => {
    prisma.application.updateMany.mockResolvedValue({ count: 1 });
    prisma.application.update.mockImplementation(async ({ data }) => makeApplication(data));
    prisma.commissionRate.findUnique.mockResolvedValue({ carrierId: "c1", rateBps: 500 });
  });

  it("submits with the decrypted SSN, records the reference, and books the agent's commission", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    carrier.submit.mockResolvedValue({ outcome: "ACCEPTED", reference: "BLUEPEAK-ABCD1234", message: "ok" });

    const res = await request(app).post("/api/applications/app-1/submit").set(auth());

    expect(res.status).toBe(200);
    expect(carrier.submit.mock.calls[0][0]).toMatchObject({ attempt: 1, applicant: { ssn: "123456789", zipCode: "10001" } });
    expect(prisma.application.update.mock.calls[0][0].data).toMatchObject({
      status: "SUBMITTED",
      submissionStatus: "ACCEPTED",
      carrierReference: "BLUEPEAK-ABCD1234",
    });
    // 468.00/mo × 12 × 5% = 280.80
    expect(prisma.commission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ agentId: "agent-1", premiumCents: 46800, rateBps: 500, amountCents: 28080 }),
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("emails an enrollment confirmation and audits the carrier response", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    carrier.submit.mockResolvedValue({
      outcome: "ACCEPTED",
      reference: "BLUEPEAK-ABCD1234",
      message: "ok",
      meta: { transport: "http", httpStatus: 200, attempts: 2, durationMs: 1234 },
    });

    await request(app).post("/api/applications/app-1/submit").set(auth());

    expect(mailer.send).toHaveBeenCalledOnce();
    const sent = mailer.send.mock.calls[0][0];
    expect(sent).toMatchObject({ to: "user@example.com", subject: "We received your insurance application" });
    expect(sent.text).toContain("BLUEPEAK-ABCD1234");
    expect(JSON.stringify(sent)).not.toMatch(/Silver Select|ASTHMA|6789/);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "carrier.response",
        entityId: "app-1",
        metadata: expect.objectContaining({ outcome: "ACCEPTED", httpStatus: 200, httpAttempts: 2, transport: "http" }),
      }),
    });
  });

  it("audits a carrier failure with its retryability", async () => {
    const { CarrierUnavailableError } = await import("../src/integrations/carrierSubmission");
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    carrier.submit.mockRejectedValue(
      new CarrierUnavailableError("Carrier API unavailable: HTTP 503 after 3 attempts", { transport: "http", httpStatus: 503, attempts: 3, durationMs: 9000 }, true),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(app).post("/api/applications/app-1/submit").set(auth());

    expect(res.status).toBe(502);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "carrier.response",
        metadata: expect.objectContaining({ outcome: "ERROR", retryable: true, httpStatus: 503, httpAttempts: 3 }),
      }),
    });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("books no commission when no agent is assigned", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication({ agentId: null, agent: null }));
    carrier.submit.mockResolvedValue({ outcome: "ACCEPTED", reference: "R", message: "ok" });
    await request(app).post("/api/applications/app-1/submit").set(auth());
    expect(prisma.commission.create).not.toHaveBeenCalled();
  });

  it("marks a carrier rejection REJECTED and notifies the applicant without PHI", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    carrier.submit.mockResolvedValue({ outcome: "REJECTED", reference: null, message: "Identity not verified" });

    const res = await request(app).post("/api/applications/app-1/submit").set(auth());

    expect(res.status).toBe(200);
    expect(prisma.application.update.mock.calls[0][0].data).toMatchObject({ status: "REJECTED", submissionStatus: "REJECTED" });
    expect(prisma.commission.create).not.toHaveBeenCalled();
    expect(mailer.send).toHaveBeenCalledOnce();
    expect(JSON.stringify(mailer.send.mock.calls[0][0])).not.toMatch(/ASTHMA|6789/);
  });

  it("409s with the missing documents listed", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication({ documents: [DOCS[0]] }));
    const res = await request(app).post("/api/applications/app-1/submit").set(auth());
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Proof of address/);
    expect(carrier.submit).not.toHaveBeenCalled();
  });

  it("409s when a concurrent request already claimed the submission", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    prisma.application.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post("/api/applications/app-1/submit").set(auth());
    expect(res.status).toBe(409);
    expect(carrier.submit).not.toHaveBeenCalled();
  });

  it("records FAILED and returns 502 when the carrier is unreachable, so the user can retry", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    carrier.submit.mockRejectedValue(new Error("timeout"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await request(app).post("/api/applications/app-1/submit").set(auth());

    expect(res.status).toBe(502);
    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ submissionStatus: "FAILED" }) }),
    );
  });
});
