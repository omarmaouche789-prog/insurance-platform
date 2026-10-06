import { Router } from "express";
import { z } from "zod";
import { SUPPORTED_LOCALES } from "@insurance/shared";
import { requireAuth } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import { selfOnly } from "../security/security.routes";

// /api/users/:id/preferences — the caller's own UI preferences. Not audited:
// a language choice isn't a security or data event.
export const preferencesRouter = Router();
preferencesRouter.use(requireAuth);

const preferencesSchema = z.object({ locale: z.enum(SUPPORTED_LOCALES) }).strict();

preferencesRouter.put("/:id/preferences", selfOnly, async (req, res, next) => {
  try {
    const { locale } = preferencesSchema.parse(req.body);
    await prisma.user.update({ where: { id: req.auth!.userId }, data: { locale } });
    res.status(200).json({ locale });
  } catch (err) {
    next(err);
  }
});
