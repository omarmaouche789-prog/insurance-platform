import type { NextFunction, Request, Response } from "express";
import type { FeatureKey } from "@insurance/shared";
import { getSystemSettings } from "./settings.service";

// Hides a whole router while its feature is switched off in System
// Settings. Public routes answer 404 (as if nothing were there); admin
// routes answer 403 with a reason.
export function requireFeature(feature: FeatureKey, opts: { status: 403 | 404; message: string }) {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if ((await getSystemSettings()).features[feature]) return next();
      res.status(opts.status).json({ error: opts.message, code: "FEATURE_DISABLED" });
    } catch (err) {
      next(err);
    }
  };
}
