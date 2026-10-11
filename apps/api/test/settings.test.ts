import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAINTENANCE_MESSAGE, SYSTEM_SETTINGS_DEFAULTS } from "@insurance/shared";
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
import { mergeSettings } from "../src/modules/settings/settings.service";
import { sendNotificationEmail, sendTemplatedEmail } from "../src/modules/emailTemplates/emailTemplates.service";

const app = createApp();
const token = (role: string, adminRole: string | null = null, sub = "u-1") =>
  ({ Authorization: `Bearer ${signAccessToken({ sub, role: role as "ADMIN", adminRole: adminRole as "SUPER" })}` });
const SUPER = token("ADMIN", "SUPER");
const OPS = token("ADMIN", "OPERATIONS");
const AGENT = token("AGENT");
const USER = token("USER");
let prisma: ReturnType<typeof makeDbMock>;

type Overrides = { [K in keyof typeof SYSTEM_SETTINGS_DEFAULTS]?: Partial<(typeof SYSTEM_SETTINGS_DEFAULTS)[K]> };
const UPDATED = new Date("2026-10-10T12:00:00Z");
// Stored rows, one per setting, as the table holds them.
const rows = (overrides: Overrides) =>
  Object.entries(overrides).flatMap(([section, values]) =>
    Object.entries(values as object).map(([key, value]) => ({ section, key, value, updatedAt: UPDATED, updatedBy: { firstName: "Ada", lastName: "Admin" } })),
  );
const withSettings = (overrides: Overrides) => prisma.systemSetting.findMany.mockResolvedValue(rows(overrides));

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  prisma = db.current;
  installTransaction(prisma);
  prisma.systemSetting.findMany.mockResolvedValue([]);
  prisma.systemSetting.upsert.mockResolvedValue({});
  mailer.send.mockResolvedValue(true);
});

const upserted = () =>
  prisma.systemSetting.upsert.mock.calls.map((c) => ({ section: c[0].where.section_key.section, key: c[0].where.section_key.key, value: c[0].update.value }));

describe("reading settings", () => {
  it("returns the defaults when nothing is stored", async () => {
    const res = await request(app).get("/api/admin/settings").set(OPS);
    expect(res.status).toBe(200);
    expect(res.body.settings).toEqual(SYSTEM_SETTINGS_DEFAULTS);
    expect(res.body.meta.general).toEqual({ updatedAt: null, updatedBy: null });
    expect(SYSTEM_SETTINGS_DEFAULTS.maintenance.maintenanceMessage).toBe("The system is under maintenance. Please try again later.");
  });

  it("lays stored rows over the defaults and ignores junk", () => {
    const merged = mergeSettings([
      { section: "general", key: "companyName", value: "Acme Health" },
      { section: "session", key: "timeoutMinutes", value: "lots" }, // wrong type
      { section: "localization", key: "timezone", value: "MARS" }, // not an option
      { section: "features", key: "recommendations", value: true }, // removed setting
      { section: "bogus", key: "x", value: 1 },
    ]);
    expect(merged.general.companyName).toBe("Acme Health");
    expect(merged.session.timeoutMinutes).toBe(30);
    expect(merged.localization.timezone).toBe("EST");
    expect(merged).not.toHaveProperty("bogus");
    expect(merged.features).not.toHaveProperty("recommendations");
  });

  it("returns one section with who changed it last", async () => {
    withSettings({ general: { platformName: "Acme" } });
    const res = await request(app).get("/api/admin/settings/general").set(OPS);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      section: "general",
      values: { ...SYSTEM_SETTINGS_DEFAULTS.general, platformName: "Acme" },
      meta: { updatedAt: UPDATED.toISOString(), updatedBy: "Ada Admin" },
    });
    expect((await request(app).get("/api/admin/settings/nope").set(OPS)).status).toBe(404);
  });

  it("is admin-only", async () => {
    expect((await request(app).get("/api/admin/settings").set(USER)).status).toBe(403);
    expect((await request(app).get("/api/admin/settings")).status).toBe(401);
  });

  it("publishes branding, localization, feature visibility and maintenance on /api/status", async () => {
    withSettings({ general: { platformName: "Acme" }, features: { blog: false }, maintenance: { maintenanceMode: true, maintenanceMessage: "Back soon" } });
    const res = await request(app).get("/api/status");
    expect(res.body).toEqual({
      maintenance: { enabled: true, message: "Back soon" },
      features: { twoFactorRequired: false, analytics: true, blog: false },
      general: { ...SYSTEM_SETTINGS_DEFAULTS.general, platformName: "Acme" },
      localization: SYSTEM_SETTINGS_DEFAULTS.localization,
    });
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("PUT /api/admin/settings/general", () => {
  const general = { ...SYSTEM_SETTINGS_DEFAULTS.general, companyName: "  Acme Health  ", supportEmail: "help@acme.example" };

  it("saves only what changed and audits before → after", async () => {
    const res = await request(app).put("/api/admin/settings/general").set(SUPER).send(general);
    expect(res.status).toBe(200);
    expect(upserted()).toEqual([
      { section: "general", key: "companyName", value: "Acme Health" },
      { section: "general", key: "supportEmail", value: "help@acme.example" },
    ]);
    expect(prisma.systemSetting.upsert.mock.calls[0][0].create).toMatchObject({ section: "general", key: "companyName", updatedById: "u-1" });
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: "admin.settings.update", entityType: "SystemSettings", entityId: "general" });
    expect(audit.metadata).toEqual({
      section: "general",
      changed: ["companyName", "supportEmail"],
      before: { companyName: SYSTEM_SETTINGS_DEFAULTS.general.companyName, supportEmail: SYSTEM_SETTINGS_DEFAULTS.general.supportEmail },
      after: { companyName: "Acme Health", supportEmail: "help@acme.example" },
    });
  });

  it("doesn't write or audit when nothing changed", async () => {
    await request(app).put("/api/admin/settings/general").set(SUPER).send(SYSTEM_SETTINGS_DEFAULTS.general).expect(200);
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ companyName: "" }, /Company name is required/],
    [{ platformName: "   " }, /Platform name is required/],
    [{ supportEmail: "not-an-email" }, /valid support email/],
    [{ supportPhone: "call us" }, /valid support phone/],
    [{ logoUrl: "javascript:alert(1)" }, /Logo URL must start with https/],
  ])("rejects %j", async (patch, message) => {
    const res = await request(app).put("/api/admin/settings/general").set(SUPER).send({ ...SYSTEM_SETTINGS_DEFAULTS.general, ...patch });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it("allows an empty logo URL and requires every field", async () => {
    await request(app).put("/api/admin/settings/general").set(SUPER).send({ ...SYSTEM_SETTINGS_DEFAULTS.general, logoUrl: "" }).expect(200);
    const { supportPhone: _, ...missing } = SYSTEM_SETTINGS_DEFAULTS.general;
    const res = await request(app).put("/api/admin/settings/general").set(SUPER).send(missing);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing setting: supportPhone/);
    const extra = await request(app).put("/api/admin/settings/general").set(SUPER).send({ ...SYSTEM_SETTINGS_DEFAULTS.general, color: "red" });
    expect(extra.body.error).toMatch(/Unknown setting: color/);
  });

  it("is SUPER-only: OPERATIONS and others can only read", async () => {
    expect((await request(app).put("/api/admin/settings/general").set(OPS).send(general)).status).toBe(403);
    expect((await request(app).put("/api/admin/settings/maintenance/maintenanceMode").set(OPS).send({ value: true })).status).toBe(403);
    expect((await request(app).post("/api/admin/settings/features/blog/toggle").set(OPS)).status).toBe(403);
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });
});

describe("PUT /api/admin/settings/:section/:key", () => {
  it("updates a single setting", async () => {
    const res = await request(app).put("/api/admin/settings/maintenance/maintenanceMessage").set(SUPER).send({ value: "  Back at 2am  " });
    expect(res.status).toBe(200);
    expect(upserted()).toEqual([{ section: "maintenance", key: "maintenanceMessage", value: "Back at 2am" }]);
    expect(res.body.settings.maintenance).toBeDefined();
  });

  it("validates the key and the value", async () => {
    expect((await request(app).put("/api/admin/settings/maintenance/nope").set(SUPER).send({ value: 1 })).body.error).toMatch(/Unknown setting/);
    expect((await request(app).put("/api/admin/settings/session/timeoutMinutes").set(SUPER).send({ value: 2 })).body.error).toMatch(/at least 5/);
    expect((await request(app).put("/api/admin/settings/session/timeoutMinutes").set(SUPER).send({ value: "30" })).body.error).toMatch(/must be a number/);
    expect((await request(app).put("/api/admin/settings/localization/timezone").set(SUPER).send({ value: "MARS" })).body.error).toMatch(/valid timezone/);
    // English-only for now: Arabic is listed as coming soon.
    expect((await request(app).put("/api/admin/settings/localization/language").set(SUPER).send({ value: "ar" })).status).toBe(400);
    expect((await request(app).put("/api/admin/settings/nope/x").set(SUPER).send({ value: 1 })).status).toBe(404);
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it("won't turn on maintenance mode without a message", async () => {
    withSettings({ maintenance: { maintenanceMessage: "" } });
    const res = await request(app).put("/api/admin/settings/maintenance/maintenanceMode").set(SUPER).send({ value: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Write the message/);
  });

  it("saves the whole localization section", async () => {
    const res = await request(app)
      .put("/api/admin/settings/localization")
      .set(SUPER)
      .send({ timezone: "PST", language: "en", dateFormat: "YYYY-MM-DD", timeFormat: "24h" });
    expect(res.status).toBe(200);
    expect(upserted().map((r) => r.key)).toEqual(["timezone", "dateFormat", "timeFormat"]);
  });
});

describe("POST /api/admin/settings/features/:feature/toggle", () => {
  it("flips the current value and logs who toggled what", async () => {
    const res = await request(app).post("/api/admin/settings/features/analytics/toggle").set(SUPER);
    expect(res.status).toBe(200);
    expect(upserted()).toEqual([{ section: "features", key: "analytics", value: false }]);
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "admin.settings.feature_toggle",
      actorUserId: "u-1",
      metadata: { section: "features", changed: ["analytics"], before: { analytics: true }, after: { analytics: false } },
    });
  });

  it("sets an explicit value, and does nothing when it's already set", async () => {
    await request(app).post("/api/admin/settings/features/twoFactor/toggle").set(SUPER).send({ enabled: true }).expect(200);
    expect(upserted()).toEqual([{ section: "features", key: "twoFactor", value: true }]);
    prisma.systemSetting.upsert.mockClear();
    await request(app).post("/api/admin/settings/features/blog/toggle").set(SUPER).send({ enabled: true }).expect(200);
    expect(prisma.systemSetting.upsert).not.toHaveBeenCalled();
  });

  it("404s an unknown feature", async () => {
    expect((await request(app).post("/api/admin/settings/features/recommendations/toggle").set(SUPER)).status).toBe(404);
  });
});

describe("maintenance mode", () => {
  beforeEach(() => withSettings({ maintenance: { maintenanceMode: true, maintenanceMessage: "Back at 2am ET" } }));

  it("blocks non-admin API requests with the message", async () => {
    const res = await request(app).get("/api/plans?zip=10001");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Back at 2am ET", code: "MAINTENANCE" });
    expect(res.headers["retry-after"]).toBe("120");
    expect((await request(app).get("/api/applications").set(USER)).status).toBe(503);
  });

  it("lets admins, health, status and auth through", async () => {
    expect((await request(app).get("/api/admin/settings").set(OPS)).status).toBe(200);
    expect((await request(app).get("/api/health")).status).toBe(200);
    expect((await request(app).get("/api/status")).body.maintenance).toEqual({ enabled: true, message: "Back at 2am ET" });
    expect((await request(app).post("/api/auth/login").send({ email: "x@example.com", password: "x" })).status).not.toBe(503);
  });

  it("doesn't let a forged admin token through", async () => {
    const forged = { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwicm9sZSI6IkFETUlOIn0.bad" };
    expect((await request(app).get("/api/plans?zip=10001").set(forged)).status).toBe(503);
  });
});

describe("feature: require 2FA for admins and agents", () => {
  it("is off by default: staff without 2FA can work normally", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: "ADMIN", twoFactorEnabled: false }));
    expect((await request(app).get("/api/admin/settings").set(OPS)).status).toBe(200);
  });

  it("when on, sends admins and agents without 2FA to set it up first", async () => {
    withSettings({ features: { twoFactor: true } });
    prisma.user.findUnique.mockResolvedValue(makeUser({ id: "u-1", role: "ADMIN", twoFactorEnabled: false }));
    const res = await request(app).get("/api/admin/settings").set(OPS);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TWO_FACTOR_REQUIRED");
    expect((await request(app).get("/api/agent/applications").set(AGENT)).body.code).toBe("TWO_FACTOR_REQUIRED");
    // …but can still reach their own 2FA setup and the status endpoint.
    const status = await request(app).get("/api/users/me/2fa").set(OPS);
    expect(status.status).toBe(200);
    expect(status.body.required).toBe(true);
    expect((await request(app).get("/api/status")).status).toBe(200);
  });

  it("lets staff with 2FA through and never applies to applicants", async () => {
    withSettings({ features: { twoFactor: true } });
    prisma.user.findUnique.mockResolvedValue(makeUser({ role: "ADMIN", twoFactorEnabled: true }));
    expect((await request(app).get("/api/admin/settings").set(OPS)).status).toBe(200);
    prisma.user.findUnique.mockResolvedValue(makeUser({ twoFactorEnabled: false }));
    const asUser = await request(app).get("/api/users/me/2fa").set(USER);
    expect(asUser.body.required).toBe(false);
    expect(asUser.status).toBe(200);
    prisma.application.findMany.mockResolvedValue([]);
    expect((await request(app).get("/api/applications").set(USER)).body.code).not.toBe("TWO_FACTOR_REQUIRED");
  });

  it("won't let an admin turn 2FA off while it's required", async () => {
    withSettings({ features: { twoFactor: true } });
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ role: "ADMIN", twoFactorEnabled: true, twoFactorSecret: { enabledAt: new Date(), secret: "x", lastUsedStep: null } }),
    );
    const res = await request(app).post("/api/users/me/2fa/disable").set(OPS).send({ password: "x", code: "123456" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/required for your role/);
  });

  it("enrollment is always available (no more on/off switch for setup)", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ id: "u-1" }));
    prisma.twoFactorSecret.upsert.mockResolvedValue({});
    expect((await request(app).post("/api/users/me/2fa/enable").set(USER)).status).toBe(200);
  });
});

describe("feature: email notifications", () => {
  it("when off, application-update emails are skipped and nothing else breaks", async () => {
    withSettings({ features: { emailNotifications: false } });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await expect(sendTemplatedEmail("APPLICATION_APPROVED", "uma@example.com", "app-1", { userName: "Uma" })).resolves.toBe(false);
    await expect(sendNotificationEmail({ to: "a@example.com", subject: "s", text: "t", html: "h" }, "test")).resolves.toBe(false);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/email notifications are turned off/));
    info.mockRestore();
  });

  it("when on, they send", async () => {
    await expect(sendNotificationEmail({ to: "a@example.com", subject: "s", text: "t", html: "h" }, "test")).resolves.toBe(true);
    expect(mailer.send).toHaveBeenCalledOnce();
  });
});

describe("features: analytics and blog", () => {
  it("hides the analytics API when analytics is off", async () => {
    withSettings({ features: { analytics: false } });
    const res = await request(app).get("/api/admin/analytics/users?from=2026-01-01&to=2026-01-31").set(OPS);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("hides the public blog (404) and the blog CMS (403) when the blog is off", async () => {
    withSettings({ features: { blog: false } });
    expect((await request(app).get("/api/blog/posts")).status).toBe(404);
    expect((await request(app).get("/api/admin/cms/posts").set(OPS)).status).toBe(403);
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

    prisma.refreshToken.findUnique.mockResolvedValue({ ...stored, createdAt: new Date(Date.now() - 29 * 60_000) });
    prisma.refreshToken.create.mockResolvedValue({ id: "rt-2" });
    expect((await request(app).post("/api/auth/refresh").set("Cookie", "refresh_token=abc")).status).toBe(200);
  });

  it("falls back to defaults if settings can't be read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    prisma.systemSetting.findMany.mockRejectedValue(new Error("db down"));
    const res = await request(app).get("/api/status");
    expect(res.body.maintenance).toEqual({ enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE });
    spy.mockRestore();
  });
});
