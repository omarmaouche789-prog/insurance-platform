import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTransaction, makeApplication, makeDbMock, makeDocumentRequest } from "./fixtures";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeDbMock> }));
vi.mock("../src/lib/prisma", async () => {
  const { makeDbMock: make } = await import("./fixtures");
  db.current = make();
  return { prisma: db.current };
});

const storage = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock("../src/integrations/documentStorage", () => ({ documentStorage: storage }));

const carrier = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("../src/integrations/carrierSubmission", () => ({ carrierSubmission: carrier }));

const mailer = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/integrations/notifications", () => ({ notifications: mailer }));

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";

const app = createApp();
const agentToken = signAccessToken({ sub: "agent-1", role: "AGENT", adminRole: null });
const userToken = signAccessToken({ sub: "user-1", role: "USER", adminRole: null });
const auth = (token = agentToken) => ({ Authorization: `Bearer ${token}` });

let prisma: ReturnType<typeof makeDbMock>;
beforeEach(() => {
  vi.resetAllMocks();
  prisma = db.current;
  installTransaction(prisma);
});

describe("access control", () => {
  it.each([
    ["get", "/api/agent/applications"],
    ["get", "/api/agent/applications/app-1"],
    ["post", "/api/agent/applications/app-1/resubmit"],
    ["get", "/api/agent/commission"],
  ] as const)("forbids non-agents from %s %s", async (method, path) => {
    const res = await request(app)[method](path).set(auth(userToken));
    expect(res.status).toBe(403);
  });

  it("requires a token", async () => {
    expect((await request(app).get("/api/agent/applications")).status).toBe(401);
  });

  it("404s on an application assigned to a different agent", async () => {
    prisma.application.findFirst.mockResolvedValue(null);
    const res = await request(app).get("/api/agent/applications/app-1").set(auth());
    expect(res.status).toBe(404);
    expect(prisma.application.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app-1", agentId: "agent-1" } }),
    );
  });
});

describe("GET /api/agent/applications", () => {
  beforeEach(() => {
    prisma.application.count.mockResolvedValue(1);
    prisma.application.findMany.mockResolvedValue([
      { ...makeApplication({ status: "REJECTED", submissionAttempts: 1 }), _count: { documentRequests: 2 } },
    ]);
    prisma.application.groupBy.mockResolvedValue([
      { status: "REJECTED", _count: { _all: 1 } },
      { status: "SUBMITTED", _count: { _all: 4 } },
    ]);
  });

  it("lists only the caller's applications with status filters and per-status counts", async () => {
    const res = await request(app).get("/api/agent/applications?status=REJECTED,DRAFT&search=uma&page=2&pageSize=10").set(auth());

    expect(res.status).toBe(200);
    const args = prisma.application.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ agentId: "agent-1", status: { in: ["REJECTED", "DRAFT"] } });
    expect(args.where.OR).toHaveLength(3);
    expect(args).toMatchObject({ skip: 10, take: 10 });
    expect(res.body.statusCounts).toEqual({ DRAFT: 0, SUBMITTED: 4, APPROVED: 0, REJECTED: 1 });
    expect(res.body.applications[0]).toMatchObject({ applicantName: "Uma User", openDocumentRequests: 2 });
  });

  it("400s on an unknown status filter", async () => {
    const res = await request(app).get("/api/agent/applications?status=LOST").set(auth());
    expect(res.status).toBe(400);
  });
});

describe("GET /api/agent/applications/:id", () => {
  it("returns details with contact info, masks the SSN, and audit-logs the view", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    const res = await request(app).get("/api/agent/applications/app-1").set(auth());

    expect(res.status).toBe(200);
    expect(res.body.application.applicant).toEqual({ email: "user@example.com", phone: null });
    expect(res.body.application.personal.ssnLast4).toBe("6789");
    expect(JSON.stringify(res.body)).not.toContain("123456789");
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "agent.application.view", actorUserId: "agent-1", entityId: "app-1" }),
    });
  });

  it("flags rejected applications as resubmittable", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication({ status: "REJECTED", submissionStatus: "REJECTED" }));
    const res = await request(app).get("/api/agent/applications/app-1").set(auth());
    expect(res.body.application.canResubmit).toBe(true);
  });
});

describe("POST /api/agent/applications/:id/request-documents", () => {
  const send = (body: object) => request(app).post("/api/agent/applications/app-1/request-documents").set(auth()).send(body);

  it("creates the request and emails the applicant without the message contents", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication({ documentRequests: [makeDocumentRequest()] }));
    const res = await send({ requestedTypes: ["PROOF_OF_INCOME"], message: "Need your 2026 W-2 showing income" });

    expect(res.status).toBe(201);
    expect(prisma.documentRequest.create).toHaveBeenCalledWith({
      data: { applicationId: "app-1", agentId: "agent-1", message: "Need your 2026 W-2 showing income", requestedTypes: ["PROOF_OF_INCOME"] },
    });
    const email = mailer.send.mock.calls[0][0];
    expect(email.to).toBe("user@example.com");
    expect(email.body).toMatch(/Proof of income/);
    expect(email.body).not.toMatch(/W-2/);
  });

  it("400s without a document type or message", async () => {
    expect((await send({ requestedTypes: [], message: "x" })).status).toBe(400);
    expect((await send({ requestedTypes: ["PHOTO_ID"], message: "  " })).status).toBe(400);
    expect(prisma.documentRequest.create).not.toHaveBeenCalled();
  });

  it("409s once an admin has decided the application", async () => {
    prisma.application.findFirst.mockResolvedValue(
      makeApplication({ status: "APPROVED", submissionStatus: "ACCEPTED", reviewedAt: new Date() }),
    );
    const res = await send({ requestedTypes: ["PHOTO_ID"], message: "x" });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/agent/applications/:id/resubmit", () => {
  const resubmit = () => request(app).post("/api/agent/applications/app-1/resubmit").set(auth());

  beforeEach(() => {
    prisma.application.updateMany.mockResolvedValue({ count: 1 });
    prisma.application.update.mockResolvedValue({});
    prisma.commissionRate.findUnique.mockResolvedValue({ carrierId: "c1", rateBps: 500 });
  });

  it("resubmits a rejected application as the next attempt and books the commission on acceptance", async () => {
    const rejected = makeApplication({ status: "REJECTED", submissionStatus: "REJECTED", submissionAttempts: 1 });
    prisma.application.findFirst
      .mockResolvedValueOnce(rejected)
      .mockResolvedValueOnce(makeApplication({ status: "SUBMITTED", submissionStatus: "ACCEPTED", submissionAttempts: 2 }));
    carrier.submit.mockResolvedValue({ outcome: "ACCEPTED", reference: "BLUEPEAK-1", message: "ok" });

    const res = await resubmit();

    expect(res.status).toBe(200);
    expect(prisma.application.updateMany.mock.calls[0][0].where).toMatchObject({ id: "app-1", agentId: "agent-1" });
    expect(carrier.submit.mock.calls[0][0].attempt).toBe(2);
    expect(prisma.commission.create).toHaveBeenCalledWith({ data: expect.objectContaining({ agentId: "agent-1" }) });
    expect(res.body.application.submissionStatus).toBe("ACCEPTED");
  });

  it("allows retrying a failed first submission", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication({ status: "DRAFT", submissionStatus: "FAILED", submissionAttempts: 1 }));
    carrier.submit.mockResolvedValue({ outcome: "ACCEPTED", reference: "R", message: "ok" });
    expect((await resubmit()).status).toBe(200);
  });

  it.each([
    ["an accepted", { status: "SUBMITTED", submissionStatus: "ACCEPTED" }],
    ["an untouched draft", { status: "DRAFT", submissionStatus: "NOT_SUBMITTED" }],
    ["an in-flight", { status: "REJECTED", submissionStatus: "PENDING" }],
    ["an admin-rejected", { status: "REJECTED", submissionStatus: "ACCEPTED", reviewedAt: new Date() }],
  ])("409s on %s application", async (_label, state) => {
    prisma.application.findFirst.mockResolvedValue(makeApplication(state));
    const res = await resubmit();
    expect(res.status).toBe(409);
    expect(carrier.submit).not.toHaveBeenCalled();
  });
});

describe("documents and PDF", () => {
  it("streams a document as a no-sniff attachment with its stored type", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    storage.get.mockResolvedValue(Buffer.from("%PDF-1.7 id"));

    const res = await request(app).get("/api/agent/applications/app-1/documents/doc-0").set(auth());

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="PHOTO_ID.pdf"/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(storage.get).toHaveBeenCalledWith("applications/app-1/0.pdf");
  });

  it("404s on a document id from another application", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    const res = await request(app).get("/api/agent/applications/app-1/documents/doc-999").set(auth());
    expect(res.status).toBe(404);
    expect(storage.get).not.toHaveBeenCalled();
  });

  // The PDF is rendered from the same masked AgentApplicationDTO checked in the
  // detail test above; its content streams are compressed, so grepping the
  // bytes for the SSN here would prove nothing.
  it("renders a PDF summary", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication({ documentRequests: [makeDocumentRequest()] }));

    const res = await request(app)
      .get("/api/agent/applications/app-1/pdf")
      .set(auth())
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="application-app-1.pdf"');
  });
});

describe("GET /api/agent/commission", () => {
  it("returns the caller's commissions with per-status totals", async () => {
    prisma.commission.count.mockResolvedValue(1);
    prisma.commission.groupBy.mockResolvedValue([{ status: "PENDING", _sum: { amountCents: 28080 } }]);
    prisma.commission.findMany.mockResolvedValue([
      {
        id: "com-1",
        applicationId: "app-1",
        premiumCents: 46800,
        rateBps: 500,
        amountCents: 28080,
        status: "PENDING",
        createdAt: new Date(),
        carrier: { name: "BluePeak Health" },
        application: { firstName: "Uma", lastName: "User", plan: { name: "Silver Select" } },
      },
    ]);

    const res = await request(app).get("/api/agent/commission").set(auth());

    expect(res.status).toBe(200);
    expect(prisma.commission.findMany.mock.calls[0][0].where).toEqual({ agentId: "agent-1" });
    expect(res.body.totals).toEqual({ PENDING: 28080, EARNED: 0, PAID: 0, VOID: 0 });
    expect(res.body.commissions[0]).toMatchObject({ applicantName: "Uma User", amountCents: 28080 });
  });
});
