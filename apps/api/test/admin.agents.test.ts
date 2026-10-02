import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTransaction, makeDbMock, makeUser } from "./fixtures";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeDbMock> }));
vi.mock("../src/lib/prisma", async () => {
  const { makeDbMock: make } = await import("./fixtures");
  db.current = make();
  return { prisma: db.current };
});

const mailer = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/integrations/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/integrations/email")>()),
  email: mailer,
}));

const assignment = vi.hoisted(() => ({ findAgentForZip: vi.fn() }));
vi.mock("../src/modules/agent/assignment", () => assignment);

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { resetRateLimits } from "../src/lib/rateLimit";
import { buildAgentWhere } from "../src/modules/admin/agents.service";
import { buildPerformance } from "../src/modules/agent/performance";

const app = createApp();
const as = (adminRole: string) => ({
  Authorization: `Bearer ${signAccessToken({ sub: "admin-1", role: "ADMIN", adminRole: adminRole as "SUPER" })}`,
});
const OPS = as("OPERATIONS");
const FINANCE = as("FINANCE");
const COMPLIANCE = as("COMPLIANCE");

const PROFILE = {
  userId: "agent-1",
  licenseNumber: "CA-123",
  npn: "1234567",
  licenseExpiresAt: new Date("2027-12-31T00:00:00Z"),
  regions: ["CA", "NY"],
  commissionRateBps: null,
  isActive: true,
  deactivatedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const agent = (overrides: Record<string, unknown> = {}, profile: Record<string, unknown> = {}) =>
  makeUser({ id: "agent-1", role: "AGENT", firstName: "Alex", lastName: "Agent", agentProfile: { ...PROFILE, ...profile }, ...overrides });

let prisma: ReturnType<typeof makeDbMock>;

function performanceMocks() {
  prisma.application.groupBy
    .mockResolvedValueOnce([
      { agentId: "agent-1", status: "SUBMITTED", _count: { _all: 2 } },
      { agentId: "agent-1", status: "APPROVED", _count: { _all: 3 } },
      { agentId: "agent-1", status: "REJECTED", _count: { _all: 2 } },
    ])
    .mockResolvedValueOnce([
      { agentId: "agent-1", status: "APPROVED", _count: { _all: 3 } },
      { agentId: "agent-1", status: "REJECTED", _count: { _all: 1 } },
    ]);
  prisma.commission.groupBy.mockResolvedValueOnce([
    { agentId: "agent-1", status: "EARNED", _sum: { amountCents: 50000 } },
    { agentId: "agent-1", status: "PAID", _sum: { amountCents: 25000 } },
  ]);
}

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  prisma = db.current;
  installTransaction(prisma);
});

describe("GET /api/admin/agents", () => {
  it("lists agents with performance and a commission summary", async () => {
    prisma.user.findMany.mockResolvedValue([agent()]);
    prisma.user.count.mockResolvedValueOnce(4).mockResolvedValueOnce(5);
    performanceMocks();

    const res = await request(app).get("/api/admin/agents?status=active&region=ca&search=alex").set(COMPLIANCE);

    expect(res.status).toBe(200);
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      role: "AGENT",
      isActive: true,
      agentProfile: { isActive: true, regions: { has: "CA" } },
    });
    expect(res.body.summary).toEqual({ active: 4, inactive: 1, commissions: { PENDING: 0, EARNED: 50000, PAID: 25000, VOID: 0 } });
    expect(res.body.agents[0]).toMatchObject({
      licenseNumber: "CA-123",
      licenseExpiresAt: "2027-12-31",
      regions: ["CA", "NY"],
      performance: { applicationsHandled: 7, openApplications: 2, approved: 3, rejected: 1, approvalRate: 0.75 },
    });
  });

  it("400s on an unknown region", async () => {
    expect((await request(app).get("/api/admin/agents?region=ZZ").set(OPS)).status).toBe(400);
  });
});

describe("POST /api/admin/agents", () => {
  const body = {
    email: "New.Agent@Example.com",
    firstName: "Nia",
    lastName: "Newagent",
    licenseNumber: "TX-55",
    regions: ["tx", "fl", "TX"],
    commissionRateBps: 650,
    licenseExpiresAt: "2028-01-31",
  };

  it("creates the agent with an unusable password and emails an invite link", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      agent({ id: "agent-9", email: data.email }, { regions: ["FL", "TX"], commissionRateBps: 650 }),
    );
    const res = await request(app).post("/api/admin/agents").set(OPS).send(body);

    expect(res.status).toBe(201);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: "new.agent@example.com", role: "AGENT" });
    expect(data.agentProfile.create).toMatchObject({ regions: ["FL", "TX"], commissionRateBps: 650, licenseNumber: "TX-55" });
    expect(data.passwordHash).toMatch(/^\$2/);
    expect(prisma.passwordResetToken.create.mock.calls[0][0].data.purpose).toBe("INVITE");
    expect(mailer.send.mock.calls[0][0].subject).toMatch(/agent account is ready/);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "admin.agent.create" }) });
  });

  it("409s on a duplicate email", async () => {
    prisma.user.findFirst.mockResolvedValue(makeUser());
    expect((await request(app).post("/api/admin/agents").set(OPS).send(body)).status).toBe(409);
  });

  it("validates input", async () => {
    const bad = await request(app).post("/api/admin/agents").set(OPS).send({ ...body, regions: [], commissionRateBps: 99999 });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.details.fieldErrors)).toEqual(expect.arrayContaining(["regions", "commissionRateBps"]));
  });

  it("is limited to SUPER/OPERATIONS", async () => {
    expect((await request(app).post("/api/admin/agents").set(FINANCE).send(body)).status).toBe(403);
  });
});

describe("PUT /api/admin/agents/:id", () => {
  it("updates regions and the commission override, auditing old and new rate", async () => {
    prisma.user.findFirst.mockResolvedValue(agent({}, { commissionRateBps: 500 }));
    performanceMocks();
    const res = await request(app).put("/api/admin/agents/agent-1").set(OPS).send({ regions: ["WA"], commissionRateBps: null });

    expect(res.status).toBe(200);
    expect(prisma.agentProfile.update.mock.calls[0][0]).toEqual({
      where: { userId: "agent-1" },
      data: { regions: ["WA"], commissionRateBps: null },
    });
    expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({
      fields: ["regions", "commissionRateBps"],
      commissionRateBps: null,
      previousCommissionRateBps: 500,
    });
  });

  it("rejects unknown fields and empty updates", async () => {
    prisma.user.findFirst.mockResolvedValue(agent());
    expect((await request(app).put("/api/admin/agents/agent-1").set(OPS).send({ email: "x@y.com" })).status).toBe(400);
    expect((await request(app).put("/api/admin/agents/agent-1").set(OPS).send({})).status).toBe(400);
  });

  it("404s for non-agents", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    expect((await request(app).put("/api/admin/agents/user-1").set(OPS).send({ firstName: "X" })).status).toBe(404);
  });
});

describe("GET /api/admin/agents/:id", () => {
  it("includes recent applications and commission history", async () => {
    prisma.user.findFirst.mockResolvedValue(agent());
    performanceMocks();
    prisma.application.findMany.mockResolvedValue([
      { id: "app-1", firstName: "Uma", lastName: "User", status: "APPROVED", submissionStatus: "ACCEPTED", updatedAt: new Date(), plan: { name: "Gold" } },
    ]);
    prisma.commission.count.mockResolvedValue(0);
    prisma.commission.findMany.mockResolvedValue([]);
    prisma.commission.groupBy.mockResolvedValue([]);
    const res = await request(app).get("/api/admin/agents/agent-1").set(FINANCE);
    expect(res.status).toBe(200);
    expect(res.body.agent.recentApplications[0]).toMatchObject({ applicantName: "Uma User", planName: "Gold" });
    expect(res.body.agent.commissionHistory).toEqual([]);
  });
});

describe("POST /api/admin/agents/:id/deactivate", () => {
  it("keeps history, blocks login, and reassigns unsubmitted work in-region", async () => {
    prisma.user.findFirst.mockResolvedValueOnce(agent()).mockResolvedValue(agent({ isActive: false }, { isActive: false }));
    prisma.application.findMany.mockResolvedValue([
      { id: "app-1", zipCode: "10001" },
      { id: "app-2", zipCode: "99999" },
    ]);
    assignment.findAgentForZip.mockImplementation(async (zip: string) => (zip === "10001" ? "agent-2" : null));
    prisma.application.groupBy.mockResolvedValue([]);
    prisma.commission.groupBy.mockResolvedValue([]);

    const res = await request(app).post("/api/admin/agents/agent-1/deactivate").set(OPS).send({ reassignOpen: true, reason: "Left the agency" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reassigned: 1, unassigned: 1, agent: { isActive: false } });
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ isActive: false, suspensionReason: "Left the agency" });
    expect(prisma.application.findMany.mock.calls[0][0].where).toMatchObject({ agentId: "agent-1" });
    expect(prisma.application.update.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: "app-1" }, data: { agentId: "agent-2" } },
      { where: { id: "app-2" }, data: { agentId: null } },
    ]);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
  });

  it("409s when already inactive", async () => {
    prisma.user.findFirst.mockResolvedValue(agent({ isActive: false }, { isActive: false }));
    expect((await request(app).post("/api/admin/agents/agent-1/deactivate").set(OPS).send({})).status).toBe(409);
  });

  it("reactivates", async () => {
    prisma.user.findFirst.mockResolvedValueOnce(agent({ isActive: false }, { isActive: false })).mockResolvedValue(agent());
    prisma.application.groupBy.mockResolvedValue([]);
    prisma.commission.groupBy.mockResolvedValue([]);
    const res = await request(app).post("/api/admin/agents/agent-1/reactivate").set(OPS);
    expect(res.status).toBe(200);
    expect(res.body.agent.isActive).toBe(true);
  });
});

describe("POST /api/admin/agents/:id/commissions/pay", () => {
  it("marks only EARNED commissions paid", async () => {
    prisma.user.findFirst.mockResolvedValue(agent());
    prisma.commission.findMany.mockResolvedValue([
      { id: "c1", amountCents: 1000 },
      { id: "c2", amountCents: 2500 },
    ]);
    prisma.commission.updateMany.mockResolvedValue({ count: 2 });

    const res = await request(app).post("/api/admin/agents/agent-1/commissions/pay").set(FINANCE).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ paidCount: 2, paidCents: 3500 });
    expect(prisma.commission.findMany.mock.calls[0][0].where).toEqual({ agentId: "agent-1", status: "EARNED" });
    expect(prisma.commission.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ["c1", "c2"] }, status: "EARNED" },
      data: { status: "PAID" },
    });
  });

  it("409s with nothing to pay, and is limited to SUPER/FINANCE", async () => {
    prisma.user.findFirst.mockResolvedValue(agent());
    prisma.commission.findMany.mockResolvedValue([]);
    expect((await request(app).post("/api/admin/agents/agent-1/commissions/pay").set(FINANCE).send({})).status).toBe(409);
    expect((await request(app).post("/api/admin/agents/agent-1/commissions/pay").set(OPS).send({})).status).toBe(403);
  });
});

describe("pure helpers", () => {
  it("builds the inactive filter as login-off OR pool-off", () => {
    expect(buildAgentWhere({ status: "inactive" })).toMatchObject({
      OR: [{ isActive: false }, { agentProfile: { isActive: false } }],
    });
  });

  it("only counts admin decisions toward the approval rate", () => {
    const perf = buildPerformance(
      ["a"],
      [{ agentId: "a", status: "REJECTED", _count: { _all: 5 } }],
      [],
      [],
    ).get("a")!;
    expect(perf).toMatchObject({ applicationsHandled: 5, rejected: 0, approvalRate: null });
  });
});
