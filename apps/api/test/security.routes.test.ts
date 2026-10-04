import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTransaction, makeDbMock, makeUser } from "./fixtures";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeDbMock> }));
vi.mock("../src/lib/prisma", async () => {
  const { makeDbMock: make } = await import("./fixtures");
  db.current = make();
  return { prisma: db.current };
});

const mailer = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/integrations/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/integrations/email")>()),
  email: mailer,
}));

import { createApp } from "../src/app";
import { signAccessToken, signChallengeToken } from "../src/lib/jwt";
import { resetRateLimits } from "../src/lib/rateLimit";
import { generateTotpCode, generateTotpSecret } from "../src/lib/totp";
import { hashBackupCode, readTotpSecret, sealTotpSecret } from "../src/modules/security/secrets";
import { sha256 } from "../src/lib/password";

const app = createApp();
const PASSWORD = "Password123!";
const passwordHash = bcrypt.hashSync(PASSWORD, 4);
const userToken = signAccessToken({ sub: "user-1", role: "USER", adminRole: null });
const auth = { Authorization: `Bearer ${userToken}` };

let prisma: ReturnType<typeof makeDbMock>;
let secret: string;

function enrolled(overrides: Record<string, unknown> = {}) {
  return makeUser({
    passwordHash,
    twoFactorEnabled: true,
    twoFactorSecret: { userId: "user-1", secret: sealTotpSecret(secret), enabledAt: new Date(), lastUsedStep: null },
    ...overrides,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  prisma = db.current;
  installTransaction(prisma);
  secret = generateTotpSecret();
  prisma.loginHistory.count.mockResolvedValue(0);
  prisma.twoFactorSecret.updateMany.mockResolvedValue({ count: 1 });
  prisma.backupCode.count.mockResolvedValue(10);
});

describe("self-only guard", () => {
  it("403s when :id is someone else", async () => {
    const res = await request(app).get("/api/users/someone-else/2fa").set(auth);
    expect(res.status).toBe(403);
  });

  it("requires a token", async () => {
    expect((await request(app).post("/api/users/me/2fa/enable")).status).toBe(401);
  });

  it.each(["me", "user-1"])("accepts %s as the caller", async (id) => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));
    const res = await request(app).get(`/api/users/${id}/2fa`).set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enabled: false, enabledAt: null, backupCodesRemaining: 0 });
  });
});

describe("POST /api/users/:id/2fa/enable", () => {
  it("returns a secret and a server-rendered QR code, storing the secret encrypted", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));
    const res = await request(app).post("/api/users/me/2fa/enable").set(auth);

    expect(res.status).toBe(200);
    expect(res.body.secret).toMatch(/^[A-Z2-7]+$/);
    expect(res.body.otpAuthUrl).toContain("otpauth://totp/");
    expect(res.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    const stored = prisma.twoFactorSecret.upsert.mock.calls[0][0].create.secret;
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain(res.body.secret);
    expect(readTotpSecret(stored)).toBe(res.body.secret);
  });

  it("works for every role, not just staff", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash, role: "USER" }));
    expect((await request(app).post("/api/users/me/2fa/enable").set(auth)).status).toBe(200);
  });

  it("409s when 2FA is already on", async () => {
    prisma.user.findUnique.mockResolvedValue(enrolled());
    expect((await request(app).post("/api/users/me/2fa/enable").set(auth)).status).toBe(409);
  });
});

describe("POST /api/users/:id/2fa/verify", () => {
  const pending = () =>
    makeUser({ passwordHash, twoFactorSecret: { userId: "user-1", secret: sealTotpSecret(secret), enabledAt: null, lastUsedStep: null } });

  it("turns 2FA on and returns 10 one-time backup codes, storing only their hashes", async () => {
    prisma.user.findUnique.mockResolvedValue(pending());
    const res = await request(app).post("/api/users/me/2fa/verify").set(auth).send({ code: generateTotpCode(secret) });

    expect(res.status).toBe(200);
    expect(res.body.backupCodes).toHaveLength(10);
    expect(new Set(res.body.backupCodes).size).toBe(10);
    for (const code of res.body.backupCodes) expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const stored = prisma.backupCode.createMany.mock.calls[0][0].data;
    expect(stored.map((r: { codeHash: string }) => r.codeHash)).toEqual(res.body.backupCodes.map(hashBackupCode));
    expect(JSON.stringify(stored)).not.toContain(res.body.backupCodes[0]);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { twoFactorEnabled: true } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "auth.2fa_enabled" }) });
    expect(mailer.send.mock.calls[0][0].subject).toMatch(/Two-factor/);
  });

  it("400s on a wrong code", async () => {
    prisma.user.findUnique.mockResolvedValue(pending());
    const res = await request(app).post("/api/users/me/2fa/verify").set(auth).send({ code: "000000" });
    expect(res.status).toBe(400);
    expect(prisma.backupCode.createMany).not.toHaveBeenCalled();
  });

  it("refuses a replayed code (same time step already used)", async () => {
    prisma.user.findUnique.mockResolvedValue(pending());
    prisma.twoFactorSecret.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post("/api/users/me/2fa/verify").set(auth).send({ code: generateTotpCode(secret) });
    expect(res.status).toBe(400);
  });

  it("400s before setup has started, and validates the code format", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));
    expect((await request(app).post("/api/users/me/2fa/verify").set(auth).send({ code: "123456" })).status).toBe(400);
    expect((await request(app).post("/api/users/me/2fa/verify").set(auth).send({ code: "12ab" })).status).toBe(400);
  });
});

describe("POST /api/users/:id/2fa/disable", () => {
  it("needs the password and a current code, then removes the factor and backup codes", async () => {
    prisma.user.findUnique.mockResolvedValue(enrolled());
    const res = await request(app)
      .post("/api/users/me/2fa/disable")
      .set(auth)
      .send({ password: PASSWORD, code: generateTotpCode(secret) });

    expect(res.status).toBe(200);
    expect(prisma.twoFactorSecret.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(prisma.backupCode.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { twoFactorEnabled: false } });
  });

  it("accepts a backup code instead of an authenticator code", async () => {
    prisma.user.findUnique.mockResolvedValue(enrolled());
    prisma.backupCode.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post("/api/users/me/2fa/disable").set(auth).send({ password: PASSWORD, code: "abcde-fghjk" });
    expect(res.status).toBe(200);
    expect(prisma.backupCode.updateMany.mock.calls[0][0].where).toMatchObject({ codeHash: hashBackupCode("ABCDEFGHJK"), usedAt: null });
  });

  it("400s on a wrong password without consuming a code", async () => {
    prisma.user.findUnique.mockResolvedValue(enrolled());
    const res = await request(app).post("/api/users/me/2fa/disable").set(auth).send({ password: "nope", code: generateTotpCode(secret) });
    expect(res.status).toBe(400);
    expect(prisma.twoFactorSecret.updateMany).not.toHaveBeenCalled();
    expect(prisma.twoFactorSecret.deleteMany).not.toHaveBeenCalled();
  });

  it("409s when 2FA is off", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));
    const res = await request(app).post("/api/users/me/2fa/disable").set(auth).send({ password: PASSWORD, code: "123456" });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/users/:id/2fa/backup-codes", () => {
  it("regenerates with an authenticator code", async () => {
    prisma.user.findUnique.mockResolvedValue(enrolled());
    const res = await request(app).post("/api/users/me/2fa/backup-codes").set(auth).send({ code: generateTotpCode(secret) });
    expect(res.status).toBe(200);
    expect(res.body.backupCodes).toHaveLength(10);
    expect(prisma.backupCode.deleteMany).toHaveBeenCalled();
  });

  it("won't accept a backup code to mint new ones", async () => {
    prisma.user.findUnique.mockResolvedValue(enrolled());
    const res = await request(app).post("/api/users/me/2fa/backup-codes").set(auth).send({ code: "ABCDE-FGHJK" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/users/:id/login-history", () => {
  it("returns the caller's own sign-ins with a parsed device", async () => {
    prisma.loginHistory.count.mockResolvedValue(1);
    prisma.loginHistory.findMany.mockResolvedValue([
      {
        id: "lh-1",
        userId: "user-1",
        success: true,
        method: "TOTP",
        failureReason: null,
        ipAddress: "203.0.113.9",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
        device: "Safari on iOS",
        createdAt: new Date("2026-09-01T10:00:00Z"),
      },
    ]);
    const res = await request(app).get("/api/users/me/login-history?pageSize=5").set(auth);
    expect(res.status).toBe(200);
    expect(prisma.loginHistory.findMany.mock.calls[0][0].where).toEqual({ userId: "user-1" });
    expect(res.body.entries[0]).toMatchObject({ device: "Safari on iOS", deviceType: "mobile", method: "TOTP" });
  });
});

describe("login", () => {
  const login = (body: object, ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128.0 Safari/537.36") =>
    request(app).post("/api/auth/login").set("User-Agent", ua).send(body);

  it("records a successful sign-in with device and updates lastLoginAt", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));
    const res = await login({ email: "user@example.com", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(prisma.loginHistory.create.mock.calls[0][0].data).toMatchObject({
      userId: "user-1",
      success: true,
      method: "PASSWORD",
      device: "Chrome on macOS",
    });
    expect(prisma.user.update.mock.calls[0][0].data.lastLoginAt).toBeInstanceOf(Date);
  });

  it("records a failed attempt for a known account and returns a generic 401", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));
    const res = await login({ email: "user@example.com", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
    expect(prisma.loginHistory.create.mock.calls[0][0].data).toMatchObject({ success: false, failureReason: "Incorrect password" });
  });

  it("gives the same 401 for an unknown email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    const res = await login({ email: "ghost@example.com", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid email or password");
  });

  it("refuses deleted accounts like unknown ones", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash, deletedAt: new Date() }));
    expect((await login({ email: "user@example.com", password: PASSWORD })).status).toBe(401);
  });

  it("tells a suspended user why, but only after a correct password", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash, isActive: false }));
    const res = await login({ email: "user@example.com", password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspended/);
    expect((await login({ email: "user@example.com", password: "wrong" })).status).toBe(401);
  });

  it("locks the account after too many failures", async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ passwordHash }));
    prisma.loginHistory.count.mockResolvedValue(10);
    const res = await login({ email: "user@example.com", password: PASSWORD });
    expect(res.status).toBe(429);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it("rate limits by network", async () => {
    // Validation failures still count, which keeps this test fast (no bcrypt).
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await login({ email: "", password: "x" })).status);
    expect(statuses.slice(0, 20).every((s) => s === 400)).toBe(true);
    expect(statuses[20]).toBe(429);
    const res = await login({ email: "", password: "x" });
    expect(res.headers["retry-after"]).toBeDefined();
  });

  it("falls back to a case-insensitive email match", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(makeUser({ passwordHash, email: "Mixed@Example.com" }));
    expect((await login({ email: "mixed@example.com", password: PASSWORD })).status).toBe(200);
  });

  it("issues a 2FA challenge when enrolled", async () => {
    prisma.user.findUnique.mockResolvedValue(enrolled());
    const res = await login({ email: "user@example.com", password: PASSWORD });
    expect(res.body).toMatchObject({ status: "2fa_required" });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/2fa/verify", () => {
  const verify = (code: string, challengeToken = signChallengeToken("user-1")) =>
    request(app).post("/api/auth/2fa/verify").send({ challengeToken, code });

  it("completes sign-in with an authenticator code", async () => {
    prisma.user.findUnique.mockResolvedValue(enrolled());
    const res = await verify(generateTotpCode(secret));
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(prisma.loginHistory.create.mock.calls[0][0].data).toMatchObject({ success: true, method: "TOTP" });
  });

  it("completes sign-in with a backup code (lost-phone recovery) and warns about remaining codes", async () => {
    prisma.user.findUnique.mockResolvedValue(enrolled());
    prisma.backupCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.backupCode.count.mockResolvedValue(3);
    const res = await verify("ABCDE-FGHJK");
    expect(res.status).toBe(200);
    expect(prisma.loginHistory.create.mock.calls[0][0].data).toMatchObject({ method: "BACKUP_CODE" });
    expect(prisma.notification.create.mock.calls[0][0].data.body).toMatch(/^3 backup codes left/);
  });

  it("refuses an already-used backup code", async () => {
    prisma.user.findUnique.mockResolvedValue(enrolled());
    prisma.backupCode.updateMany.mockResolvedValue({ count: 0 });
    const res = await verify("ABCDE-FGHJK");
    expect(res.status).toBe(401);
    expect(prisma.loginHistory.create.mock.calls[0][0].data).toMatchObject({ success: false, method: "BACKUP_CODE" });
  });

  it("locks out after repeated wrong codes", async () => {
    prisma.user.findUnique.mockResolvedValue(enrolled());
    prisma.loginHistory.count.mockResolvedValue(5);
    expect((await verify(generateTotpCode(secret))).status).toBe(429);
  });

  it("401s on a bad challenge token and 403s for a since-suspended account", async () => {
    expect((await verify("123456", "garbage")).status).toBe(401);
    prisma.user.findUnique.mockResolvedValue(enrolled({ isActive: false }));
    expect((await verify("123456")).status).toBe(403);
  });

  it("accepts and re-encrypts a legacy plaintext secret", async () => {
    prisma.user.findUnique.mockResolvedValue(
      enrolled({ twoFactorSecret: { userId: "user-1", secret, enabledAt: new Date(), lastUsedStep: null } }),
    );
    const res = await verify(generateTotpCode(secret));
    expect(res.status).toBe(200);
    expect(prisma.twoFactorSecret.updateMany.mock.calls[0][0].data.secret).toMatch(/^v1:/);
  });
});

describe("password reset", () => {
  const tokenRow = (overrides: Record<string, unknown> = {}) => ({
    id: "prt-1",
    userId: "user-1",
    tokenHash: sha256("t".repeat(43)),
    purpose: "RESET",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: makeUser({ passwordHash }),
    ...overrides,
  });

  it("request: same 202 whether or not the account exists", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    const unknown = await request(app).post("/api/auth/password-reset/request").send({ email: "ghost@example.com" });
    prisma.user.findUnique.mockResolvedValueOnce(makeUser());
    const known = await request(app).post("/api/auth/password-reset/request").send({ email: "user@example.com" });

    expect(unknown.status).toBe(202);
    expect(known.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const sent = mailer.send.mock.calls[0][0];
    expect(sent.text).toMatch(/\/reset-password\?token=/);
    // Only a hash of the token is stored.
    const stored = prisma.passwordResetToken.create.mock.calls[0][0].data.tokenHash;
    expect(sent.text).not.toContain(stored);
  });

  it("validate: masks the email", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow());
    const res = await request(app).post("/api/auth/password-reset/validate").send({ token: "t".repeat(43) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ purpose: "RESET", firstName: "Uma", email: "u***@example.com" });
  });

  it.each([
    ["used", { usedAt: new Date() }],
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
  ])("rejects a %s token", async (_label, overrides) => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow(overrides));
    const res = await request(app).post("/api/auth/password-reset/confirm").send({ token: "t".repeat(43), password: "NewPassw0rd" });
    expect(res.status).toBe(400);
  });

  it("confirm: sets the password, ends all sessions, and claims the token atomically", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow());
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post("/api/auth/password-reset/confirm").send({ token: "t".repeat(43), password: "NewPassw0rd" });

    expect(res.status).toBe(200);
    expect(prisma.passwordResetToken.updateMany.mock.calls[0][0].where).toEqual({ id: "prt-1", usedAt: null });
    const newHash = prisma.user.update.mock.calls[0][0].data.passwordHash;
    expect(bcrypt.compareSync("NewPassw0rd", newHash)).toBe(true);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1", revokedAt: null } }));
  });

  it("confirm: loses the race cleanly", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow());
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).post("/api/auth/password-reset/confirm").send({ token: "t".repeat(43), password: "NewPassw0rd" });
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("confirm: an invite also verifies the email", async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(tokenRow({ purpose: "INVITE" }));
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    await request(app).post("/api/auth/password-reset/confirm").send({ token: "t".repeat(43), password: "NewPassw0rd" });
    expect(prisma.user.update.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("confirm: enforces password strength", async () => {
    const res = await request(app).post("/api/auth/password-reset/confirm").send({ token: "t".repeat(43), password: "short" });
    expect(res.status).toBe(400);
    const weak = await request(app).post("/api/auth/password-reset/confirm").send({ token: "t".repeat(43), password: "allletters" });
    expect(weak.status).toBe(400);
  });
});

describe("session endpoints", () => {
  it("register: creates a USER, records the sign-in, and sets the refresh cookie", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => makeUser({ ...data, id: "new-1" }));
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: " New@Example.com ", password: "Passw0rdOK", firstName: "Nia", lastName: "New" });

    expect(res.status).toBe(201);
    expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({ email: "new@example.com", role: "USER" });
    expect(res.headers["set-cookie"][0]).toMatch(/^refresh_token=.*HttpOnly/);
    expect(prisma.loginHistory.create).toHaveBeenCalled();
  });

  it("register: 409s on a duplicate and enforces the password policy", async () => {
    prisma.user.findFirst.mockResolvedValue(makeUser());
    expect(
      (await request(app).post("/api/auth/register").send({ email: "user@example.com", password: "Passw0rdOK", firstName: "A", lastName: "B" })).status,
    ).toBe(409);
    expect(
      (await request(app).post("/api/auth/register").send({ email: "x@example.com", password: "password", firstName: "A", lastName: "B" })).status,
    ).toBe(400);
  });

  it("refresh: rotates the token and refuses deleted or suspended users", async () => {
    const stored = { id: "rt-1", userId: "user-1", revokedAt: null, replacedByTokenId: null, expiresAt: new Date(Date.now() + 60_000), user: makeUser() };
    prisma.refreshToken.findUnique.mockResolvedValue(stored);
    prisma.refreshToken.create.mockResolvedValue({ id: "rt-2" });
    const ok = await request(app).post("/api/auth/refresh").set("Cookie", "refresh_token=abc");
    expect(ok.status).toBe(200);
    expect(prisma.refreshToken.update.mock.calls[0][0]).toMatchObject({ where: { id: "rt-1" }, data: { replacedByTokenId: "rt-2" } });

    prisma.refreshToken.findUnique.mockResolvedValue({ ...stored, user: makeUser({ deletedAt: new Date(), isActive: false }) });
    expect((await request(app).post("/api/auth/refresh").set("Cookie", "refresh_token=abc")).status).toBe(401);
    // No cookie at all is "signed out", not an error.
    expect((await request(app).post("/api/auth/refresh")).status).toBe(204);
  });

  it("logout: revokes the token and clears the cookie", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({ id: "rt-1", userId: "user-1", revokedAt: null });
    const res = await request(app).post("/api/auth/logout").set("Cookie", "refresh_token=abc");
    expect(res.status).toBe(200);
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({ where: { id: "rt-1" }, data: { revokedAt: expect.any(Date) } });
    expect(res.headers["set-cookie"][0]).toMatch(/refresh_token=;/);
  });

  it("me: reports 2FA status from the users column", async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue(makeUser({ twoFactorEnabled: true }));
    const res = await request(app).get("/api/auth/me").set(auth);
    expect(res.body.user).toMatchObject({ id: "user-1", twoFactorEnabled: true });
  });
});
