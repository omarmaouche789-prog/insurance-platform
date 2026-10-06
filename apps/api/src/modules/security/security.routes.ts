import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { limiters } from "../../lib/rateLimit";
import { listLoginHistory } from "./loginHistory";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateBackupCodes,
} from "./twoFactor.service";

// Self-service account security: /api/users/:id/… where :id is the caller's
// own id (or "me"). Every role can enroll in 2FA. Admin-side actions on
// other users live under /api/admin/users.
export const securityRouter = Router();
securityRouter.use(requireAuth);

// Resolves :id to the caller; anyone else's id is a 403 — these endpoints
// are never a way to act on another account.
export function selfOnly(req: Request, _res: Response, next: NextFunction): void {
  const id = req.params.id;
  if (id !== "me" && id !== req.auth!.userId) {
    next(new HttpError(403, "You can only manage your own account settings"));
    return;
  }
  next();
}

const codeSchema = z.object({ code: z.string().trim().min(6).max(20) });
const totpSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your app") });
const disableSchema = z.object({ password: z.string().min(1).max(200), code: codeSchema.shape.code });

securityRouter.get("/:id/2fa", selfOnly, async (req, res, next) => {
  try {
    res.status(200).json(await getTwoFactorStatus(req.auth!.userId));
  } catch (err) {
    next(err);
  }
});

// Starts enrollment: returns the secret and its QR code. 2FA isn't active
// until /verify succeeds.
securityRouter.post("/:id/2fa/enable", selfOnly, limiters.sensitiveAction, async (req, res, next) => {
  try {
    res.status(200).json(await beginTwoFactorSetup(req.auth!.userId, req));
  } catch (err) {
    next(err);
  }
});

securityRouter.post("/:id/2fa/verify", selfOnly, limiters.twoFactor, async (req, res, next) => {
  try {
    const { code } = totpSchema.parse(req.body);
    res.status(200).json(await confirmTwoFactorSetup(req.auth!.userId, code, req));
  } catch (err) {
    next(err);
  }
});

securityRouter.post("/:id/2fa/disable", selfOnly, limiters.twoFactor, async (req, res, next) => {
  try {
    const { password, code } = disableSchema.parse(req.body);
    await disableTwoFactor(req.auth!.userId, password, code, req);
    res.status(200).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
});

securityRouter.post("/:id/2fa/backup-codes", selfOnly, limiters.twoFactor, async (req, res, next) => {
  try {
    const { code } = totpSchema.parse(req.body);
    res.status(200).json(await regenerateBackupCodes(req.auth!.userId, code, req));
  } catch (err) {
    next(err);
  }
});

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

securityRouter.get("/:id/login-history", selfOnly, async (req, res, next) => {
  try {
    const { page, pageSize } = pageSchema.parse(req.query);
    res.status(200).json(await listLoginHistory(req.auth!.userId, page, pageSize));
  } catch (err) {
    next(err);
  }
});
