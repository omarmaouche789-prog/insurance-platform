import type { NextFunction, Request, Response } from "express";

// Fixed-window rate limiting for sensitive endpoints (login, 2FA, password
// reset, destructive admin actions).
//
// Counters live in process memory, so with N API instances an attacker gets
// N× the budget. That's acceptable as a first line of defense: brute force
// against passwords and 2FA codes is additionally capped per account by the
// DB-backed lockout in modules/security/loginHistory.ts, which every instance
// shares. Swap this store for Redis when the API scales out.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const SWEEP_THRESHOLD = 10_000;

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  // Distinguishes callers; defaults to the client IP. Return null to skip limiting.
  key?: (req: Request) => string | null;
  message?: string;
}

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// Returns whether the hit is allowed, plus what to report in headers.
export function hit(key: string, windowMs: number, max: number, now = Date.now()) {
  if (buckets.size > SWEEP_THRESHOLD) sweep(now);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return { allowed: bucket.count <= max, remaining: Math.max(0, max - bucket.count), resetAt: bucket.resetAt };
}

export function rateLimit(name: string, opts: RateLimitOptions) {
  const keyFor = opts.key ?? ((req: Request) => req.ip ?? "unknown");
  return (req: Request, res: Response, next: NextFunction): void => {
    const callerKey = keyFor(req);
    if (callerKey === null) {
      next();
      return;
    }
    const now = Date.now();
    const result = hit(`${name}:${callerKey}`, opts.windowMs, opts.max, now);
    res.setHeader("RateLimit-Limit", String(opts.max));
    res.setHeader("RateLimit-Remaining", String(result.remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil((result.resetAt - now) / 1000)));
    if (!result.allowed) {
      res.setHeader("Retry-After", String(Math.ceil((result.resetAt - now) / 1000)));
      res.status(429).json({ error: opts.message ?? "Too many requests. Please wait a moment and try again." });
      return;
    }
    next();
  };
}

// Tests only.
export function resetRateLimits(): void {
  buckets.clear();
}

const MINUTE = 60_000;

// Shared limiter presets so every sensitive route uses the same budgets.
export const limiters = {
  login: rateLimit("login", {
    windowMs: 15 * MINUTE,
    max: 20,
    message: "Too many sign-in attempts from this network. Try again in a few minutes.",
  }),
  twoFactor: rateLimit("2fa", {
    windowMs: 15 * MINUTE,
    max: 15,
    message: "Too many verification attempts. Try again in a few minutes.",
  }),
  passwordReset: rateLimit("password-reset", {
    windowMs: 15 * MINUTE,
    max: 10,
    message: "Too many password reset attempts. Try again in a few minutes.",
  }),
  // Per signed-in user, for 2FA management and destructive admin actions.
  sensitiveAction: rateLimit("sensitive", {
    windowMs: 15 * MINUTE,
    max: 30,
    key: (req) => req.auth?.userId ?? req.ip ?? "unknown",
    message: "Too many requests for this action. Try again in a few minutes.",
  }),
};
