import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTransaction, makeDbMock, makeUser } from "./fixtures";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeDbMock> }));
vi.mock("../src/lib/prisma", async () => {
  const { makeDbMock: make } = await import("./fixtures");
  db.current = make();
  return { prisma: db.current };
});
vi.mock("../src/integrations/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/integrations/email")>()),
  email: { send: vi.fn() },
}));

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { resetRateLimits } from "../src/lib/rateLimit";
import { toAuthUserDTO } from "../src/modules/auth/auth.service";

const app = createApp();
const USER = { Authorization: `Bearer ${signAccessToken({ sub: "user-1", role: "USER", adminRole: null })}` };
let prisma: ReturnType<typeof makeDbMock>;

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  prisma = db.current;
  installTransaction(prisma);
  prisma.systemSetting.findMany.mockResolvedValue([]);
});

describe("PUT /api/users/:id/preferences", () => {
  it("saves the caller's language", async () => {
    prisma.user.update.mockResolvedValue(makeUser({ locale: "ar" }));
    const res = await request(app).put("/api/users/me/preferences").set(USER).send({ locale: "ar" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ locale: "ar" });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { locale: "ar" } });
  });

  it("rejects unsupported languages and unknown fields", async () => {
    expect((await request(app).put("/api/users/me/preferences").set(USER).send({ locale: "fr" })).status).toBe(400);
    expect((await request(app).put("/api/users/me/preferences").set(USER).send({ locale: "en", role: "ADMIN" })).status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("only works on your own account and needs a session", async () => {
    expect((await request(app).put("/api/users/someone-else/preferences").set(USER).send({ locale: "ar" })).status).toBe(403);
    expect((await request(app).put("/api/users/me/preferences").send({ locale: "ar" })).status).toBe(401);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("locale on the signed-in user", () => {
  it("is returned with the user and falls back to English for unknown values", () => {
    expect(toAuthUserDTO(makeUser({ locale: "ar" }) as never).locale).toBe("ar");
    expect(toAuthUserDTO(makeUser({ locale: "xx" }) as never).locale).toBe("en");
  });

  it("register saves the language the visitor was browsing in", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => makeUser({ ...data, id: "new-1" }));
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "nia@example.com", password: "Passw0rdOK", firstName: "Nia", lastName: "New", locale: "ar" });
    expect(res.status).toBe(201);
    expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({ locale: "ar" });
    expect(res.body.user.locale).toBe("ar");
  });
});
