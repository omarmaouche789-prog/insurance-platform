import { Router } from "express";
import { z } from "zod";
import { SETTINGS_EDITOR_ADMIN_ROLES, SETTINGS_LIMITS } from "@insurance/shared";
import { requireAdminRole, requireAuth, requireRole } from "../../middleware/auth";
import { limiters } from "../../lib/rateLimit";
import { getPublicStatus, getSettingsForAdmin, updateSystemSettings } from "./settings.service";

const int = (label: string, { min, max }: { min: number; max: number }) =>
  z.number({ invalid_type_error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`).max(max, `${label} can be at most ${max}`);

// The full settings object is sent on every save (the page always has it),
// so a save can never leave a section half-written.
export const settingsSchema = z
  .object({
    features: z.object({
      twoFactor: z.boolean(),
      recommendations: z.boolean(),
      smsNotifications: z.boolean(),
      hipaaCompliance: z.boolean(),
    }).strict(),
    maintenance: z.object({
      enabled: z.boolean(),
      message: z.string().trim().max(SETTINGS_LIMITS.maintenanceMessageMax, `Keep the message under ${SETTINGS_LIMITS.maintenanceMessageMax} characters`),
    }).strict(),
    session: z.object({
      timeoutMinutes: int("Session timeout", SETTINGS_LIMITS.timeoutMinutes),
      maxLoginAttempts: int("Max login attempts", SETTINGS_LIMITS.maxLoginAttempts),
    }).strict(),
  })
  .strict()
  .refine((s) => !s.maintenance.enabled || s.maintenance.message.length > 0, {
    message: "Write the message users will see during maintenance",
    path: ["maintenance", "message"],
  });

// /api/admin/settings — every admin reads, SUPER writes.
export const adminSettingsRouter = Router();
adminSettingsRouter.use(requireAuth, requireRole("ADMIN"));

adminSettingsRouter.get("/", async (_req, res, next) => {
  try {
    res.status(200).json(await getSettingsForAdmin());
  } catch (err) {
    next(err);
  }
});

adminSettingsRouter.post("/", requireAdminRole(...SETTINGS_EDITOR_ADMIN_ROLES), limiters.sensitiveAction, async (req, res, next) => {
  try {
    const input = settingsSchema.parse(req.body);
    res.status(200).json(await updateSystemSettings(req.auth!.userId, input, req));
  } catch (err) {
    next(err);
  }
});

// /api/status — public; the web app polls it to show the maintenance screen.
export const statusRouter = Router();

statusRouter.get("/", async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.status(200).json(await getPublicStatus());
  } catch (err) {
    next(err);
  }
});
