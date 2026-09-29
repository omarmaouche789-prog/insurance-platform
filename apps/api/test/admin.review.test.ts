import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTransaction, makeApplication, makeDbMock } from "./fixtures";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeDbMock> }));
vi.mock("../src/lib/prisma", async () => {
  const { makeDbMock: make } = await import("./fixtures");
  db.current = make();
  return { prisma: db.current };
});

const storage = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock("../src/integrations/documentStorage", () => ({ documentStorage: storage }));

const carrier = vi.hoisted(() => ({ submit: vi.fn(), notifyDecision: vi.fn() }));
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
const token = (role: "USER" | "AGENT" | "ADMIN", adminRole: "SUPER" | "OPERATIONS" | "COMPLIANCE" | "FINANCE" | null = null) =>
  ({ Authorization: `Bearer ${signAccessToken({ sub: `${role.toLowerCase()}-1`, role, adminRole })}` });
const ops = token("ADMIN", "OPERATIONS");
const compliance = token("ADMIN", "COMPLIANCE");

const PENDING = { status: "SUBMITTED", submissionStatus: "ACCEPTED", carrierReference: "BLUEPEAK-AAAA1111", submittedAt: new Date() };

let prisma: ReturnType<typeof makeDbMock>;
beforeEach(() => {
  vi.resetAllMocks();
  prisma = db.current;
  installTransaction(prisma);
  prisma.application.updateMany.mockResolvedValue({ count: 1 });
  prisma.commission.updateMany.mockResolvedValue({ count: 1 });
});

describe("access control", () => {
  it.each([
    ["get", "/api/admin/applications/pending"],
    ["get", "/api/admin/applications/queue"],
    ["get", "/api/admin/applications/metrics"],
    ["post", "/api/admin/applications/app-1/approve"],
  ] as const)("forbids agents and users from %s %s", async (method, path) => {
    for (const who of [token("AGENT"), token("USER")]) {
      expect((await request(app)[method](path).set(who)).status).toBe(403);
    }
  });

  it("lets any admin sub-role read the queue", async () => {
    prisma.application.count.mockResolvedValue(0);
    prisma.application.findMany.mockResolvedValue([]);
    expect((await request(app).get("/api/admin/applications/pending").set(compliance)).status).toBe(200);
  });

  it.each([
    ["post", "/api/admin/applications/app-1/approve", {}],
    ["post", "/api/admin/applications/app-1/reject", { reason: "x" }],
    ["post", "/api/admin/applications/bulk", { action: "approve", ids: ["app-1"] }],
  ] as const)("limits %s %s to SUPER/OPERATIONS admins", async (_m, path, body) => {
    for (const who of [compliance, token("ADMIN", "FINANCE")]) {
      expect((await request(app).post(path).set(who).send(body)).status).toBe(403);
    }
    expect(prisma.application.updateMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/applications/pending and /queue", () => {
  const row = { ...makeApplication(PENDING), agent: { firstName: "Alex", lastName: "Agent" } };

  it("lists pending applications across all agents, oldest first", async () => {
    prisma.application.count.mockResolvedValue(1);
    prisma.application.findMany.mockResolvedValue([row]);

    const res = await request(app).get("/api/admin/applications/pending").set(ops);

    expect(res.status).toBe(200);
    const args = prisma.application.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: "SUBMITTED", submissionStatus: "ACCEPTED" });
    expect(args.where).not.toHaveProperty("agentId");
    expect(args.orderBy[0]).toEqual({ submittedAt: "asc" });
    expect(res.body.items[0]).toMatchObject({ applicantName: "Uma User", agentName: "Alex Agent" });
  });

  it("paginates and sorts the queue", async () => {
    prisma.application.count.mockResolvedValue(45);
    prisma.application.findMany.mockResolvedValue([row]);

    const res = await request(app)
      .get("/api/admin/applications/queue?status=SUBMITTED,REJECTED&sort=premium&direction=desc&page=3&pageSize=10")
      .set(ops);

    expect(res.status).toBe(200);
    const args = prisma.application.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 20, take: 10, where: { status: { in: ["SUBMITTED", "REJECTED"] } } });
    expect(args.orderBy).toEqual([{ plan: { monthlyPremiumCents: "desc" } }, { id: "asc" }]);
    expect(res.body).toMatchObject({ total: 45, page: 3, pageSize: 10 });
  });

  it("400s on an unknown sort", async () => {
    expect((await request(app).get("/api/admin/applications/queue?sort=ssn").set(ops)).status).toBe(400);
  });
});

describe("POST /api/admin/applications/:id/approve", () => {
  const approve = (body: object = {}) => request(app).post("/api/admin/applications/app-1/approve").set(ops).send(body);

  beforeEach(() => {
    prisma.application.findUnique
      .mockResolvedValueOnce(makeApplication(PENDING))
      .mockResolvedValueOnce(
        makeApplication({ ...PENDING, status: "APPROVED", reviewedAt: new Date(), reviewNotes: "looks good", commission: { status: "EARNED", amountCents: 28080 } }),
      );
  });

  it("approves atomically, moves the commission to EARNED, notifies the carrier, and audits", async () => {
    const res = await approve({ notes: "looks good" });

    expect(res.status).toBe(200);
    expect(prisma.application.updateMany).toHaveBeenCalledWith({
      where: { id: "app-1", status: "SUBMITTED", submissionStatus: "ACCEPTED" },
      data: expect.objectContaining({ status: "APPROVED", reviewedById: "admin-1", reviewNotes: "looks good" }),
    });
    expect(prisma.commission.updateMany).toHaveBeenCalledWith({
      where: { applicationId: "app-1", status: "PENDING" },
      data: { status: "EARNED" },
    });
    expect(carrier.notifyDecision).toHaveBeenCalledWith(
      expect.objectContaining({ carrierCode: "BLUEPEAK", carrierReference: "BLUEPEAK-AAAA1111", decision: "APPROVED" }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "admin.application.approve", actorUserId: "admin-1", entityId: "app-1" }),
    });
    expect(res.body.application).toMatchObject({ status: "APPROVED", reviewNotes: "looks good", commission: { status: "EARNED" } });
  });

  it("notes are optional", async () => {
    expect((await approve()).status).toBe(200);
    expect(prisma.application.updateMany.mock.calls[0][0].data.reviewNotes).toBeNull();
  });

  it("409s without side effects when another admin decided first", async () => {
    prisma.application.updateMany.mockResolvedValue({ count: 0 });
    const res = await approve();
    expect(res.status).toBe(409);
    expect(prisma.commission.updateMany).not.toHaveBeenCalled();
    expect(carrier.notifyDecision).not.toHaveBeenCalled();
  });

  it("keeps the approval when the carrier notice fails, and records that in the audit", async () => {
    carrier.notifyDecision.mockRejectedValue(new Error("carrier down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await approve();

    expect(res.status).toBe(200);
    const audit = prisma.auditLog.create.mock.calls.find((c) => c[0].data.action === "admin.application.approve");
    expect(audit![0].data.metadata).toMatchObject({ carrierNotified: false });
  });
});

describe("POST /api/admin/applications/:id/approve preconditions", () => {
  it.each([
    ["a draft", { status: "DRAFT", submissionStatus: "NOT_SUBMITTED" }],
    ["a carrier-rejected", { status: "REJECTED", submissionStatus: "REJECTED" }],
    ["an already-approved", { status: "APPROVED", submissionStatus: "ACCEPTED" }],
  ])("409s on %s application", async (_label, state) => {
    prisma.application.findUnique.mockResolvedValue(makeApplication(state));
    const res = await request(app).post("/api/admin/applications/app-1/approve").set(ops).send({});
    expect(res.status).toBe(409);
    expect(prisma.application.updateMany).not.toHaveBeenCalled();
  });

  it("404s on an unknown application", async () => {
    prisma.application.findUnique.mockResolvedValue(null);
    expect((await request(app).post("/api/admin/applications/nope/approve").set(ops).send({})).status).toBe(404);
  });
});

describe("POST /api/admin/applications/:id/reject", () => {
  const reject = (body: object) => request(app).post("/api/admin/applications/app-1/reject").set(ops).send(body);

  it("requires a reason", async () => {
    expect((await reject({})).status).toBe(400);
    expect((await reject({ reason: "   " })).status).toBe(400);
    expect(prisma.application.updateMany).not.toHaveBeenCalled();
  });

  it("rejects, voids the pending commission, and notifies agent and applicant without the reason", async () => {
    prisma.application.findUnique
      .mockResolvedValueOnce(makeApplication(PENDING))
      .mockResolvedValueOnce(makeApplication({ ...PENDING, status: "REJECTED", reviewedAt: new Date(), reviewNotes: "Income mismatch" }));

    const res = await reject({ reason: "Income mismatch" });

    expect(res.status).toBe(200);
    expect(prisma.application.updateMany.mock.calls[0][0].data).toMatchObject({ status: "REJECTED", reviewNotes: "Income mismatch" });
    expect(prisma.commission.updateMany).toHaveBeenCalledWith({
      where: { applicationId: "app-1", status: "PENDING" },
      data: { status: "VOID" },
    });
    const recipients = mailer.send.mock.calls.map((c) => c[0].to);
    expect(recipients).toEqual(["agent@example.com", "user@example.com"]);
    for (const [email] of mailer.send.mock.calls) expect(JSON.stringify(email)).not.toContain("Income mismatch");
    expect(carrier.notifyDecision).not.toHaveBeenCalled();
    expect(res.body.application).toMatchObject({ status: "REJECTED", canResubmit: false, review: { reason: "Income mismatch" } });
  });

  it("skips the agent email for an unassigned application", async () => {
    prisma.application.findUnique.mockResolvedValue(makeApplication({ ...PENDING, agentId: null, agent: null }));
    await reject({ reason: "x" });
    expect(mailer.send.mock.calls.map((c) => c[0].to)).toEqual(["user@example.com"]);
  });
});

describe("POST /api/admin/applications/bulk", () => {
  const bulk = (body: object) => request(app).post("/api/admin/applications/bulk").set(ops).send(body);

  it("decides each id independently and reports per-id results", async () => {
    prisma.application.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "missing") return null;
      if (where.id === "done") return makeApplication({ id: "done", status: "APPROVED", submissionStatus: "ACCEPTED" });
      return makeApplication({ ...PENDING, id: where.id });
    });

    const res = await bulk({ action: "approve", ids: ["a", "missing", "done", "b", "a"] });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      { id: "a", ok: true },
      { id: "missing", ok: false, error: "Application not found" },
      { id: "done", ok: false, error: "This application isn't awaiting review" },
      { id: "b", ok: true },
    ]);
    expect(carrier.notifyDecision).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "admin.application.bulk_approve", metadata: { requested: 4, succeeded: 2 } }),
    });
  });

  it("requires a reason for bulk rejection", async () => {
    expect((await bulk({ action: "reject", ids: ["a"] })).status).toBe(400);
  });

  it("caps a batch at 100", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    expect((await bulk({ action: "approve", ids })).status).toBe(400);
  });
});

describe("GET /api/admin/applications/metrics", () => {
  it("combines pending counts with decision stats over the window", async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
    prisma.application.count.mockResolvedValue(3);
    prisma.application.findFirst.mockResolvedValue({ submittedAt: hoursAgo(50) });
    prisma.application.findMany.mockResolvedValue([
      { status: "APPROVED", submittedAt: hoursAgo(30), reviewedAt: hoursAgo(20) },
      { status: "APPROVED", submittedAt: hoursAgo(10), reviewedAt: hoursAgo(8) },
      { status: "REJECTED", submittedAt: hoursAgo(40), reviewedAt: hoursAgo(10) },
    ]);

    const res = await request(app).get("/api/admin/applications/metrics?days=7").set(compliance);

    expect(res.status).toBe(200);
    expect(prisma.application.findMany.mock.calls[0][0].where.reviewedAt.gte.getTime()).toBeCloseTo(Date.now() - 7 * 86400_000, -4);
    expect(res.body).toMatchObject({
      windowDays: 7,
      pendingCount: 3,
      approvedCount: 2,
      rejectedCount: 1,
      averageReviewHours: 14, // (10 + 2 + 30) / 3
      medianReviewHours: 10,
    });
    expect(res.body.approvalRate).toBeCloseTo(2 / 3);
  });
});

describe("GET /api/admin/applications/:id", () => {
  it("returns any agent's application and audits the view", async () => {
    prisma.application.findUnique.mockResolvedValue(makeApplication({ ...PENDING, agentId: "someone-else" }));
    const res = await request(app).get("/api/admin/applications/app-1").set(compliance);
    expect(res.status).toBe(200);
    expect(res.body.application).toMatchObject({ awaitingDecision: true, personal: { ssnLast4: "6789" } });
    expect(JSON.stringify(res.body)).not.toContain("123456789");
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "admin.application.view", actorUserId: "admin-1" }),
    });
  });
});
