import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_SETTINGS_DEFAULTS } from "@insurance/shared";
import { installTransaction, makeDbMock, makeUser } from "./fixtures";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeDbMock> }));
vi.mock("../src/lib/prisma", async () => {
  const { makeDbMock: make } = await import("./fixtures");
  db.current = make();
  return { prisma: db.current };
});
vi.mock("../src/integrations/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/integrations/email")>()),
  email: { send: vi.fn() },
}));

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { resetRateLimits } from "../src/lib/rateLimit";
import { diffSettings, mergeSettings } from "../src/modules/settings/settings.service";

const app = createApp();
const token = (role: string, adminRole: string | null = null) =>
  ({ Authorization: `Bearer ${signAccessToken({ sub: "u-1", role: role as "ADMIN", adminRole: adminRole as "SUPER" })}` });
const SUPER = token("ADMIN", "SUPER");
const OPS = token("ADMIN", "OPERATIONS");
const USER = token("USER");
let prisma: ReturnType<typeof makeDbMock>;

const withSettings = (overrides: { [K in keyof typeof SYSTEM_SETTINGS_DEFAULTS]?: Partial<(typeof SYSTEM_SETTINGS_DEFAULTS)[K]> }) =>
  prisma.systemSetting.findMany.mockResolvedValue(Object.entries(overrides).map(([key, value]) => ({ key, value })));

const full = (patch: (s: typeof SYSTEM_SETTINGS_DEFAULTS) => void = () => undefined) => {
  const s = structuredClone(SYSTEM_SETTINGS_DEFAULTS);
  patch(s);
  return s;
};

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  prisma = db.current;
  installTransaction(prisma);
});

describe("GET /api/admin/settings", () => {
  it("returns defaults when nothing is stored", async () => {
    prisma.systemSetting.findMany.mockResolvedValue([]);
    const res = await request(app).get("/api/admin/settings").set(OPS);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ settings: SYSTEM_SETTINGS_DEFAULTS, updatedAt: null, updatedBy: null });
  });

  it("merges stored values over defaults and ignores junk", () => {
    const merged = mergeSettings([
      { key: "session", value: { timeoutMinutes: 60, maxLoginAttempts: "lots", unknown: 1 } },
      { key: "bogus", value: { x: 1 } },
      { key: "features", value: [1, 2] },
    ]);
    expect(merged.session).toEqual({ timeoutMinutes: 60, maxLoginAttempts: 5 });
    expect(merged.features).toEqual(SYSTEM_SETTINGS_DEFAULTS.features);
  });

  it("is admin-only", async () => {
    expect((await request(app).get("/api/admin/settings").set(USER)).status).toBe(403);
    expect((await request(app).get("/api/admin/settings")).status).toBe(401);
  });
});

describe("POST /api/admin/settings", () => {
  it("saves all sections and audits old → new values for what changed", async () => {
    prisma.systemSetting.findMany.mockResolvedValue([]);
    const next = full((s) => {
      s.features.recommendations = true;
      s.session.timeoutMinutes = 45;
    });
    const res = await request(app).post("/api/admin/settings").set(SUPER).send(next);
    expect(res.status).toBe(200);
    expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(3);
    expect(prisma.systemSetting.upsert.mock.calls.find((c) => c[0].where.key === "session")![0].update).toEqual({
      value: next.session,
      updatedById: "u-1",
    });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "admin.settings.update",
      metadata: {
        changed: ["features.recommendations", "session.timeoutMinutes"],
        before: { "features.recommendations": false, "session.timeoutMinutes": 30 },
        after: { "features.recommendations": true, "session.timeoutMinutes": 45 },
      },
    });
  });

  it("doesn't write or audit when nothing changed", async () => {
    prisma.systemSetting.findMany.mockResolvedValue([]);
    expect((await request(app).post("/api/admin/settings").set(SUPER).send(full())).status).toBe(200);
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["a timeout below the minimum", full((s) => (s.session.timeoutMinutes = 1)), "session"],
    ["a fractional attempt count", full((s) => (s.session.maxLoginAttempts = 4.5)), "session"],
    ["maintenance on without a message", full((s) => { s.maintenance.enabled = true; s.maintenance.message = "  "; }), "maintenance"],
    ["an unknown field", { ...full(), extra: true }, ""],
  ])("400s on %s", async (_label, body, field) => {
    const res = await request(app).post("/api/admin/settings").set(SUPER).send(body);
    expect(res.status).toBe(400);
    if (field) expect(JSON.stringify(res.body.details)).toContain(field);
  });

  it("only SUPER admins can change settings", async () => {
    expect((await request(app).post("/api/admin/settings").set(OPS).send(full())).status).toBe(403);
  });

  it("diffs nested fields", () => {
    expect(diffSettings(full(), full((s) => (s.maintenance.message = "x")))).toEqual(["maintenance.message"]);
  });
});

describe("maintenance mode", () => {
  beforeEach(() => withSettings({ maintenance: { enabled: true, message: "Back at 5pm" } }));

  it("blocks non-admin API requests with the message", async () => {
    const res = await request(app).get("/api/plans?zip=10001");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Back at 5pm", code: "MAINTENANCE" });
    expect((await request(app).get("/api/applications").set(USER)).status).toBe(503);
  });

  it("lets admins, health, status and auth through", async () => {
    prisma.systemSetting.findFirst.mockResolvedValue(null);
    expect((await request(app).get("/api/admin/settings").set(OPS)).status).toBe(200);
    expect((await request(app).get("/api/health")).status).toBe(200);
    expect((await request(app).post("/api/auth/refresh")).status).toBe(204);
    const status = await request(app).get("/api/status");
    expect(status.body).toEqual({ maintenance: { enabled: true, message: "Back at 5pm" }, features: { twoFactor: true } });
  });

  it("doesn't let a forged admin token through", async () => {
    const forged = { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiQURNSU4ifQ.bad" };
    expect((await request(app).get("/api/plans?zip=10001").set(forged)).status).toBe(503);
  });
});

describe("feature: 2FA enrollment switch", () => {
  it("blocks starting and confirming setup when off, and reports it", async () => {
    withSettings({ features: { twoFactor: false } });
    prisma.user.findUnique.mockResolvedValue(makeUser({ id: "u-1" }));
    expect((await request(app).post("/api/users/me/2fa/enable").set(USER)).status).toBe(403);
    expect((await request(app).post("/api/users/me/2fa/verify").set(USER).send({ code: "123456" })).status).toBe(403);
    const status = await request(app).get("/api/users/me/2fa").set(USER);
    expect(status.body.setupAvailable).toBe(false);
  });
});

describe("session settings", () => {
  it("locks sign-in after the configured number of failures", async () => {
    withSettings({ session: { maxLoginAttempts: 3 } });
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash: bcrypt.hashSync("Password123!", 4) }));
    prisma.loginHistory.count.mockResolvedValue(3);
    expect((await request(app).post("/api/auth/login").send({ email: "user@example.com", password: "Password123!" })).status).toBe(429);
    prisma.loginHistory.count.mockResolvedValue(2);
    expect((await request(app).post("/api/auth/login").send({ email: "user@example.com", password: "Password123!" })).status).toBe(200);
  });

  it("ends a session that's been idle longer than the timeout", async () => {
    withSettings({ session: { timeoutMinutes: 30 } });
    const stored = { id: "rt-1", userId: "u-1", revokedAt: null, replacedByTokenId: null, expiresAt: new Date(Date.now() + 86_400_000), user: makeUser() };
    prisma.refreshToken.findUnique.mockResolvedValue({ ...stored, createdAt: new Date(Date.now() - 31 * 60_000) });
    const idle = await request(app).post("/api/auth/refresh").set("Cookie", "refresh_token=abc");
    expect(idle.status).toBe(401);
    expect(idle.body.error).toMatch(/timed out/);
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({ where: { id: "rt-1" }, data: { revokedAt: expect.any(Date) } });

    prisma.refreshToken.findUnique.mockResolvedValue({ ...stored, createdAt: new Date(Date.now() - 29 * 60_000) });
    prisma.refreshToken.create.mockResolvedValue({ id: "rt-2" });
    expect((await request(app).post("/api/auth/refresh").set("Cookie", "refresh_token=abc")).status).toBe(200);
  });

  it("falls back to defaults if settings can't be read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    prisma.systemSetting.findMany.mockRejectedValue(new Error("db down"));
    const res = await request(app).get("/api/status");
    expect(res.body.maintenance.enabled).toBe(false);
    spy.mockRestore();
  });
});
