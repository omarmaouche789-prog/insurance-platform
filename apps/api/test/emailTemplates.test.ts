import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applicationReference, EMAIL_TEMPLATE_KEYS, fillEmailTemplate, unknownEmailVariables } from "@insurance/shared";
import { makeDbMock } from "./fixtures";

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
import { env } from "../src/lib/env";
import { signAccessToken } from "../src/lib/jwt";
import { resetRateLimits } from "../src/lib/rateLimit";
import { EMAIL_TEMPLATE_CATALOG } from "../src/modules/emailTemplates/catalog";
import {
  emailHtmlToText,
  renderEmailTemplate,
  resetEmailTemplateCache,
  sendTemplatedEmail,
} from "../src/modules/emailTemplates/emailTemplates.service";

const app = createApp();
const as = (adminRole: string) => ({
  Authorization: `Bearer ${signAccessToken({ sub: "admin-1", role: "ADMIN", adminRole: adminRole as "SUPER" })}`,
});
const SUPER = as("SUPER");
const OPS = as("OPERATIONS");
const FINANCE = as("FINANCE");
const COMPLIANCE = as("COMPLIANCE");
const USER = { Authorization: `Bearer ${signAccessToken({ sub: "user-1", role: "USER", adminRole: null })}` };
let prisma: ReturnType<typeof makeDbMock>;

const ID = "6f1b8a52-6c1e-4d55-9a2a-0c1d2e3f4a5b";
const row = (key: keyof typeof EMAIL_TEMPLATE_CATALOG = "APPLICATION_APPROVED", overrides: Record<string, unknown> = {}) => {
  const d = EMAIL_TEMPLATE_CATALOG[key];
  return {
    id: ID,
    key,
    name: d.name,
    description: d.description,
    variables: d.variables,
    subject: d.subject,
    body: d.body,
    isDefault: true,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-02T00:00:00Z"),
    updatedById: null,
    updatedBy: null,
    ...overrides,
  };
};
// Every catalog entry already in the table, so ensureEmailTemplates is a no-op.
const allRows = () =>
  EMAIL_TEMPLATE_KEYS.map((key, i) => ({ ...row(key), id: `00000000-0000-4000-8000-00000000000${i}` }));

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  resetEmailTemplateCache();
  prisma = db.current;
  prisma.systemSetting.findMany.mockResolvedValue([]);
  mailer.send.mockResolvedValue(true);
});

describe("GET /api/admin/email-templates", () => {
  it("creates the five default templates on first use and lists them in catalog order", async () => {
    prisma.emailTemplate.findMany
      .mockResolvedValueOnce([]) // ensure: nothing stored yet
      .mockResolvedValueOnce([...allRows()].reverse());
    const res = await request(app).get("/api/admin/email-templates").set(FINANCE);

    expect(res.status).toBe(200);
    const created = prisma.emailTemplate.createMany.mock.calls[0][0];
    expect(created.skipDuplicates).toBe(true);
    expect(created.data.map((d: { key: string }) => d.key)).toEqual([...EMAIL_TEMPLATE_KEYS]);
    expect(res.body.templates.map((t: { name: string }) => t.name)).toEqual([
      "Application Submitted",
      "Application Approved",
      "Application Rejected",
      "Agent Assigned",
      "Documents Requested",
    ]);
    expect(res.body.templates[0]).toMatchObject({ isDefault: true, callToAction: "View your application", audience: "Applicant" });
  });

  it("only seeds once per process and never overwrites stored wording", async () => {
    prisma.emailTemplate.findMany.mockResolvedValue(allRows());
    await request(app).get("/api/admin/email-templates").set(OPS);
    await request(app).get("/api/admin/email-templates").set(OPS);
    expect(prisma.emailTemplate.createMany).not.toHaveBeenCalled();
    expect(prisma.emailTemplate.update).not.toHaveBeenCalled();
    // ensure (once) + two lists
    expect(prisma.emailTemplate.findMany).toHaveBeenCalledTimes(3);
  });

  it("is admin-only", async () => {
    expect((await request(app).get("/api/admin/email-templates").set(USER)).status).toBe(403);
    expect((await request(app).get("/api/admin/email-templates")).status).toBe(401);
  });

  it("gets one template, and 404s an unknown id", async () => {
    prisma.emailTemplate.findMany.mockResolvedValue(allRows());
    prisma.emailTemplate.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    const res = await request(app).get(`/api/admin/email-templates/${ID}`).set(COMPLIANCE);
    expect(res.status).toBe(200);
    expect(res.body.template).toMatchObject({ id: ID, key: "APPLICATION_APPROVED", variables: ["userName", "appId", "status", "agentName"] });
    expect((await request(app).get(`/api/admin/email-templates/${ID}`).set(COMPLIANCE)).status).toBe(404);
  });
});

describe("PUT /api/admin/email-templates/:id", () => {
  beforeEach(() => {
    prisma.emailTemplate.findMany.mockResolvedValue(allRows());
    prisma.emailTemplate.findUnique.mockResolvedValue(row());
    prisma.emailTemplate.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      row("APPLICATION_APPROVED", { ...data, updatedBy: { firstName: "Ada", lastName: "Admin" } }),
    );
  });

  it("saves, sanitizes, records who changed what, and tracks whether it still matches the default", async () => {
    const res = await request(app)
      .put(`/api/admin/email-templates/${ID}`)
      .set(OPS)
      .send({
        subject: "  Approved:   {appId} ",
        body: '<p>Hi {userName}!</p><script>alert(1)</script><p><img src="https://x.test/a.png"><a href="javascript:alert(1)">x</a></p>',
      });

    expect(res.status).toBe(200);
    const data = prisma.emailTemplate.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ subject: "Approved: {appId}", isDefault: false, updatedById: "admin-1" });
    expect(data.body).toBe("<p>Hi {userName}!</p><p><a>x</a></p>");
    expect(res.body.template).toMatchObject({ isDefault: false, updatedBy: "Ada Admin" });

    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: "admin.email_template.update", entityType: "EmailTemplate", entityId: ID });
    expect(audit.metadata).toMatchObject({
      key: "APPLICATION_APPROVED",
      changed: ["subject", "body"],
      subjectBefore: "Your insurance application was approved",
      subjectAfter: "Approved: {appId}",
    });
  });

  it("marks the template default again when the wording matches the built-in text", async () => {
    const d = EMAIL_TEMPLATE_CATALOG.APPLICATION_APPROVED;
    await request(app).put(`/api/admin/email-templates/${ID}`).set(SUPER).send({ subject: d.subject, body: d.body }).expect(200);
    expect(prisma.emailTemplate.update.mock.calls[0][0].data.isDefault).toBe(true);
  });

  it.each([
    [{ subject: "   ", body: "<p>Hi</p>" }, /Subject can't be empty/],
    [{ subject: "Hi", body: "<p> </p><p></p>" }, /Body can't be empty/],
    [{ subject: "Hi", body: "<script>x</script>" }, /Body can't be empty/],
    [{ subject: "x".repeat(151), body: "<p>Hi</p>" }, /under 150 characters/],
    [{ subject: "Hi {firstName}", body: "<p>Hi</p>" }, /Unknown variable: \{firstName\}/],
    // {documents} exists, but not for the approval email.
    [{ subject: "Hi", body: "<p>Upload {documents}</p>" }, /Unknown variable: \{documents\}/],
  ])("rejects %j", async (input, message) => {
    const res = await request(app).put(`/api/admin/email-templates/${ID}`).set(OPS).send(input);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
    expect(prisma.emailTemplate.update).not.toHaveBeenCalled();
  });

  it("is limited to SUPER and OPERATIONS", async () => {
    for (const who of [FINANCE, COMPLIANCE]) {
      expect((await request(app).put(`/api/admin/email-templates/${ID}`).set(who).send({ subject: "Hi", body: "<p>Hi</p>" })).status).toBe(403);
      expect((await request(app).post(`/api/admin/email-templates/${ID}/revert`).set(who)).status).toBe(403);
    }
    expect(prisma.emailTemplate.update).not.toHaveBeenCalled();
  });

  it("400s a malformed id and unknown fields", async () => {
    expect((await request(app).put("/api/admin/email-templates/not-a-uuid").set(OPS).send({ subject: "Hi", body: "<p>Hi</p>" })).status).toBe(400);
    expect((await request(app).put(`/api/admin/email-templates/${ID}`).set(OPS).send({ subject: "Hi", body: "<p>Hi</p>", key: "X" })).status).toBe(400);
  });
});

describe("POST /api/admin/email-templates/:id/revert", () => {
  it("restores the built-in wording and audits it", async () => {
    prisma.emailTemplate.findMany.mockResolvedValue(allRows());
    prisma.emailTemplate.findUnique.mockResolvedValue(row("APPLICATION_APPROVED", { subject: "Custom", body: "<p>Custom</p>", isDefault: false }));
    prisma.emailTemplate.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row("APPLICATION_APPROVED", data));

    const res = await request(app).post(`/api/admin/email-templates/${ID}/revert`).set(SUPER);

    expect(res.status).toBe(200);
    const d = EMAIL_TEMPLATE_CATALOG.APPLICATION_APPROVED;
    expect(prisma.emailTemplate.update.mock.calls[0][0].data).toEqual({ subject: d.subject, body: d.body, isDefault: true, updatedById: "admin-1" });
    expect(res.body.template).toMatchObject({ subject: d.subject, isDefault: true });
    expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: "admin.email_template.revert", entityId: ID });
  });
});

describe("rendering and sending", () => {
  it("merges escaped values, adds the call to action and a plain-text version", () => {
    const out = renderEmailTemplate(
      "DOCUMENTS_REQUESTED",
      { subject: "Docs for {appId}", body: "<p>Hi {userName},</p><ul><li>{documents}</li></ul><p>{agentName}</p>" },
      { userName: "<Uma>", appId: "APP-1", documents: "Proof of income", agentName: null },
      "app-1",
    );
    expect(out.subject).toBe("Docs for APP-1");
    expect(out.html).toContain("<p>Hi &lt;Uma&gt;,</p>");
    expect(out.html).not.toContain("<Uma>");
    expect(out.html).toContain(`<a href="${env.appUrl}/account/applications/app-1">Upload documents</a>`);
    // No agent assigned yet: a sensible fallback instead of a blank.
    expect(out.html).toContain("<p>your agent</p>");
    expect(out.text).toBe(`Hi <Uma>,\n\n- Proof of income\n\nyour agent\n\nUpload documents: ${env.appUrl}/account/applications/app-1`);
  });

  it("sends the saved wording, falls back to the default when the database fails, and never throws", async () => {
    prisma.emailTemplate.findUnique.mockResolvedValueOnce({ subject: "Custom {appId}", body: "<p>Yes, {userName}</p>" });
    await sendTemplatedEmail("APPLICATION_APPROVED", "uma@example.com", "app-1", { userName: "Uma", appId: "APP-1" });
    expect(mailer.send.mock.calls[0][0]).toMatchObject({ to: "uma@example.com", subject: "Custom APP-1" });
    expect(mailer.send.mock.calls[0][0].html).toContain("<p>Yes, Uma</p>");

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    prisma.emailTemplate.findUnique.mockRejectedValueOnce(new Error("db down"));
    await sendTemplatedEmail("APPLICATION_APPROVED", "uma@example.com", "app-1", { userName: "Uma", appId: "APP-1" });
    expect(mailer.send.mock.calls[1][0].subject).toBe("Your insurance application was approved");

    mailer.send.mockRejectedValueOnce(new Error("boom"));
    await expect(sendTemplatedEmail("APPLICATION_APPROVED", "uma@example.com", "app-1", {})).resolves.toBe(false);
  });

  it("turns lists into one line per item in the plain-text version", () => {
    expect(emailHtmlToText("<p>Upload:</p><ul><li><p>Photo ID</p></li><li><p>Pay stub</p></li></ul><p>Thanks &amp; bye</p>")).toBe(
      "Upload:\n\n- Photo ID\n- Pay stub\n\nThanks & bye",
    );
  });

  it("every default uses only its own variables and is PHI-free", () => {
    for (const [key, d] of Object.entries(EMAIL_TEMPLATE_CATALOG)) {
      expect(unknownEmailVariables(d.subject + emailHtmlToText(d.body), d.variables), key).toEqual([]);
      expect(d.body, key).not.toMatch(/diagnos|\bssn\b|medication|reviewNotes/i);
    }
  });

  it("formats application references and fills placeholders", () => {
    expect(applicationReference("4f2a9c1e-0000-4000-8000-000000000000")).toBe("APP-4F2A9C1E");
    expect(fillEmailTemplate("{userName} {nope} {appId}", { userName: "Uma" })).toBe("Uma {nope} {appId}");
  });
});
