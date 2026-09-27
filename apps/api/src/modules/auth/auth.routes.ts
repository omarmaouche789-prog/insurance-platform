import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import { parseDurationMs } from "../../lib/refreshToken";
import { env } from "../../lib/env";
import { prisma } from "../../lib/prisma";
import {
  completeTwoFactorLogin,
  confirmTwoFactorSetup,
  loginUser,
  logoutSession,
  registerUser,
  refreshSession,
  setupTwoFactor,
  toAuthUserDTO,
} from "./auth.service";

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

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

authRouter.post("/register", async (req, res, next) => {
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
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res, next) => {
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
  code: z.string().length(6),
});

authRouter.post("/2fa/verify", async (req, res, next) => {
  try {
    const input = twoFactorVerifySchema.parse(req.body);
    const { user, accessToken, refreshToken } = await completeTwoFactorLogin(input.challengeToken, input.code, req);
    setRefreshCookie(res, refreshToken);
    res.status(200).json({ status: "ok", accessToken, user });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/2fa/setup", requireAuth, async (req, res, next) => {
  try {
    const result = await setupTwoFactor(req.auth!.userId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

const confirmSetupSchema = z.object({ code: z.string().length(6) });

authRouter.post("/2fa/setup/confirm", requireAuth, async (req, res, next) => {
  try {
    const { code } = confirmSetupSchema.parse(req.body);
    await confirmTwoFactorSetup(req.auth!.userId, code, req);
    res.status(200).json({ status: "ok" });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) {
      throw new HttpError(401, "Missing refresh token");
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
