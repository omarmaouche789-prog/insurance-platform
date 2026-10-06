import { Router } from "express";
import { z } from "zod";
import { NOTIFICATION_TEMPLATE_EDITOR_ROLES, SMS_BODY_MAX, SMS_TEMPLATE_KEYS, SMS_TEMPLATE_VARIABLES } from "@insurance/shared";
import { requireAdminRole, requireAuth, requireRole } from "../../middleware/auth";
import { rateLimit } from "../../lib/rateLimit";
import {
  listEmailTemplatePreviews,
  listSmsTemplates,
  resetSmsTemplate,
  sendTestSms,
  updateSmsTemplate,
} from "./notificationTemplates";

// /api/admin/notifications — any admin reads; SUPER/OPERATIONS edit and test.
export const adminNotificationsRouter = Router();
adminNotificationsRouter.use(requireAuth, requireRole("ADMIN"));
const requireEditor = requireAdminRole(...NOTIFICATION_TEMPLATE_EDITOR_ROLES);

// Test sends cost money and reach real phones: a few per minute per admin.
const testSendLimit = rateLimit("sms-test", {
  windowMs: 60_000,
  max: 5,
  key: (req) => req.auth?.userId ?? req.ip ?? "unknown",
  message: "Too many test messages. Wait a minute and try again.",
});

const keySchema = z.enum(SMS_TEMPLATE_KEYS);

adminNotificationsRouter.get("/email/templates", (_req, res) => {
  res.status(200).json({ templates: listEmailTemplatePreviews() });
});

adminNotificationsRouter.get("/sms/templates", async (_req, res, next) => {
  try {
    res.status(200).json({ templates: await listSmsTemplates() });
  } catch (err) {
    next(err);
  }
});

const bodySchema = z.string().max(SMS_BODY_MAX, `Keep the message under ${SMS_BODY_MAX} characters`);

adminNotificationsRouter.put("/sms/templates/:key", requireEditor, async (req, res, next) => {
  try {
    const key = keySchema.parse(req.params.key);
    const input = z.object({ body: bodySchema, isActive: z.boolean() }).parse(req.body);
    res.status(200).json({ template: await updateSmsTemplate(req.auth!.userId, key, input, req) });
  } catch (err) {
    next(err);
  }
});

adminNotificationsRouter.post("/sms/templates/:key/reset", requireEditor, async (req, res, next) => {
  try {
    const key = keySchema.parse(req.params.key);
    res.status(200).json({ template: await resetSmsTemplate(req.auth!.userId, key, req) });
  } catch (err) {
    next(err);
  }
});

const sendSchema = z
  .object({
    to: z
      .string()
      .trim()
      .transform((s) => s.replace(/[\s().-]/g, ""))
      .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Enter the number in international format, e.g. +15551234567")),
    templateKey: keySchema.optional(),
    body: bodySchema.optional(),
    variables: z.object(Object.fromEntries(SMS_TEMPLATE_VARIABLES.map((v) => [v, z.string().trim().max(60).optional()]))).optional(),
  })
  .refine((b) => b.templateKey || b.body !== undefined, { message: "Choose a template or enter a message", path: ["templateKey"] });

adminNotificationsRouter.post("/sms/send", requireEditor, testSendLimit, async (req, res, next) => {
  try {
    const input = sendSchema.parse(req.body);
    res.status(200).json(await sendTestSms(req.auth!.userId, input, req));
  } catch (err) {
    next(err);
  }
});
