import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationCategory } from "@insurance/shared";
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

const app = createApp();
const as = (role: string, sub = "agent-1") => ({ Authorization: `Bearer ${signAccessToken({ sub, role: role as "AGENT", adminRole: null })}` });
const AGENT = as("AGENT");
let prisma: ReturnType<typeof makeDbMock>;

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "n-1",
  userId: "agent-1",
  type: "application.assigned",
  title: "New application assigned: Uma User",
  body: "Silver PPO · ZIP 10001",
  link: "/agent/applications/app-1",
  applicationId: "app-1",
  readAt: null,
  createdAt: new Date("2026-10-11T10:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  prisma = db.current;
  prisma.systemSetting.findMany.mockResolvedValue([]);
});

describe("GET /api/agent/notifications", () => {
  it("lists the agent's own notifications, newest first, 20 per page, with the unread count", async () => {
    prisma.notification.count.mockResolvedValueOnce(45).mockResolvedValueOnce(7);
    prisma.notification.findMany.mockResolvedValue([row()]);
    const res = await request(app).get("/api/agent/notifications?page=2").set(AGENT);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      notifications: [
        {
          id: "n-1",
          type: "application.assigned",
          category: "ASSIGNMENT",
          title: "New application assigned: Uma User",
          body: "Silver PPO · ZIP 10001",
          link: "/agent/applications/app-1",
          applicationId: "app-1",
          readAt: null,
          createdAt: "2026-10-11T10:00:00.000Z",
        },
      ],
      unreadCount: 7,
      pagination: { page: 2, pageSize: 20, total: 45, pages: 3 },
    });
    const q = prisma.notification.findMany.mock.calls[0][0];
    expect(q).toMatchObject({ where: { userId: "agent-1" }, skip: 20, take: 20 });
    expect(q.orderBy[0]).toEqual({ createdAt: "desc" });
  });

  it("filters by category and read status", async () => {
    prisma.notification.count.mockResolvedValue(0);
    prisma.notification.findMany.mockResolvedValue([]);
    await request(app).get("/api/agent/notifications?type=DOCUMENT_REQUEST&read=false").set(AGENT).expect(200);
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({
      userId: "agent-1",
      type: { in: ["document.uploaded", "document.requested"] },
      readAt: null,
    });
    await request(app).get("/api/agent/notifications?type=OTHER&read=true").set(AGENT).expect(200);
    const other = prisma.notification.findMany.mock.calls[1][0].where;
    expect(other.readAt).toEqual({ not: null });
    expect(other.type.notIn).toContain("application.assigned");
  });

  it("rejects unknown filters", async () => {
    expect((await request(app).get("/api/agent/notifications?type=SPAM").set(AGENT)).status).toBe(400);
    expect((await request(app).get("/api/agent/notifications?page=0").set(AGENT)).status).toBe(400);
  });

  it("is for agents only", async () => {
    expect((await request(app).get("/api/agent/notifications").set(as("USER", "user-1"))).status).toBe(403);
    expect((await request(app).get("/api/agent/notifications")).status).toBe(401);
  });

  it("returns the unread count", async () => {
    prisma.notification.count.mockResolvedValue(3);
    const res = await request(app).get("/api/agent/notifications/unread-count").set(AGENT);
    expect(res.body).toEqual({ unreadCount: 3 });
    expect(prisma.notification.count).toHaveBeenCalledWith({ where: { userId: "agent-1", readAt: null } });
  });
});

describe("marking read and deleting", () => {
  it("marks one as read, scoped to the agent, and 404s someone else's", async () => {
    prisma.notification.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect((await request(app).patch("/api/agent/notifications/n-1/read").set(AGENT)).status).toBe(204);
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ id: "n-1", userId: "agent-1" });
    expect((await request(app).patch("/api/agent/notifications/n-9/read").set(AGENT)).status).toBe(404);
  });

  it("marks several as read at once (only unread ones, only the agent's)", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 2 });
    const res = await request(app).patch("/api/agent/notifications/bulk/read").set(AGENT).send({ ids: ["n-1", "n-2", "n-1"] });
    expect(res.body).toEqual({ updated: 2 });
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ id: { in: ["n-1", "n-2"] }, userId: "agent-1", readAt: null });
  });

  it("validates bulk ids", async () => {
    expect((await request(app).patch("/api/agent/notifications/bulk/read").set(AGENT).send({ ids: [] })).status).toBe(400);
    expect((await request(app).patch("/api/agent/notifications/bulk/read").set(AGENT).send({ ids: "n-1" })).status).toBe(400);
    expect((await request(app).patch("/api/agent/notifications/bulk/read").set(AGENT).send({ ids: Array.from({ length: 101 }, (_, i) => `n-${i}`) })).status).toBe(400);
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it("marks all as read", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 5 });
    expect((await request(app).patch("/api/agent/notifications/read-all").set(AGENT)).body).toEqual({ updated: 5 });
  });

  it("deletes the agent's own notification and 404s anything else", async () => {
    prisma.notification.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect((await request(app).delete("/api/agent/notifications/n-1").set(AGENT)).status).toBe(204);
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { id: "n-1", userId: "agent-1" } });
    expect((await request(app).delete("/api/agent/notifications/n-9").set(AGENT)).status).toBe(404);
  });
});

describe("categories", () => {
  it("maps stored types to the Notification Center categories", () => {
    expect(notificationCategory("application.assigned")).toBe("ASSIGNMENT");
    expect(notificationCategory("application.status")).toBe("STATUS_UPDATE");
    expect(notificationCategory("carrier.response")).toBe("CARRIER_RESPONSE");
    expect(notificationCategory("document.uploaded")).toBe("DOCUMENT_REQUEST");
    expect(notificationCategory("message")).toBe("MESSAGE");
    expect(notificationCategory("account.security")).toBe("OTHER");
  });
});
