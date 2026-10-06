import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderSmsTemplate, smsSegmentInfo, unknownSmsVariables } from "@insurance/shared";
import { makeDbMock } from "./fixtures";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeDbMock> }));
vi.mock("../src/lib/prisma", async () => {
  const { makeDbMock: make } = await import("./fixtures");
  db.current = make();
  return { prisma: db.current };
});

const sms = vi.hoisted(() => ({ send: vi.fn(), name: "log" }));
vi.mock("../src/integrations/sms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/integrations/sms")>()),
  smsTransport: sms,
}));

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { resetRateLimits } from "../src/lib/rateLimit";
import { TwilioSmsTransport } from "../src/integrations/sms";
import { SMS_TEMPLATE_DEFAULTS } from "../src/modules/admin/notificationTemplates";

const app = createApp();
const as = (adminRole: string, role = "ADMIN") => ({
  Authorization: `Bearer ${signAccessToken({ sub: "admin-1", role: role as "ADMIN", adminRole: adminRole as "SUPER" })}`,
});
const OPS = as("OPERATIONS");
const FINANCE = as("FINANCE");
let prisma: ReturnType<typeof makeDbMock>;

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  prisma = db.current;
  sms.send.mockResolvedValue({ transport: "log", providerMessageId: null });
});

describe("GET /api/admin/notifications/sms/templates", () => {
  it("lists every template, merging saved edits over the defaults", async () => {
    prisma.smsTemplate.findMany.mockResolvedValue([
      { key: "APPLICATION_APPROVED", body: "Approved, {userName}!", isActive: false, updatedAt: new Date("2026-10-01T00:00:00Z"), updatedBy: { firstName: "Ada", lastName: "Admin" } },
    ]);
    const res = await request(app).get("/api/admin/notifications/sms/templates").set(FINANCE);
    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(6);
    const approved = res.body.templates.find((t: { key: string }) => t.key === "APPLICATION_APPROVED");
    expect(approved).toMatchObject({ body: "Approved, {userName}!", isCustomized: true, isActive: false, updatedBy: "Ada Admin" });
    const welcome = res.body.templates.find((t: { key: string }) => t.key === "USER_WELCOME");
    expect(welcome).toMatchObject({ body: SMS_TEMPLATE_DEFAULTS.USER_WELCOME.body, isCustomized: false, isActive: true, updatedAt: null });
  });

  it("is admin-only", async () => {
    expect((await request(app).get("/api/admin/notifications/sms/templates").set(as("", "AGENT"))).status).toBe(403);
  });
});

describe("PUT /api/admin/notifications/sms/templates/:key", () => {
  it("saves an edit and audits it without the message text", async () => {
    prisma.smsTemplate.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ ...create, updatedAt: new Date(), updatedBy: { firstName: "Ada", lastName: "Admin" } }));
    const res = await request(app)
      .put("/api/admin/notifications/sms/templates/DOCUMENT_REQUEST")
      .set(OPS)
      .send({ body: "Hi {userName}, upload docs for {appId}.", isActive: true });
    expect(res.status).toBe(200);
    expect(res.body.template).toMatchObject({ key: "DOCUMENT_REQUEST", isCustomized: true });
    expect(prisma.smsTemplate.upsert.mock.calls[0][0].create).toMatchObject({ key: "DOCUMENT_REQUEST", updatedById: "admin-1" });
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: "admin.notifications.sms_template.update", entityId: "DOCUMENT_REQUEST" });
    expect(JSON.stringify(audit)).not.toContain("upload docs");
  });

  it.each([
    ["an unknown variable", { body: "Hi {firstName}", isActive: true }, /Unknown variable/],
    ["an empty body", { body: "   ", isActive: true }, /empty/],
    ["an over-long body", { body: "x".repeat(500), isActive: true }, /Validation failed/],
  ])("400s on %s", async (_label, body, message) => {
    const res = await request(app).put("/api/admin/notifications/sms/templates/USER_WELCOME").set(OPS).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
    expect(prisma.smsTemplate.upsert).not.toHaveBeenCalled();
  });

  it("404-style 400s on an unknown key and is limited to SUPER/OPERATIONS", async () => {
    expect((await request(app).put("/api/admin/notifications/sms/templates/NOPE").set(OPS).send({ body: "x", isActive: true })).status).toBe(400);
    expect((await request(app).put("/api/admin/notifications/sms/templates/USER_WELCOME").set(FINANCE).send({ body: "x", isActive: true })).status).toBe(403);
  });

  it("resets to the default by removing the saved edit", async () => {
    const res = await request(app).post("/api/admin/notifications/sms/templates/USER_WELCOME/reset").set(OPS);
    expect(res.status).toBe(200);
    expect(prisma.smsTemplate.deleteMany).toHaveBeenCalledWith({ where: { key: "USER_WELCOME" } });
    expect(res.body.template).toMatchObject({ isCustomized: false, body: SMS_TEMPLATE_DEFAULTS.USER_WELCOME.body });
  });
});

describe("POST /api/admin/notifications/sms/send", () => {
  it("renders the saved template with sample/override variables and masks the number in the audit log", async () => {
    prisma.smsTemplate.findUnique.mockResolvedValue({ key: "APPLICATION_STATUS_UPDATE", body: "{userName}: {appId} is {status}", isActive: true });
    const res = await request(app)
      .post("/api/admin/notifications/sms/send")
      .set(OPS)
      .send({ to: "+1 (555) 123-4567", templateKey: "APPLICATION_STATUS_UPDATE", variables: { userName: "Sam", status: "" } });
    expect(res.status).toBe(200);
    expect(sms.send).toHaveBeenCalledWith({ to: "+15551234567", body: "Sam: APP-4F2A is Approved" });
    expect(res.body).toMatchObject({ status: "logged", transport: "log", to: "••••••••4567", segments: 1 });
    const audit = JSON.stringify(prisma.auditLog.create.mock.calls[0][0].data);
    expect(audit).toContain("4567");
    expect(audit).not.toContain("5551234567");
  });

  it("can test unsaved text, falling back to the default when nothing is saved", async () => {
    await request(app).post("/api/admin/notifications/sms/send").set(OPS).send({ to: "+15551234567", body: "Draft for {userName}" });
    expect(sms.send.mock.calls[0][0].body).toBe("Draft for Uma");
    prisma.smsTemplate.findUnique.mockResolvedValue(null);
    await request(app).post("/api/admin/notifications/sms/send").set(OPS).send({ to: "+15551234567", templateKey: "USER_WELCOME" });
    expect(sms.send.mock.calls[1][0].body).toContain("welcome to Insurance Marketplace");
  });

  it.each([
    ["a non-E.164 number", { to: "555-1234", templateKey: "USER_WELCOME" }],
    ["no template or body", { to: "+15551234567" }],
    ["unknown variables in the body", { to: "+15551234567", body: "Hi {ssn}" }],
  ])("400s on %s", async (_label, body) => {
    expect((await request(app).post("/api/admin/notifications/sms/send").set(OPS).send(body)).status).toBe(400);
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("502s when the provider fails, and rate limits test sends", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    sms.send.mockRejectedValueOnce(new Error("Twilio responded 400"));
    const send = () => request(app).post("/api/admin/notifications/sms/send").set(OPS).send({ to: "+15551234567", body: "Hi" });
    expect((await send()).status).toBe(502);
    for (let i = 0; i < 4; i++) await send();
    expect((await send()).status).toBe(429);
    spy.mockRestore();
  });

  it("is limited to SUPER/OPERATIONS", async () => {
    expect((await request(app).post("/api/admin/notifications/sms/send").set(FINANCE).send({ to: "+15551234567", body: "Hi" })).status).toBe(403);
  });
});

describe("GET /api/admin/notifications/email/templates", () => {
  it("renders every email template with sample data", async () => {
    const res = await request(app).get("/api/admin/notifications/email/templates").set(FINANCE);
    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBeGreaterThanOrEqual(15);
    for (const t of res.body.templates) {
      expect(t.subject).toBeTruthy();
      expect(t.html).toContain("<p>");
    }
  });
});

describe("Twilio transport", () => {
  it("posts a form-encoded message with basic auth and returns the message SID", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }));
    const t = new TwilioSmsTransport({ accountSid: "AC1", authToken: "tok", from: "+15550000000", fetchImpl, sleep: async () => undefined });
    await expect(t.send({ to: "+15551234567", body: "Hello" })).resolves.toEqual({ transport: "twilio", providerMessageId: "SM123" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("AC1:tok").toString("base64")}`);
    expect(new URLSearchParams(init.body).get("Body")).toBe("Hello");
  });

  it("throws with Twilio's message on an error response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Invalid 'To' number" }), { status: 400 }));
    const t = new TwilioSmsTransport({ accountSid: "AC1", authToken: "tok", from: "+1", fetchImpl, sleep: async () => undefined });
    await expect(t.send({ to: "+1", body: "x" })).rejects.toThrow(/Invalid 'To' number/);
  });
});

describe("SMS helpers", () => {
  it("counts GSM-7 and UCS-2 segments", () => {
    expect(smsSegmentInfo("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1 });
    expect(smsSegmentInfo("a".repeat(161))).toMatchObject({ segments: 2, perSegment: 153 });
    expect(smsSegmentInfo("€")).toMatchObject({ encoding: "GSM-7", length: 2 });
    expect(smsSegmentInfo("Hi 👋")).toMatchObject({ encoding: "UCS-2", segments: 1 });
    expect(smsSegmentInfo("")).toMatchObject({ segments: 0 });
  });

  it("renders known variables and reports unknown ones", () => {
    expect(renderSmsTemplate("{userName} {appId} {other}", { userName: "Uma", appId: "A1" })).toBe("Uma A1 {other}");
    expect(unknownSmsVariables("{userName} {ssn} {ssn} {}")).toEqual(["ssn", ""]);
  });
});
