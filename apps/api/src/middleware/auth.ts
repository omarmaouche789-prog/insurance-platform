import type { NextFunction, Request, Response } from "express";
import type { AdminRole, Role } from "@insurance/shared";
import { verifyAccessToken } from "../lib/jwt";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: Role;
        adminRole: AdminRole | null;
      };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing access token" });
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.auth = { userId: payload.sub, role: payload.role, adminRole: payload.adminRole };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired access token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

export function requireAdminRole(...adminRoles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || req.auth.role !== "ADMIN" || !req.auth.adminRole || !adminRoles.includes(req.auth.adminRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
