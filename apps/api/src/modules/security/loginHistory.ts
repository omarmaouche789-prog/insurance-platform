import type { Request } from "express";
import type { LoginHistory, LoginMethod } from "@prisma/client";
import type { LoginHistoryEntryDTO, LoginHistoryResponseDTO } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { parseUserAgent } from "../../lib/userAgent";
import { HttpError } from "../../middleware/errorHandler";
import { getSystemSettings } from "../settings/settings.service";

const MAX_USER_AGENT = 500;

// Per-account lockout, shared across API instances because it reads the
// database: too many failures in the window and further attempts are refused
// before the password or code is even checked. The limit is the "Max login
// attempts" system setting, applied separately to passwords and 2FA codes.
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export async function recordLogin(
  userId: string,
  req: Request,
  entry: { success: boolean; method: LoginMethod; failureReason?: string },
): Promise<void> {
  const userAgent = req.get("user-agent")?.slice(0, MAX_USER_AGENT) ?? null;
  await prisma.loginHistory.create({
    data: {
      userId,
      success: entry.success,
      method: entry.method,
      failureReason: entry.failureReason ?? null,
      ipAddress: req.ip ?? null,
      userAgent,
      device: parseUserAgent(userAgent).summary,
    },
  });
}

export async function assertNotLockedOut(userId: string, kind: "password" | "second-factor"): Promise<void> {
  const failures = await prisma.loginHistory.count({
    where: {
      userId,
      success: false,
      method: kind === "password" ? "PASSWORD" : { in: ["TOTP", "BACKUP_CODE"] },
      createdAt: { gte: new Date(Date.now() - LOCKOUT_WINDOW_MS) },
    },
  });
  const max = (await getSystemSettings()).session.maxLoginAttempts;
  if (failures >= max) {
    throw new HttpError(429, "Too many failed attempts on this account. Try again in 15 minutes.");
  }
}

export function toLoginHistoryDTO(row: LoginHistory): LoginHistoryEntryDTO {
  return {
    id: row.id,
    success: row.success,
    method: row.method,
    failureReason: row.failureReason,
    ipAddress: row.ipAddress,
    device: row.device,
    deviceType: parseUserAgent(row.userAgent).type,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listLoginHistory(userId: string, page: number, pageSize: number): Promise<LoginHistoryResponseDTO> {
  const where = { userId };
  const [total, rows] = await Promise.all([
    prisma.loginHistory.count({ where }),
    prisma.loginHistory.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, page, pageSize, entries: rows.map(toLoginHistoryDTO) };
}
