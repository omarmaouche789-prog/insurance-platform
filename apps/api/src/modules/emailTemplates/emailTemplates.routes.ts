import { Router } from "express";
import { z } from "zod";
import { EMAIL_BODY_MAX, NOTIFICATION_TEMPLATE_EDITOR_ROLES } from "@insurance/shared";
import { requireAdminRole, requireAuth, requireRole } from "../../middleware/auth";
import { getEmailTemplate, listEmailTemplates, revertEmailTemplate, updateEmailTemplate } from "./emailTemplates.service";

// /api/admin/email-templates — any admin reads; SUPER/OPERATIONS edit and
// revert (the same roles as the SMS templates).
export const adminEmailTemplatesRouter = Router();
adminEmailTemplatesRouter.use(requireAuth, requireRole("ADMIN"));
const requireEditor = requireAdminRole(...NOTIFICATION_TEMPLATE_EDITOR_ROLES);

const idSchema = z.string().uuid("Email template not found");
// Generous limits here; the service applies the real rules after sanitizing.
const updateSchema = z.object({ subject: z.string().max(1000), body: z.string().max(EMAIL_BODY_MAX * 2) }).strict();

adminEmailTemplatesRouter.get("/", async (_req, res, next) => {
  try {
    res.status(200).json({ templates: await listEmailTemplates() });
  } catch (err) {
    next(err);
  }
});

adminEmailTemplatesRouter.get("/:id", async (req, res, next) => {
  try {
    res.status(200).json({ template: await getEmailTemplate(idSchema.parse(req.params.id)) });
  } catch (err) {
    next(err);
  }
});

adminEmailTemplatesRouter.put("/:id", requireEditor, async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);
    const input = updateSchema.parse(req.body);
    res.status(200).json({ template: await updateEmailTemplate(req.auth!.userId, id, input, req) });
  } catch (err) {
    next(err);
  }
});

adminEmailTemplatesRouter.post("/:id/revert", requireEditor, async (req, res, next) => {
  try {
    res.status(200).json({ template: await revertEmailTemplate(req.auth!.userId, idSchema.parse(req.params.id), req) });
  } catch (err) {
    next(err);
  }
});
