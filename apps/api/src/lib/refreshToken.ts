import crypto from "node:crypto";
import { env } from "./env";

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const DURATION_UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

// Parses simple durations like "30d", "15m", "12h" — enough for our TTL env vars.
export function parseDurationMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  const [, amount, unit] = match;
  return Number(amount) * DURATION_UNITS[unit];
}

export function refreshTokenExpiryDate(): Date {
  return new Date(Date.now() + parseDurationMs(env.refreshTokenTtl));
}
