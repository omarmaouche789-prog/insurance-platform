import type { NextFunction, Request, Response } from "express";
import { MAINTENANCE_ERROR_CODE } from "@insurance/shared";
import { verifyAccessToken } from "../../lib/jwt";
import { getSystemSettings } from "./settings.service";

// Always reachable during maintenance: health checks, the public status the
// web app polls, and auth — so admins can still sign in to switch it off.
const ALWAYS_OPEN = [/^\/api\/health$/, /^\/api\/status$/, /^\/api\/auth\//];

function isAdminRequest(req: Request): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  try {
    return verifyAccessToken(header.slice("Bearer ".length)).role === "ADMIN";
  } catch {
    return false;
  }
}

// While maintenance mode is on, every other request from a non-admin gets a
// 503 carrying the admin's message. Mounted before all routers.
export async function maintenanceGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (ALWAYS_OPEN.some((re) => re.test(req.path))) return next();
    const { maintenance } = await getSystemSettings();
    if (!maintenance.enabled || isAdminRequest(req)) return next();
    res.setHeader("Retry-After", "300");
    res.status(503).json({ error: maintenance.message, code: MAINTENANCE_ERROR_CODE });
  } catch (err) {
    next(err);
  }
}
