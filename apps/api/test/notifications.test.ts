import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDbMock } from "./fixtures";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeDbMock> }));
vi.mock("../src/lib/prisma", async () => {
  const { makeDbMock: make } = await import("./fixtures");
  db.current = make();
  return { prisma: db.current };
});

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { notify } from "../src/modules/notifications/notifications.service";

const app = createApp();
const auth = { Authorization: `Bearer ${signAccessToken({ sub: "agent-1", role: "AGENT", adminRole: null })}` };
let prisma: ReturnType<typeof makeDbMock>;

beforeEach(() => {
  vi.resetAllMocks();
  prisma = db.current;
});

describe("notifications API", () => {
  it("lists the caller's notifications with an unread count", async () => {
    prisma.notification.count.mockResolvedValue(2);
    prisma.notification.findMany.mockResolvedValue([
      { id: "n1", userId: "agent-1", type: "document.uploaded", title: "Uploaded", body: null, link: "/agent", readAt: null, createdAt: new Date("2026-09-01T00:00:00Z") },
    ]);
    const after = "2026-08-01T00:00:00.000Z";
    const res = await request(app).get(`/api/notifications?unreadOnly=true&limit=5&after=${after}`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(2);
    expect(res.body.notifications[0]).toMatchObject({ id: "n1", readAt: null, createdAt: "2026-09-01T00:00:00.000Z" });
    expect(prisma.notification.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: "agent-1", readAt: null, createdAt: { gt: new Date(after) } },
      take: 5,
    });
  });

  it("marks one read (owner-scoped) and all read", async () => {
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 4 });
    expect((await request(app).post("/api/notifications/n1/read").set(auth)).status).toBe(204);
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ id: "n1", userId: "agent-1" });
    expect((await request(app).post("/api/notifications/other/read").set(auth)).status).toBe(404);
    const all = await request(app).post("/api/notifications/read-all").set(auth);
    expect(all.body).toEqual({ updated: 4 });
  });

  it("requires sign-in", async () => {
    expect((await request(app).get("/api/notifications")).status).toBe(401);
  });

  it("notify() never throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    prisma.notification.create.mockRejectedValue(new Error("db down"));
    await expect(notify("u", { type: "account.security", title: "x" })).resolves.toBe(false);
    spy.mockRestore();
  });
});
