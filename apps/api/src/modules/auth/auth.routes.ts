import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { parseDurationMs } from "../../lib/refreshToken";
import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import { limiters } from "../../lib/rateLimit";
import { newPasswordSchema } from "../../lib/password";
import {
  completeTwoFactorLogin,
  loginUser,
  logoutSession,
  registerUser,
  refreshSession,
  toAuthUserDTO,
} from "./auth.service";
import {
  confirmPasswordReset,
  requestPasswordReset,
  validatePasswordResetToken,
} from "../security/passwordReset.service";

export const authRouter = Router();

const REFRESH_COOKIE = "refresh_token";

// Path must be "/" (not just "/api/auth") — the Next.js middleware checks for
// this cookie's presence on page requests like /account and /admin to gate
// protected routes, and a browser only attaches a cookie to requests whose
// path matches its own Path attribute.
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: parseDurationMs(env.refreshTokenTtl),
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
}

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const registerSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

authRouter.post("/register", limiters.login, async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await registerUser(input, req);
    setRefreshCookie(res, refreshToken);
    res.status(201).json({ status: "ok", accessToken, user });
  } catch (err) {
    next(err);
  }
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

authRouter.post("/login", limiters.login, async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await loginUser(input, req);
    if (result.type === "challenge") {
      res.status(200).json({ status: "2fa_required", challengeToken: result.challengeToken });
      return;
    }
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({ status: "ok", accessToken: result.accessToken, user: result.user });
  } catch (err) {
    next(err);
  }
});

const twoFactorVerifySchema = z.object({
  challengeToken: z.string().min(1),
  // 6-digit TOTP code or a backup code (with or without its dash).
  code: z.string().trim().min(6).max(20),
});

authRouter.post("/2fa/verify", limiters.twoFactor, async (req, res, next) => {
  try {
    const input = twoFactorVerifySchema.parse(req.body);
    const { user, accessToken, refreshToken } = await completeTwoFactorLogin(input.challengeToken, input.code, req);
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ status: "ok", accessToken, user });
  } catch (err) {
    next(err);
  }
});

// ─── Password reset ──────────────────────────────────────────────────────────
// Tokens travel in the request body, not the URL, so they don't end up in
// proxy or access logs.

authRouter.post("/password-reset/request", limiters.passwordReset, async (req, res, next) => {
  try {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    await requestPasswordReset(email, req);
    // Same answer whether or not the account exists.
    res.status(202).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
});

const tokenSchema = z.string().min(20).max(200);

authRouter.post("/password-reset/validate", limiters.passwordReset, async (req, res, next) => {
  try {
    const { token } = z.object({ token: tokenSchema }).parse(req.body);
    res.status(200).json(await validatePasswordResetToken(token));
  } catch (err) {
    next(err);
  }
});

authRouter.post("/password-reset/confirm", limiters.passwordReset, async (req, res, next) => {
  try {
    const { token, password } = z.object({ token: tokenSchema, password: newPasswordSchema }).parse(req.body);
    await confirmPasswordReset(token, password, req);
    clearRefreshCookie(res);
    res.status(200).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    // No cookie just means "not signed in" — the web app probes this on every
    // page load, so it isn't an error (and shouldn't log one in the browser).
    if (!rawToken) {
      res.status(204).end();
      return;
    }
    const { accessToken, refreshToken, user } = await refreshSession(rawToken);
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ status: "ok", accessToken, user });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (rawToken) {
      await logoutSession(rawToken, req);
    }
    clearRefreshCookie(res);
    res.status(200).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.auth!.userId },
      include: { twoFactorSecret: true },
    });
    res.status(200).json({ user: toAuthUserDTO(user) });
  } catch (err) {
    next(err);
  }
});
