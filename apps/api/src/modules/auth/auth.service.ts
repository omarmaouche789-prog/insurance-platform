import bcrypt from "bcryptjs";
import type { Request } from "express";
import type { User } from "@prisma/client";
import type { AuthUserDTO, LoginRequestDTO, RegisterRequestDTO } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { signAccessToken, signChallengeToken, verifyChallengeToken } from "../../lib/jwt";
import { generateRefreshToken, hashRefreshToken, refreshTokenExpiryDate } from "../../lib/refreshToken";
import { generateTotpSecret, totpKeyUri, verifyTotpCode } from "../../lib/totp";
import { recordAuditEvent } from "../../lib/audit";
import { HttpError } from "../../middleware/errorHandler";

const PASSWORD_HASH_ROUNDS = 12;

export function toAuthUserDTO(user: User & { twoFactorSecret?: { enabledAt: Date | null } | null }): AuthUserDTO {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    adminRole: user.adminRole,
    twoFactorEnabled: Boolean(user.twoFactorSecret?.enabledAt),
  };
}

async function issueSession(user: User, req: Request) {
  const accessToken = signAccessToken({ sub: user.id, role: user.role, adminRole: user.adminRole });
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiryDate(),
    },
  });
  await recordAuditEvent({ actorUserId: user.id, action: "auth.login", entityType: "User", entityId: user.id, req });
  return { accessToken, refreshToken };
}

export async function registerUser(input: RegisterRequestDTO, req: Request) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS),
      firstName: input.firstName,
      lastName: input.lastName,
      role: "USER",
    },
  });

  await recordAuditEvent({ actorUserId: user.id, action: "auth.register", entityType: "User", entityId: user.id, req });
  const { accessToken, refreshToken } = await issueSession(user, req);
  return { user: toAuthUserDTO(user), accessToken, refreshToken };
}

type LoginResult =
  | { type: "ok"; user: AuthUserDTO; accessToken: string; refreshToken: string }
  | { type: "challenge"; challengeToken: string };

export async function loginUser(input: LoginRequestDTO, req: Request): Promise<LoginResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { twoFactorSecret: true },
  });

  if (!user || !user.isActive || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  if (user.twoFactorSecret?.enabledAt) {
    return { type: "challenge", challengeToken: signChallengeToken(user.id) };
  }

  const { accessToken, refreshToken } = await issueSession(user, req);
  return { type: "ok", user: toAuthUserDTO(user), accessToken, refreshToken };
}

export async function completeTwoFactorLogin(challengeToken: string, code: string, req: Request) {
  let userId: string;
  try {
    userId = verifyChallengeToken(challengeToken);
  } catch {
    throw new HttpError(401, "Invalid or expired 2FA challenge");
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { twoFactorSecret: true } });
  if (!user?.twoFactorSecret?.enabledAt || !verifyTotpCode(user.twoFactorSecret.secret, code)) {
    throw new HttpError(401, "Invalid 2FA code");
  }

  const { accessToken, refreshToken } = await issueSession(user, req);
  return { user: toAuthUserDTO(user), accessToken, refreshToken };
}

export async function setupTwoFactor(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.role !== "AGENT" && user.role !== "ADMIN") {
    throw new HttpError(403, "2FA is only available for agent and admin accounts");
  }

  const secret = generateTotpSecret();
  await prisma.twoFactorSecret.upsert({
    where: { userId },
    create: { userId, secret },
    update: { secret, enabledAt: null },
  });

  return { secret, otpAuthUrl: totpKeyUri(user.email, secret) };
}

export async function confirmTwoFactorSetup(userId: string, code: string, req: Request) {
  const record = await prisma.twoFactorSecret.findUnique({ where: { userId } });
  if (!record || !verifyTotpCode(record.secret, code)) {
    throw new HttpError(400, "Invalid 2FA code");
  }

  await prisma.twoFactorSecret.update({ where: { userId }, data: { enabledAt: new Date() } });
  await recordAuditEvent({ actorUserId: userId, action: "auth.2fa_enabled", entityType: "User", entityId: userId, req });
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

  if (stored.expiresAt < new Date() || !stored.user.isActive) {
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
