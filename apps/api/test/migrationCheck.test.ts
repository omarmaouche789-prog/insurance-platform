import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDbMock } from "./fixtures";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeDbMock> }));
vi.mock("../src/lib/prisma", async () => {
  const { makeDbMock: make } = await import("./fixtures");
  db.current = make();
  return { prisma: db.current };
});

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { resetRateLimits } from "../src/lib/rateLimit";
import { warnAboutPendingMigrations } from "../src/lib/migrationCheck";

const app = createApp();
const ADMIN = { Authorization: `Bearer ${signAccessToken({ sub: "admin-1", role: "ADMIN", adminRole: "SUPER" })}` };
let prisma: ReturnType<typeof makeDbMock>;

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  prisma = db.current;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("database out of date", () => {
  it("answers a clear error instead of 'Internal server error' when a column is missing", async () => {
    const missing = new Prisma.PrismaClientKnownRequestError("The column `system_settings.id` does not exist in the current database.", {
      code: "P2022",
      clientVersion: "test",
    });
    prisma.systemSetting.findMany.mockRejectedValue(missing);
    const res = await request(app).get("/api/admin/settings").set(ADMIN);
    expect(res.status).toBe(500);
    expect(res.body.code).toBe("DATABASE_OUT_OF_DATE");
    expect(res.body.error).toMatch(/database is out of date.*prisma:migrate/i);
  });

  it("keeps the generic message for other errors", async () => {
    prisma.emailTemplate.findMany.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/api/admin/email-templates").set(ADMIN);
    expect(res.body).toEqual({ error: "Internal server error" });
  });
});

describe("warnAboutPendingMigrations", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"));
    for (const name of ["20260101000000_init", "20260201000000_more", "20260301000000_latest"]) fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, "migration_lock.toml"), "");
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("lists migrations the database hasn't applied and warns", async () => {
    prisma.$queryRaw.mockResolvedValue([{ migration_name: "20260101000000_init" }]);
    expect(await warnAboutPendingMigrations(dir)).toEqual(["20260201000000_more", "20260301000000_latest"]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("20260301000000_latest"));
  });

  it("is quiet when everything is applied, and never throws", async () => {
    prisma.$queryRaw.mockResolvedValue(["20260101000000_init", "20260201000000_more", "20260301000000_latest"].map((migration_name) => ({ migration_name })));
    expect(await warnAboutPendingMigrations(dir)).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
    prisma.$queryRaw.mockRejectedValue(new Error("db down"));
    await expect(warnAboutPendingMigrations(dir)).resolves.toEqual([]);
  });
});
