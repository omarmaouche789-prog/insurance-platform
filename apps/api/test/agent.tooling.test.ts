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
const mailer = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/integrations/email", () => ({ email: mailer }));

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { followUpWhere, recentMonths } from "../src/modules/agent/tooling.service";

const app = createApp();
const auth = { Authorization: `Bearer ${signAccessToken({ sub: "agent-1", role: "AGENT", adminRole: null })}` };
const adminAuth = { Authorization: `Bearer ${signAccessToken({ sub: "admin-1", role: "ADMIN", adminRole: "COMPLIANCE" })}` };
const userAuth = { Authorization: `Bearer ${signAccessToken({ sub: "user-1", role: "USER", adminRole: null })}` };

let prisma: ReturnType<typeof makeDbMock>;
beforeEach(() => {
  vi.resetAllMocks();
  prisma = db.current;
  installTransaction(prisma);
  storage.delete.mockResolvedValue(undefined);
});

const assigned = () => prisma.application.findFirst.mockResolvedValue({ id: "app-1", firstName: "Uma", lastName: "User" });
const followUpRow = (overrides: Record<string, unknown> = {}) => ({
  id: "fu-1",
  applicationId: "app-1",
  agentId: "agent-1",
  dueAt: new Date(Date.now() + 86_400_000),
  note: "Call about income docs",
  completedAt: null,
  createdAt: new Date(),
  application: { firstName: "Uma", lastName: "User" },
  ...overrides,
});

describe("document requests", () => {
  it("notifies the applicant in-app when documents are requested", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    const res = await request(app)
      .post("/api/agent/applications/app-1/request-documents")
      .set(auth)
      .send({ requestedTypes: ["PROOF_OF_INCOME"], message: "Latest pay stub please" });
    expect(res.status).toBe(201);
    expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({
      userId: "user-1",
      type: "document.requested",
      link: "/account/applications/app-1",
    });
  });

  it("marks a fulfilled request complete", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication({ documentRequests: [makeDocumentRequest({ status: "COMPLETED" })] }));
    prisma.documentRequest.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post("/api/agent/applications/app-1/document-requests/req-1/complete").set(auth);

    expect(res.status).toBe(200);
    expect(prisma.documentRequest.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "req-1", applicationId: "app-1", status: { in: ["OPEN", "FULFILLED"] } },
      data: { status: "COMPLETED", completedById: "agent-1" },
    });
    expect(res.body.application.documentRequests[0].status).toBe("COMPLETED");
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "agent.document_request.complete" }) });
  });

  it("cancels, and 409s/404s on closed or unknown requests", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    prisma.documentRequest.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post("/api/agent/applications/app-1/document-requests/req-1/cancel").set(auth)).status).toBe(200);
    expect(prisma.documentRequest.updateMany.mock.calls[0][0].data.status).toBe("CANCELLED");

    prisma.documentRequest.updateMany.mockResolvedValue({ count: 0 });
    prisma.documentRequest.findFirst.mockResolvedValueOnce({ id: "req-1" }).mockResolvedValueOnce(null);
    expect((await request(app).post("/api/agent/applications/app-1/document-requests/req-1/complete").set(auth)).status).toBe(409);
    expect((await request(app).post("/api/agent/applications/app-1/document-requests/nope/complete").set(auth)).status).toBe(404);
  });

  it("404s on someone else's application", async () => {
    prisma.application.findFirst.mockResolvedValue(null);
    expect((await request(app).post("/api/agent/applications/app-9/document-requests/req-1/complete").set(auth)).status).toBe(404);
  });
});

describe("applicant upload → live agent notification", () => {
  it("notifies the assigned agent when a requested document arrives", async () => {
    const open = makeDocumentRequest({ requestedTypes: ["PROOF_OF_INCOME"] });
    prisma.application.findFirst.mockResolvedValue(
      makeApplication({ status: "REJECTED", submissionStatus: "REJECTED", documentRequests: [open] }),
    );
    prisma.documentRequest.findMany.mockResolvedValue([open]);
    prisma.applicationDocument.findMany.mockResolvedValue([{ type: "PROOF_OF_INCOME", uploadedAt: new Date() }]);

    const pdf = Buffer.from("%PDF-1.4 test");
    const res = await request(app).post("/api/applications/app-1/documents/PROOF_OF_INCOME").set(userAuth).attach("file", pdf, "income.pdf");

    expect(res.status).toBe(200);
    expect(prisma.documentRequest.updateMany.mock.calls[0][0].data).toMatchObject({ status: "FULFILLED" });
    expect(prisma.notification.create.mock.calls[0][0].data).toMatchObject({
      userId: "agent-1",
      type: "document.uploaded",
      title: "Uma User uploaded proof of income",
      body: "A document request is ready for your review.",
      link: "/agent/applications/app-1",
    });
  });

  it("doesn't notify for ordinary wizard uploads", async () => {
    prisma.application.findFirst.mockResolvedValue(makeApplication());
    const res = await request(app)
      .post("/api/applications/app-1/documents/PHOTO_ID")
      .set(userAuth)
      .attach("file", Buffer.from("%PDF-1.4"), "id.pdf");
    expect(res.status).toBe(200);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

describe("follow-ups", () => {
  it("schedules a follow-up on an assigned application", async () => {
    assigned();
    const dueAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    prisma.followUp.create.mockResolvedValue(followUpRow({ dueAt: new Date(dueAt) }));
    const res = await request(app).post("/api/agent/applications/app-1/schedule-followup").set(auth).send({ dueAt, note: "Call about income docs" });

    expect(res.status).toBe(201);
    expect(prisma.followUp.create.mock.calls[0][0].data).toMatchObject({ applicationId: "app-1", agentId: "agent-1", note: "Call about income docs" });
    expect(res.body.followUp).toMatchObject({ applicantName: "Uma User", dueAt });
  });

  it.each([
    ["in the past", { dueAt: new Date(Date.now() - 3_600_000).toISOString(), note: "x" }],
    ["more than a year out", { dueAt: new Date(Date.now() + 400 * 86_400_000).toISOString(), note: "x" }],
    ["without a note", { dueAt: new Date(Date.now() + 3_600_000).toISOString(), note: " " }],
    ["with a bad date", { dueAt: "tomorrow", note: "x" }],
  ])("400s %s", async (_label, body) => {
    expect((await request(app).post("/api/agent/applications/app-1/schedule-followup").set(auth).send(body)).status).toBe(400);
  });

  it("lists by filter with counts", async () => {
    prisma.followUp.findMany.mockResolvedValue([followUpRow()]);
    prisma.followUp.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);
    const res = await request(app).get("/api/agent/follow-ups?filter=overdue").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ overdue: 1, upcoming: 2, completed: 3 });
    expect(prisma.followUp.findMany.mock.calls[0][0].where).toMatchObject({ agentId: "agent-1", completedAt: null, dueAt: { lt: expect.any(Date) } });
  });

  it("completes once", async () => {
    prisma.followUp.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    prisma.followUp.findFirst.mockResolvedValue(followUpRow({ completedAt: new Date() }));
    expect((await request(app).post("/api/agent/follow-ups/fu-1/complete").set(auth)).status).toBe(200);
    expect((await request(app).post("/api/agent/follow-ups/fu-1/complete").set(auth)).status).toBe(409);
  });

  it("deletes only the caller's own follow-ups", async () => {
    prisma.followUp.findFirst.mockResolvedValueOnce(followUpRow()).mockResolvedValueOnce(null);
    expect((await request(app).delete("/api/agent/follow-ups/fu-1").set(auth)).status).toBe(204);
    expect((await request(app).delete("/api/agent/follow-ups/fu-2").set(auth)).status).toBe(404);
    expect(prisma.followUp.findFirst.mock.calls[1][0].where).toEqual({ id: "fu-2", agentId: "agent-1" });
  });

  it("lists an application's follow-ups", async () => {
    assigned();
    prisma.followUp.findMany.mockResolvedValue([followUpRow()]);
    const res = await request(app).get("/api/agent/applications/app-1/follow-ups").set(auth);
    expect(res.body.followUps).toHaveLength(1);
  });

  it("maps filters to queries", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(followUpWhere("a", "upcoming", now)).toEqual({ agentId: "a", completedAt: null, dueAt: { gte: now } });
    expect(followUpWhere("a", "completed", now)).toEqual({ agentId: "a", completedAt: { not: null } });
    expect(followUpWhere("a", "all", now)).toEqual({ agentId: "a" });
  });
});

describe("internal notes", () => {
  const noteRow = { id: "n1", body: "Applicant prefers email", createdAt: new Date(), author: { id: "agent-1", firstName: "Alex", lastName: "Agent", role: "AGENT" } };

  it("adds a note without putting its text in the audit log", async () => {
    assigned();
    prisma.applicationNote.create.mockResolvedValue(noteRow);
    const res = await request(app).post("/api/agent/applications/app-1/notes").set(auth).send({ body: "Applicant prefers email" });
    expect(res.status).toBe(201);
    expect(res.body.note.author.firstName).toBe("Alex");
    expect(JSON.stringify(prisma.auditLog.create.mock.calls[0][0])).not.toContain("prefers email");
  });

  it("lists notes; admins can read them too; applicants can't", async () => {
    assigned();
    prisma.applicationNote.findMany.mockResolvedValue([noteRow]);
    expect((await request(app).get("/api/agent/applications/app-1/notes").set(auth)).body.notes).toHaveLength(1);

    prisma.application.findUnique.mockResolvedValue({ id: "app-1" });
    expect((await request(app).get("/api/admin/applications/app-1/notes").set(adminAuth)).status).toBe(200);
    prisma.application.findUnique.mockResolvedValue(null);
    expect((await request(app).get("/api/admin/applications/nope/notes").set(adminAuth)).status).toBe(404);

    expect((await request(app).get("/api/agent/applications/app-1/notes").set(userAuth)).status).toBe(403);
  });

  it("400s on an empty note", async () => {
    expect((await request(app).post("/api/agent/applications/app-1/notes").set(auth).send({ body: "  " })).status).toBe(400);
  });
});

describe("GET /api/agent/performance", () => {
  it("returns totals, a 6-month trend, and workload counts", async () => {
    prisma.application.groupBy
      .mockResolvedValueOnce([{ agentId: "agent-1", status: "APPROVED", _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ agentId: "agent-1", status: "APPROVED", _count: { _all: 2 } }]);
    prisma.commission.groupBy.mockResolvedValue([{ agentId: "agent-1", status: "EARNED", _sum: { amountCents: 9000 } }]);
    const now = new Date();
    prisma.application.findMany
      .mockResolvedValueOnce([{ createdAt: now }, { createdAt: now }])
      .mockResolvedValueOnce([{ status: "APPROVED", reviewedAt: now }, { status: "REJECTED", reviewedAt: now }]);
    prisma.commission.findMany.mockResolvedValue([{ createdAt: now, amountCents: 9000 }]);
    prisma.documentRequest.count.mockResolvedValue(3);
    prisma.followUp.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(4);

    const res = await request(app).get("/api/agent/performance").set(auth);

    expect(res.status).toBe(200);
    expect(res.body.performance).toMatchObject({ approved: 2, approvalRate: 1, commissions: { EARNED: 9000 } });
    expect(res.body.monthly).toHaveLength(6);
    expect(res.body.monthly[5]).toMatchObject({ applications: 2, approved: 1, rejected: 1, commissionCents: 9000 });
    expect(res.body).toMatchObject({ openDocumentRequests: 3, followUps: { overdue: 1, dueToday: 2, upcoming: 4 } });
  });

  it("computes month buckets across a year boundary", () => {
    expect(recentMonths(new Date("2027-02-15T00:00:00Z"), 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
});
