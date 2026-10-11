import type { NextFunction, Request, Response } from "express";
import { TWO_FACTOR_REQUIRED_CODE } from "@insurance/shared";
import { verifyAccessToken } from "../../lib/jwt";
import { prisma } from "../../lib/prisma";
import { getSystemSettings } from "../settings/settings.service";

// What an admin or agent without 2FA can still reach while 2FA is required:
// sign-in, their own 2FA setup and sign-in history, the public status and the
// notification bell.
const ALWAYS_OPEN = [
  /^\/api\/health$/,
  /^\/api\/status$/,
  /^\/api\/auth\//,
  /^\/api\/users\/[^/]+\/(2fa|login-history)(\/|$)/,
  /^\/api\/notifications(\/|$)/,
];

export const TWO_FACTOR_REQUIRED_MESSAGE = "Your administrator requires two-factor authentication. Set it up to continue.";

// System Settings → "Two-Factor Authentication" ON: admins and agents must
// enroll before using anything else. Checked against the database (not the
// token) so it takes effect, and lifts, immediately. Mounted before routers.
export async function twoFactorGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (ALWAYS_OPEN.some((re) => re.test(req.path))) return next();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return next();
    let payload;
    try {
      payload = verifyAccessToken(header.slice("Bearer ".length));
    } catch {
      return next(); // requireAuth rejects it
    }
    if (payload.role !== "ADMIN" && payload.role !== "AGENT") return next();
    if (!(await getSystemSettings()).features.twoFactor) return next();
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { twoFactorEnabled: true } });
    if (!user || user.twoFactorEnabled) return next();
    res.status(403).json({ error: TWO_FACTOR_REQUIRED_MESSAGE, code: TWO_FACTOR_REQUIRED_CODE });
  } catch (err) {
    next(err);
  }
}
