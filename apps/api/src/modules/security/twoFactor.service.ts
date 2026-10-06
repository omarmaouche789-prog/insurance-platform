import type { Request } from "express";
import type { TwoFactorSecret } from "@prisma/client";
import QRCode from "qrcode";
import type { BackupCodesResponseDTO, TwoFactorEnableResponseDTO, TwoFactorStatusDTO } from "@insurance/shared";
import { isTotpCode } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { verifyPassword } from "../../lib/password";
import { generateTotpSecret, matchTotpStep, totpKeyUri } from "../../lib/totp";
import { HttpError } from "../../middleware/errorHandler";
import { email } from "../../integrations/email";
import { emailTemplates } from "../../integrations/emailTemplates";
import { notify } from "../notifications/notifications.service";
import { getSystemSettings } from "../settings/settings.service";
import {
  generateBackupCodes,
  hashBackupCode,
  isSealedSecret,
  looksLikeBackupCode,
  readTotpSecret,
  sealTotpSecret,
} from "./secrets";

export type SecondFactorMethod = "TOTP" | "BACKUP_CODE";

// Checks a 6-digit TOTP code or a backup code against the user's enrolled
// factor and consumes it: a TOTP time step can only be used once, and a
// backup code is burned on use. Both consumptions are conditional updates,
// so two concurrent requests with the same code can't both succeed.
export async function consumeSecondFactor(record: TwoFactorSecret, rawCode: string): Promise<SecondFactorMethod | null> {
  const code = rawCode.trim();

  if (isTotpCode(code)) {
    const secret = readTotpSecret(record.secret);
    const step = matchTotpStep(secret, code);
    if (step === null) return null;
    const claimed = await prisma.twoFactorSecret.updateMany({
      where: { userId: record.userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] },
      data: {
        lastUsedStep: step,
        // Opportunistically encrypt secrets stored before encryption existed.
        ...(isSealedSecret(record.secret) ? {} : { secret: sealTotpSecret(secret) }),
      },
    });
    return claimed.count === 1 ? "TOTP" : null;
  }

  if (looksLikeBackupCode(code)) {
    const used = await prisma.backupCode.updateMany({
      where: { userId: record.userId, codeHash: hashBackupCode(code), usedAt: null },
      data: { usedAt: new Date() },
    });
    return used.count === 1 ? "BACKUP_CODE" : null;
  }

  return null;
}

async function findUserWithFactor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { twoFactorSecret: true } });
  if (!user || user.deletedAt) throw new HttpError(404, "User not found");
  return user;
}

export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatusDTO> {
  const user = await findUserWithFactor(userId);
  const enabledAt = user.twoFactorSecret?.enabledAt ?? null;
  const backupCodesRemaining = enabledAt
    ? await prisma.backupCode.count({ where: { userId, usedAt: null } })
    : 0;
  const { features } = await getSystemSettings();
  return {
    enabled: Boolean(enabledAt),
    enabledAt: enabledAt?.toISOString() ?? null,
    backupCodesRemaining,
    setupAvailable: features.twoFactor,
  };
}

// Step 1 of enrollment: a fresh secret, not yet active. Calling it again
// before confirming simply replaces the pending secret.
const SETUP_OFF = "Two-factor setup is currently turned off by your administrator.";

// The System Settings switch only stops new enrollments. Disabling, backup
// codes and the sign-in challenge keep working for anyone already enrolled.
async function assertSetupAvailable(): Promise<void> {
  if (!(await getSystemSettings()).features.twoFactor) throw new HttpError(403, SETUP_OFF);
}

export async function beginTwoFactorSetup(userId: string, req: Request): Promise<TwoFactorEnableResponseDTO> {
  await assertSetupAvailable();
  const user = await findUserWithFactor(userId);
  if (user.twoFactorSecret?.enabledAt) {
    throw new HttpError(409, "Two-factor authentication is already on. Turn it off first to set up a new device.");
  }

  const secret = generateTotpSecret();
  const sealed = sealTotpSecret(secret);
  await prisma.twoFactorSecret.upsert({
    where: { userId },
    create: { userId, secret: sealed },
    update: { secret: sealed, enabledAt: null, lastUsedStep: null, createdAt: new Date() },
  });
  await recordAuditEvent({ actorUserId: userId, action: "auth.2fa_setup_started", entityType: "User", entityId: userId, req });

  const otpAuthUrl = totpKeyUri(user.email, secret);
  // Rendered server-side so the secret never goes to a third-party QR service.
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" });
  return { secret, otpAuthUrl, qrCodeDataUrl };
}

async function replaceBackupCodes(userId: string): Promise<string[]> {
  const codes = generateBackupCodes();
  await prisma.$transaction([
    prisma.backupCode.deleteMany({ where: { userId } }),
    prisma.backupCode.createMany({ data: codes.map((code) => ({ userId, codeHash: hashBackupCode(code) })) }),
  ]);
  return codes;
}

// Step 2: prove the authenticator works, which turns 2FA on and issues the
// one-time view of the backup codes.
export async function confirmTwoFactorSetup(userId: string, code: string, req: Request): Promise<BackupCodesResponseDTO> {
  await assertSetupAvailable();
  const user = await findUserWithFactor(userId);
  const record = user.twoFactorSecret;
  if (!record) throw new HttpError(400, "Start two-factor setup first");
  if (record.enabledAt) throw new HttpError(409, "Two-factor authentication is already on");
  if (!isTotpCode(code) || (await consumeSecondFactor(record, code)) !== "TOTP") {
    throw new HttpError(400, "That code didn't match. Check your authenticator app and try again.");
  }

  const enabledAt = new Date();
  await prisma.$transaction([
    prisma.twoFactorSecret.update({ where: { userId }, data: { enabledAt } }),
    prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } }),
  ]);
  const backupCodes = await replaceBackupCodes(userId);

  await recordAuditEvent({ actorUserId: userId, action: "auth.2fa_enabled", entityType: "User", entityId: userId, req });
  await email.send({ to: user.email, ...emailTemplates.twoFactorEnabled({ firstName: user.firstName }) });
  await notify(userId, {
    type: "account.security",
    title: "Two-factor authentication turned on",
    body: "Keep your backup codes somewhere safe.",
    link: "/account/security",
  });
  return { backupCodes };
}

async function removeFactor(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.backupCode.deleteMany({ where: { userId } }),
    prisma.twoFactorSecret.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } }),
  ]);
}

// Turning 2FA off needs both the password and a second factor, so a stolen
// session alone can't strip it.
export async function disableTwoFactor(userId: string, password: string, code: string, req: Request): Promise<void> {
  const user = await findUserWithFactor(userId);
  const record = user.twoFactorSecret;
  if (!record?.enabledAt) throw new HttpError(409, "Two-factor authentication isn't on");
  if (!(await verifyPassword(password, user.passwordHash))) throw new HttpError(400, "Password is incorrect");
  const method = await consumeSecondFactor(record, code);
  if (!method) throw new HttpError(400, "That code didn't match");

  await removeFactor(userId);
  await recordAuditEvent({
    actorUserId: userId,
    action: "auth.2fa_disabled",
    entityType: "User",
    entityId: userId,
    metadata: { method },
    req,
  });
  await email.send({ to: user.email, ...emailTemplates.twoFactorDisabled({ firstName: user.firstName, byAdmin: false }) });
}

export async function regenerateBackupCodes(userId: string, code: string, req: Request): Promise<BackupCodesResponseDTO> {
  const user = await findUserWithFactor(userId);
  const record = user.twoFactorSecret;
  if (!record?.enabledAt) throw new HttpError(409, "Two-factor authentication isn't on");
  // Only an authenticator code: burning a backup code to mint new ones would
  // let someone holding a single leaked code take over the whole set.
  if (!isTotpCode(code) || (await consumeSecondFactor(record, code)) !== "TOTP") {
    throw new HttpError(400, "That code didn't match. Use a code from your authenticator app.");
  }

  const backupCodes = await replaceBackupCodes(userId);
  await recordAuditEvent({ actorUserId: userId, action: "auth.2fa_backup_codes_regenerated", entityType: "User", entityId: userId, req });
  await email.send({ to: user.email, ...emailTemplates.backupCodesRegenerated({ firstName: user.firstName }) });
  return { backupCodes };
}

// Account recovery for someone who lost both their phone and backup codes:
// an admin verifies their identity out-of-band, then removes the factor.
export async function adminResetTwoFactor(actorUserId: string, userId: string, req: Request): Promise<void> {
  const user = await findUserWithFactor(userId);
  if (!user.twoFactorSecret?.enabledAt) throw new HttpError(409, "This user doesn't have two-factor authentication on");

  await removeFactor(userId);
  // Their existing sessions were established with the old factor; end them.
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAuditEvent({ actorUserId, action: "admin.user.2fa_reset", entityType: "User", entityId: userId, req });
  await email.send({ to: user.email, ...emailTemplates.twoFactorDisabled({ firstName: user.firstName, byAdmin: true }) });
}
