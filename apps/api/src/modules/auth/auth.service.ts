import type { Request } from "express";
import type { LoginMethod, User } from "@prisma/client";
import type { AuthUserDTO, LoginRequestDTO, RegisterRequestDTO } from "@insurance/shared";
import { isTotpCode } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { signAccessToken, signChallengeToken, verifyChallengeToken } from "../../lib/jwt";
import { generateRefreshToken, hashRefreshToken, refreshTokenExpiryDate } from "../../lib/refreshToken";
import { hashPassword, verifyPassword } from "../../lib/password";
import { recordAuditEvent } from "../../lib/audit";
import { HttpError } from "../../middleware/errorHandler";
import { assertNotLockedOut, recordLogin } from "../security/loginHistory";
import { consumeSecondFactor } from "../security/twoFactor.service";
import { notify } from "../notifications/notifications.service";

export function toAuthUserDTO(user: User & { twoFactorSecret?: { enabledAt: Date | null } | null }): AuthUserDTO {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    adminRole: user.adminRole,
    twoFactorEnabled: user.twoFactorEnabled || Boolean(user.twoFactorSecret?.enabledAt),
  };
}

async function issueSession(user: User, req: Request, method: LoginMethod) {
  const accessToken = signAccessToken({ sub: user.id, role: user.role, adminRole: user.adminRole });
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiryDate(),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordLogin(user.id, req, { success: true, method });
  await recordAuditEvent({
    actorUserId: user.id,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    metadata: { method },
    req,
  });
  return { accessToken, refreshToken };
}

export async function registerUser(input: RegisterRequestDTO, req: Request) {
  const existing = await prisma.user.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } } });
  if (existing) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: "USER",
    },
  });

  await recordAuditEvent({ actorUserId: user.id, action: "auth.register", entityType: "User", entityId: user.id, req });
  const { accessToken, refreshToken } = await issueSession(user, req, "PASSWORD");
  return { user: toAuthUserDTO(user), accessToken, refreshToken };
}

type LoginResult =
  | { type: "ok"; user: AuthUserDTO; accessToken: string; refreshToken: string }
  | { type: "challenge"; challengeToken: string };

// Compared against when the email is unknown, so a miss costs the same
// bcrypt time as a hit and response timing doesn't reveal which emails exist.
const DUMMY_PASSWORD_HASH = "$2a$12$k9UQOfYvHc8X.Cnsj1iSX.ddRtGJQO8Wx6JVZKPe3ey3qp6bORGBm";
const INVALID_CREDENTIALS = "Invalid email or password";
export const SUSPENDED_MESSAGE = "This account has been suspended. Contact support for help.";

export async function loginUser(input: LoginRequestDTO, req: Request): Promise<LoginResult> {
  // Exact match first; then case-insensitive, since older accounts were
  // stored with the casing they registered with.
  const user =
    (await prisma.user.findUnique({ where: { email: input.email }, include: { twoFactorSecret: true } })) ??
    (await prisma.user.findFirst({
      where: { email: { equals: input.email, mode: "insensitive" }, deletedAt: null },
      include: { twoFactorSecret: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!user || user.deletedAt) {
    await verifyPassword(input.password, DUMMY_PASSWORD_HASH);
    throw new HttpError(401, INVALID_CREDENTIALS);
  }

  await assertNotLockedOut(user.id, "password");
  if (!(await verifyPassword(input.password, user.passwordHash))) {
    await recordLogin(user.id, req, { success: false, method: "PASSWORD", failureReason: "Incorrect password" });
    throw new HttpError(401, INVALID_CREDENTIALS);
  }
  // Only revealed after a correct password, so it doesn't leak account state.
  if (!user.isActive) {
    await recordLogin(user.id, req, { success: false, method: "PASSWORD", failureReason: "Account suspended" });
    throw new HttpError(403, SUSPENDED_MESSAGE);
  }

  if (user.twoFactorSecret?.enabledAt) {
    return { type: "challenge", challengeToken: signChallengeToken(user.id) };
  }

  const { accessToken, refreshToken } = await issueSession(user, req, "PASSWORD");
  return { type: "ok", user: toAuthUserDTO(user), accessToken, refreshToken };
}

// Second step of a 2FA login. Accepts an authenticator code or, for someone
// who lost their phone, one of their backup codes.
export async function completeTwoFactorLogin(challengeToken: string, code: string, req: Request) {
  let userId: string;
  try {
    userId = verifyChallengeToken(challengeToken);
  } catch {
    throw new HttpError(401, "Your sign-in session expired. Please sign in again.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { twoFactorSecret: true } });
  if (!user || user.deletedAt || !user.twoFactorSecret?.enabledAt) {
    throw new HttpError(401, "Your sign-in session expired. Please sign in again.");
  }
  if (!user.isActive) throw new HttpError(403, SUSPENDED_MESSAGE);

  await assertNotLockedOut(user.id, "second-factor");
  const method = await consumeSecondFactor(user.twoFactorSecret, code);
  if (!method) {
    await recordLogin(user.id, req, {
      success: false,
      method: isTotpCode(code) ? "TOTP" : "BACKUP_CODE",
      failureReason: "Invalid code",
    });
    throw new HttpError(401, "Invalid verification code");
  }

  const { accessToken, refreshToken } = await issueSession(user, req, method);
  if (method === "BACKUP_CODE") {
    const remaining = await prisma.backupCode.count({ where: { userId, usedAt: null } });
    await notify(userId, {
      type: "account.security",
      title: "A backup code was used to sign in",
      body: `${remaining} backup code${remaining === 1 ? "" : "s"} left. Generate new ones from your security settings.`,
    });
  }
  return { user: toAuthUserDTO(user), accessToken, refreshToken };
}

const REFRESH_INCLUDE = { user: { include: { twoFactorSecret: true } } } as const;
const REFRESH_REUSE_GRACE_MS = 10_000;
const MAX_CHAIN_HOPS = 5;

export async function refreshSession(rawRefreshToken: string) {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  let stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: REFRESH_INCLUDE });

  if (!stored) {
    throw new HttpError(401, "Invalid or expired refresh token");
  }

  // A token that was *just* rotated can still arrive here from a duplicate
  // in-flight request (React StrictMode's double-invoked mount effect, two
  // tabs refreshing around the same moment). Within a short grace window,
  // follow the rotation chain to the current token instead of failing the
  // session outright.
  for (let hops = 0; stored.revokedAt; hops++) {
    const withinGrace = Date.now() - stored.revokedAt.getTime() <= REFRESH_REUSE_GRACE_MS;
    if (!withinGrace || !stored.replacedByTokenId || hops >= MAX_CHAIN_HOPS) {
      throw new HttpError(401, "Invalid or expired refresh token");
    }
    stored = await prisma.refreshToken.findUniqueOrThrow({
      where: { id: stored.replacedByTokenId },
      include: REFRESH_INCLUDE,
    });
  }

  if (stored.expiresAt < new Date() || !stored.user.isActive || stored.user.deletedAt) {
    throw new HttpError(401, "Invalid or expired refresh token");
  }

  const accessToken = signAccessToken({
    sub: stored.user.id,
    role: stored.user.role,
    adminRole: stored.user.adminRole,
  });
  const refreshToken = generateRefreshToken();
  const created = await prisma.refreshToken.create({
    data: {
      userId: stored.user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiryDate(),
    },
  });
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date(), replacedByTokenId: created.id },
  });

  return { accessToken, refreshToken, user: toAuthUserDTO(stored.user) };
}

export async function logoutSession(rawRefreshToken: string, req: Request) {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt) {
    return;
  }
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  await recordAuditEvent({ actorUserId: stored.userId, action: "auth.logout", entityType: "User", entityId: stored.userId, req });
}
