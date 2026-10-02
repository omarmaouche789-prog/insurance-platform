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

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { resetRateLimits } from "../src/lib/rateLimit";
import { buildUserListQuery, userStatus } from "../src/modules/admin/users.service";

const app = createApp();
const token = (adminRole: string | null, role = "ADMIN", sub = "admin-1") =>
  signAccessToken({ sub, role: role as "ADMIN", adminRole: adminRole as "SUPER" });
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const SUPER = as(token("SUPER"));
const OPS = as(token("OPERATIONS"));
const FINANCE = as(token("FINANCE"));

let prisma: ReturnType<typeof makeDbMock>;

function detailMocks(user = makeUser()) {
  prisma.user.findUnique.mockResolvedValue({ ...user, agentProfile: null, applications: [], _count: { applications: 0 } });
  prisma.loginHistory.findMany.mockResolvedValue([]);
  prisma.auditLog.findMany.mockResolvedValue([]);
  prisma.backupCode.count.mockResolvedValue(0);
}

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  prisma = db.current;
  installTransaction(prisma);
});

describe("access control", () => {
  it("forbids non-admins", async () => {
    const res = await request(app).get("/api/admin/users").set(as(token(null, "AGENT", "agent-1")));
    expect(res.status).toBe(403);
  });

  it.each([
    ["/api/admin/users/u/suspend", { reason: "Fraud review" }],
    ["/api/admin/users/u/activate", {}],
    ["/api/admin/users/u/delete", { confirmEmail: "x@example.com" }],
    ["/api/admin/users/u/reset-password", {}],
    ["/api/admin/users/bulk", { action: "activate", ids: ["u"] }],
  ])("only SUPER/OPERATIONS may POST %s", async (path, body) => {
    const res = await request(app).post(path).set(FINANCE).send(body);
    expect(res.status).toBe(403);
  });

  it("lets any admin read", async () => {
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    expect((await request(app).get("/api/admin/users").set(FINANCE)).status).toBe(200);
  });
});

describe("GET /api/admin/users", () => {
  it("searches, filters by role and status, and returns per-status counts", async () => {
    prisma.user.count.mockResolvedValueOnce(1).mockResolvedValueOnce(7).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prisma.user.findMany.mockResolvedValue([makeUser({ twoFactorEnabled: true, lastLoginAt: new Date("2026-09-01T00:00:00Z") })]);

    const res = await request(app).get("/api/admin/users?search=uma%20user&role=USER,AGENT&status=ACTIVE&sort=lastLoginAt&page=2&pageSize=10").set(OPS);

    expect(res.status).toBe(200);
    const args = prisma.user.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ deletedAt: null, isActive: true, role: { in: ["USER", "AGENT"] } });
    expect(args.where.AND).toHaveLength(2);
    expect(args).toMatchObject({ skip: 10, take: 10 });
    expect(args.orderBy[0]).toEqual({ lastLoginAt: { sort: "desc", nulls: "last" } });
    expect(res.body.statusCounts).toEqual({ ACTIVE: 7, SUSPENDED: 2, DELETED: 1 });
    expect(res.body.users[0]).toMatchObject({ status: "ACTIVE", twoFactorEnabled: true, lastLoginAt: "2026-09-01T00:00:00.000Z" });
    expect(res.body.users[0].passwordHash).toBeUndefined();
  });

  it("400s on an unknown role or status", async () => {
    expect((await request(app).get("/api/admin/users?role=GOD").set(OPS)).status).toBe(400);
    expect((await request(app).get("/api/admin/users?status=LOST").set(OPS)).status).toBe(400);
  });
});

describe("pure helpers", () => {
  it("hides deleted accounts unless asked", () => {
    expect(buildUserListQuery({ sort: "createdAt", direction: "desc", page: 1, pageSize: 20 }).where).toEqual({ deletedAt: null });
    expect(buildUserListQuery({ status: "DELETED", sort: "name", direction: "asc", page: 1, pageSize: 20 })).toMatchObject({
      where: { deletedAt: { not: null } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    });
  });

  it("derives status", () => {
    expect(userStatus({ isActive: true, deletedAt: null })).toBe("ACTIVE");
    expect(userStatus({ isActive: false, deletedAt: null })).toBe("SUSPENDED");
    expect(userStatus({ isActive: false, deletedAt: new Date() })).toBe("DELETED");
  });
});

describe("GET /api/admin/users/:id", () => {
  it("returns a comprehensive profile", async () => {
    detailMocks(makeUser({ role: "AGENT" }));
    prisma.user.findUnique.mockResolvedValue({
      ...makeUser({ role: "AGENT" }),
      agentProfile: { licenseNumber: "CA-1", regions: ["CA"], isActive: true },
      applications: [{ id: "app-1", status: "SUBMITTED", submissionStatus: "ACCEPTED", updatedAt: new Date(), plan: { name: "Silver" } }],
      _count: { applications: 4 },
    });
    prisma.auditLog.findMany.mockResolvedValue([
      { id: "a1", action: "auth.login", entityType: "User", entityId: "user-1", ipAddress: "1.2.3.4", createdAt: new Date() },
    ]);
    const res = await request(app).get("/api/admin/users/user-1").set(FINANCE);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      applicationCount: 4,
      agentProfile: { regions: ["CA"] },
      applications: [{ planName: "Silver" }],
      recentActivity: [{ action: "auth.login" }],
    });
  });

  it("404s for unknown ids", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    expect((await request(app).get("/api/admin/users/nope").set(OPS)).status).toBe(404);
  });
});

describe("POST /api/admin/users/:id/suspend", () => {
  it("suspends with a reason, revokes sessions, emails without the reason, and audits", async () => {
    detailMocks();
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post("/api/admin/users/user-1/suspend").set(OPS).send({ reason: "Chargeback investigation" });

    expect(res.status).toBe(200);
    expect(prisma.user.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: "user-1", isActive: true, deletedAt: null },
      data: { isActive: false, suspensionReason: "Chargeback investigation" },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1", revokedAt: null } }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "admin.user.suspend", actorUserId: "admin-1", metadata: { reason: "Chargeback investigation" } }),
    });
    expect(JSON.stringify(mailer.send.mock.calls[0][0])).not.toMatch(/Chargeback/);
  });

  it("requires a reason", async () => {
    expect((await request(app).post("/api/admin/users/user-1/suspend").set(OPS).send({})).status).toBe(400);
  });

  it("refuses to act on yourself", async () => {
    detailMocks(makeUser({ id: "admin-1", role: "ADMIN", adminRole: "SUPER" }));
    const res = await request(app).post("/api/admin/users/admin-1/suspend").set(SUPER).send({ reason: "testing" });
    expect(res.status).toBe(400);
  });

  it("only lets SUPER admins act on other admins", async () => {
    detailMocks(makeUser({ id: "admin-2", role: "ADMIN", adminRole: "FINANCE" }));
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    expect((await request(app).post("/api/admin/users/admin-2/suspend").set(OPS).send({ reason: "Left company" })).status).toBe(403);
    expect((await request(app).post("/api/admin/users/admin-2/suspend").set(SUPER).send({ reason: "Left company" })).status).toBe(200);
  });

  it("409s when already suspended or deleted", async () => {
    detailMocks(makeUser({ isActive: false }));
    expect((await request(app).post("/api/admin/users/user-1/suspend").set(OPS).send({ reason: "again" })).status).toBe(409);
    detailMocks(makeUser({ deletedAt: new Date() }));
    expect((await request(app).post("/api/admin/users/user-1/suspend").set(OPS).send({ reason: "again" })).status).toBe(409);
  });
});

describe("POST /api/admin/users/:id/activate", () => {
  it("reactivates and puts agents back in the assignment pool", async () => {
    detailMocks(makeUser({ isActive: false, role: "AGENT", suspendedAt: new Date() }));
    const res = await request(app).post("/api/admin/users/user-1/activate").set(OPS);
    expect(res.status).toBe(200);
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({ isActive: true, suspendedAt: null, suspensionReason: null });
    expect(prisma.agentProfile.updateMany).toHaveBeenCalled();
  });

  it("409s on an active account", async () => {
    detailMocks();
    expect((await request(app).post("/api/admin/users/user-1/activate").set(OPS)).status).toBe(409);
  });
});

describe("POST /api/admin/users/:id/delete", () => {
  it("requires the typed email to match", async () => {
    detailMocks();
    const res = await request(app).post("/api/admin/users/user-1/delete").set(OPS).send({ confirmEmail: "other@example.com" });
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("emails first, then anonymizes and keeps records; the audit row has no PII", async () => {
    detailMocks();
    const res = await request(app)
      .post("/api/admin/users/user-1/delete")
      .set(OPS)
      .send({ confirmEmail: " USER@example.com ", reason: "GDPR request" });

    expect(res.status).toBe(200);
    expect(mailer.send.mock.calls[0][0].to).toBe("user@example.com");
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: "deleted+user-1@deleted.invalid", firstName: "Deleted", isActive: false, phone: null });
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(prisma.twoFactorSecret.deleteMany).toHaveBeenCalled();
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalled();
    const audit = prisma.auditLog.create.mock.calls.at(-1)![0].data;
    expect(audit).toMatchObject({ action: "admin.user.delete", metadata: { role: "USER", reason: "GDPR request" } });
    expect(JSON.stringify(audit)).not.toContain("user@example.com");
  });
});

describe("POST /api/admin/users/:id/reset-password", () => {
  it("emails a single-use link and audits", async () => {
    detailMocks();
    const res = await request(app).post("/api/admin/users/user-1/reset-password").set(OPS);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("sent");
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1", usedAt: null } }));
    expect(prisma.passwordResetToken.create.mock.calls[0][0].data).toMatchObject({ purpose: "RESET", requestedById: "admin-1" });
    expect(mailer.send.mock.calls[0][0].text).toMatch(/administrator started a password reset/);
  });
});

describe("POST /api/admin/users/:id/2fa/reset", () => {
  it("removes the factor for account recovery and ends sessions", async () => {
    detailMocks(makeUser({ twoFactorEnabled: true, twoFactorSecret: { enabledAt: new Date() } }));
    prisma.user.findUnique
      .mockResolvedValueOnce(makeUser())
      .mockResolvedValueOnce(makeUser({ twoFactorSecret: { enabledAt: new Date() } }))
      .mockResolvedValue({ ...makeUser(), agentProfile: null, applications: [], _count: { applications: 0 } });
    const res = await request(app).post("/api/admin/users/user-1/2fa/reset").set(OPS);
    expect(res.status).toBe(200);
    expect(prisma.twoFactorSecret.deleteMany).toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "admin.user.2fa_reset" }) });
  });
});

describe("POST /api/admin/users/bulk", () => {
  it("reports per-id results and keeps going after a failure", async () => {
    prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "missing" ? null : { ...makeUser({ id: where.id }), agentProfile: null, applications: [], _count: { applications: 0 } },
    );
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.loginHistory.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.backupCode.count.mockResolvedValue(0);

    const res = await request(app)
      .post("/api/admin/users/bulk")
      .set(OPS)
      .send({ action: "suspend", ids: ["u1", "missing", "u2", "u1"], reason: "Spam accounts" });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([
      { id: "u1", ok: true },
      { id: "missing", ok: false, error: "User not found" },
      { id: "u2", ok: true },
    ]);
  });

  it("requires a reason to bulk-suspend", async () => {
    const res = await request(app).post("/api/admin/users/bulk").set(OPS).send({ action: "suspend", ids: ["u1"] });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/users/:id/login-history", () => {
  it("pages through a user's sign-ins", async () => {
    detailMocks();
    prisma.loginHistory.count.mockResolvedValue(30);
    prisma.loginHistory.findMany.mockResolvedValue([]);
    const res = await request(app).get("/api/admin/users/user-1/login-history?page=2&pageSize=10").set(FINANCE);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 30, page: 2, pageSize: 10 });
    expect(prisma.loginHistory.findMany.mock.calls.at(-1)![0]).toMatchObject({ where: { userId: "user-1" }, skip: 10, take: 10 });
  });
});
