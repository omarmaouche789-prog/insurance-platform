import { Router } from "express";
import { z } from "zod";
import type { FeatureKey } from "@insurance/shared";
import { SETTINGS_EDITOR_ADMIN_ROLES, SYSTEM_SETTINGS_DEFAULTS } from "@insurance/shared";
import { requireAdminRole, requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { rateLimit } from "../../lib/rateLimit";
import { getPublicStatus, getSettingsForAdmin, getSettingsSection, isSection, toggleFeature, updateSettings } from "./settings.service";

// /api/admin/settings — every admin reads; only SUPER writes.
//   GET  /                              all sections
//   GET  /:section                      one section
//   PUT  /:section                      every setting of a section (e.g. /general)
//   PUT  /:section/:key   { value }     one setting
//   POST /features/:feature/toggle      flip a feature ({ enabled } to set it)
export const adminSettingsRouter = Router();
adminSettingsRouter.use(requireAuth, requireRole("ADMIN"));

const requireEditor = requireAdminRole(...SETTINGS_EDITOR_ADMIN_ROLES);
// Toggles save instantly, so allow a fair number of writes, per admin.
const writeLimit = rateLimit("settings-write", {
  windowMs: 15 * 60_000,
  max: 60,
  key: (req) => req.auth?.userId ?? req.ip ?? "unknown",
  message: "Too many settings changes. Wait a few minutes and try again.",
});

function sectionParam(value: string) {
  if (!isSection(value)) throw new HttpError(404, "Unknown settings section");
  return value;
}

adminSettingsRouter.get("/", async (_req, res, next) => {
  try {
    res.status(200).json(await getSettingsForAdmin());
  } catch (err) {
    next(err);
  }
});

adminSettingsRouter.get("/:section", async (req, res, next) => {
  try {
    res.status(200).json(await getSettingsSection(sectionParam(req.params.section)));
  } catch (err) {
    next(err);
  }
});

adminSettingsRouter.post("/features/:feature/toggle", requireEditor, writeLimit, async (req, res, next) => {
  try {
    const feature = req.params.feature;
    if (!(feature in SYSTEM_SETTINGS_DEFAULTS.features)) throw new HttpError(404, "Unknown feature");
    const { enabled } = z.object({ enabled: z.boolean().optional() }).strict().parse(req.body ?? {});
    res.status(200).json(await toggleFeature(req.auth!.userId, feature as FeatureKey, enabled, req));
  } catch (err) {
    next(err);
  }
});

// The whole section must be sent, so a save can't leave it half-written.
adminSettingsRouter.put("/:section", requireEditor, writeLimit, async (req, res, next) => {
  try {
    const section = sectionParam(req.params.section);
    const body = z.record(z.unknown()).parse(req.body);
    const expected = Object.keys(SYSTEM_SETTINGS_DEFAULTS[section]);
    const unknown = Object.keys(body).filter((k) => !expected.includes(k));
    if (unknown.length) throw new HttpError(400, `Unknown setting${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
    const missing = expected.filter((k) => !(k in body));
    if (missing.length) throw new HttpError(400, `Missing setting${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
    res.status(200).json(await updateSettings(req.auth!.userId, section, body, req));
  } catch (err) {
    next(err);
  }
});

adminSettingsRouter.put("/:section/:key", requireEditor, writeLimit, async (req, res, next) => {
  try {
    const section = sectionParam(req.params.section);
    const { value } = z.object({ value: z.unknown() }).strict().parse(req.body);
    if (value === undefined) throw new HttpError(400, "Send the new value as { value }");
    res.status(200).json(await updateSettings(req.auth!.userId, section, { [req.params.key]: value }, req));
  } catch (err) {
    next(err);
  }
});

// /api/status — public; the web app reads it for branding, date formats,
// feature visibility and the maintenance screen.
export const statusRouter = Router();

statusRouter.get("/", async (_req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.status(200).json(await getPublicStatus());
  } catch (err) {
    next(err);
  }
});
