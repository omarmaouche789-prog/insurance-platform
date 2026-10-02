import type { Request } from "express";
import type { PasswordResetPurpose, User } from "@prisma/client";
import type { PasswordResetValidateResponseDTO } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { generateUrlToken, hashPassword, sha256 } from "../../lib/password";
import { HttpError } from "../../middleware/errorHandler";
import { email, maskEmail } from "../../integrations/email";
import { emailTemplates } from "../../integrations/emailTemplates";
import { recordLogin } from "./loginHistory";

const HOUR_MS = 60 * 60 * 1000;
export const RESET_TOKEN_TTL_HOURS: Record<PasswordResetPurpose, number> = { RESET: 1, INVITE: 72 };

// Issues a single-use link token. Any earlier unused token for the same user
// is invalidated, so only the newest emailed link works.
export async function issuePasswordResetToken(
  user: Pick<User, "id">,
  purpose: PasswordResetPurpose,
  requestedById: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateUrlToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_HOURS[purpose] * HOUR_MS);
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), purpose, requestedById, expiresAt },
    }),
  ]);
  return { token, expiresAt };
}

export async function sendPasswordResetEmail(
  user: Pick<User, "id" | "email" | "firstName">,
  requestedById: string | null,
): Promise<Date> {
  const { token, expiresAt } = await issuePasswordResetToken(user, "RESET", requestedById);
  await email.send({
    to: user.email,
    ...emailTemplates.passwordReset({
      firstName: user.firstName,
      token,
      expiresInHours: RESET_TOKEN_TTL_HOURS.RESET,
      byAdmin: requestedById !== null && requestedById !== user.id,
    }),
  });
  return expiresAt;
}

async function findUsableToken(rawToken: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(rawToken) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.user.deletedAt) {
    throw new HttpError(400, "This link is invalid or has expired. Ask for a new one.");
  }
  return record;
}

export async function validatePasswordResetToken(rawToken: string): Promise<PasswordResetValidateResponseDTO> {
  const record = await findUsableToken(rawToken);
  return { purpose: record.purpose, firstName: record.user.firstName, email: maskEmail(record.user.email) };
}

// Self-service "forgot password". Always behaves the same whether or not the
// account exists, so it can't be used to discover registered emails.
export async function requestPasswordReset(emailAddress: string, req: Request): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: emailAddress } });
  if (!user || user.deletedAt || !user.isActive) return;
  await sendPasswordResetEmail(user, null);
  await recordAuditEvent({ actorUserId: user.id, action: "auth.password_reset_requested", entityType: "User", entityId: user.id, req });
}

export async function confirmPasswordReset(rawToken: string, newPassword: string, req: Request): Promise<void> {
  const record = await findUsableToken(rawToken);

  // Claim the token atomically so a double-submitted form can't use it twice.
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) throw new HttpError(400, "This link is invalid or has expired. Ask for a new one.");

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        // Completing an invite proves the address is reachable.
        ...(record.purpose === "INVITE" && !record.user.emailVerifiedAt ? { emailVerifiedAt: new Date() } : {}),
      },
    }),
    // A new password ends every existing session.
    prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  await recordLogin(record.userId, req, { success: true, method: "PASSWORD_RESET" });
  await recordAuditEvent({
    actorUserId: record.userId,
    action: record.purpose === "INVITE" ? "auth.invite_accepted" : "auth.password_reset",
    entityType: "User",
    entityId: record.userId,
    req,
  });
}
