import jwt, { type SignOptions } from "jsonwebtoken";
import type { AdminRole, Role } from "@insurance/shared";
import { env } from "./env";

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  adminRole: AdminRole | null;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = { expiresIn: env.accessTokenTtl as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.jwtAccessSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

interface ChallengeTokenPayload {
  sub: string;
  purpose: "login-2fa";
}

export function signChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "login-2fa" } satisfies ChallengeTokenPayload, env.jwtAccessSecret, {
    expiresIn: "5m",
  });
}

export function verifyChallengeToken(token: string): string {
  const payload = jwt.verify(token, env.jwtAccessSecret) as ChallengeTokenPayload;
  if (payload.purpose !== "login-2fa") {
    throw new Error("Invalid challenge token");
  }
  return payload.sub;
}
