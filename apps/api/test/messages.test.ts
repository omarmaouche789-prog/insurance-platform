import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installTransaction, makeDbMock } from "./fixtures";

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
const as = (role: "ADMIN" | "AGENT" | "USER", sub: string, adminRole: string | null = null) => ({
  Authorization: `Bearer ${signAccessToken({ sub, role, adminRole: adminRole as "SUPER" | null })}`,
});
const ADMIN = as("ADMIN", "admin-1", "COMPLIANCE");
const AGENT = as("AGENT", "agent-1");
let prisma: ReturnType<typeof makeDbMock>;

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "msg-1",
  fromAdminId: "admin-1",
  toAgentId: "agent-1",
  subject: "Quarterly targets",
  body: "Please review the new targets.",
  sentAt: new Date("2026-10-11T10:00:00Z"),
  read: false,
  readAt: null,
  createdAt: new Date("2026-10-11T10:00:00Z"),
  updatedAt: new Date("2026-10-11T10:00:00Z"),
  fromAdmin: { id: "admin-1", firstName: "Ada", lastName: "Admin" },
  toAgent: { id: "agent-1", firstName: "Alex", lastName: "Agent" },
  ...overrides,
});

const dto = {
  id: "msg-1",
  subject: "Quarterly targets",
  body: "Please review the new targets.",
  sentAt: "2026-10-11T10:00:00.000Z",
  read: false,
  readAt: null,
  from: { id: "admin-1", name: "Ada Admin" },
  to: { id: "agent-1", name: "Alex Agent" },
};

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  prisma = db.current;
  installTransaction(prisma);
  prisma.systemSetting.findMany.mockResolvedValue([]);
});

describe("POST /api/admin/messages", () => {
  const send = (body: Record<string, unknown>, headers = ADMIN) => request(app).post("/api/admin/messages").set(headers).send(body);

  it("sends to an active agent, notifies them without the content, and audit-logs who and when only", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "agent-1" });
    prisma.message.create.mockResolvedValue(row());
    prisma.notification.create.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    const res = await send({ toAgentId: "agent-1", subject: "  Quarterly targets ", body: "Please review the new targets." });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(dto);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ id: "agent-1", role: "AGENT", isActive: true, deletedAt: null });
    expect(prisma.message.create.mock.calls[0][0].data).toEqual({
      fromAdminId: "admin-1",
      toAgentId: "agent-1",
      subject: "Quarterly targets",
      body: "Please review the new targets.",
    });
    expect(prisma.notification.create.mock.calls[0][0].data).toEqual({
      userId: "agent-1",
      type: "message",
      title: "New message from Ada Admin",
      body: null,
      link: "/agent/messages?id=msg-1",
      applicationId: null,
      messageId: "msg-1",
    });
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ actorUserId: "admin-1", action: "message.sent", entityId: "msg-1", metadata: { toAgentId: "agent-1" } });
    expect(JSON.stringify(audit)).not.toContain("Quarterly");
  });

  it("still sends when the notification can't be created", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "agent-1" });
    prisma.message.create.mockResolvedValue(row());
    prisma.notification.create.mockRejectedValue(new Error("db down"));
    prisma.auditLog.create.mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await send({ toAgentId: "agent-1", subject: "Hi", body: "Hello" })).status).toBe(201);
  });

  it("404s a recipient that isn't an active agent", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    const res = await send({ toAgentId: "user-1", subject: "Hi", body: "Hello" });
    expect(res.status).toBe(404);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("validates the input", async () => {
    expect((await send({ toAgentId: "agent-1", subject: "   ", body: "Hello" })).status).toBe(400);
    expect((await send({ toAgentId: "agent-1", subject: "Hi", body: "" })).status).toBe(400);
    expect((await send({ toAgentId: "agent-1", subject: "x".repeat(201), body: "Hello" })).status).toBe(400);
    expect((await send({ toAgentId: "agent-1", subject: "Hi", body: "x".repeat(5001) })).status).toBe(400);
    expect((await send({ toAgentId: "", subject: "Hi", body: "Hello" })).status).toBe(400);
    expect((await send({ toAgentId: "agent-1", subject: "Hi", body: "Hello", fromAdminId: "x" })).status).toBe(400);
  });

  it("is for admins only", async () => {
    expect((await send({ toAgentId: "agent-1", subject: "Hi", body: "Hello" }, AGENT)).status).toBe(403);
    expect((await request(app).post("/api/admin/messages").send({})).status).toBe(401);
  });
});

describe("GET /api/admin/messages", () => {
  it("lists sent messages with read status, filtered by subject and agent", async () => {
    prisma.message.count.mockResolvedValue(1);
    prisma.message.findMany.mockResolvedValue([row({ read: true, readAt: new Date("2026-10-11T11:00:00Z") })]);
    const res = await request(app).get("/api/admin/messages?search=target&agentId=agent-1").set(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.messages[0]).toMatchObject({ id: "msg-1", read: true, readAt: "2026-10-11T11:00:00.000Z" });
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 20, total: 1, pages: 1 });
    expect(prisma.message.findMany.mock.calls[0][0].where).toEqual({
      subject: { contains: "target", mode: "insensitive" },
      toAgentId: "agent-1",
    });
  });

  it("is for admins only", async () => {
    expect((await request(app).get("/api/admin/messages").set(AGENT)).status).toBe(403);
  });
});

describe("GET /api/agent/messages", () => {
  it("lists the agent's own messages, newest first, with the unread count", async () => {
    prisma.message.count.mockResolvedValueOnce(25).mockResolvedValueOnce(4);
    prisma.message.findMany.mockResolvedValue([row()]);
    const res = await request(app).get("/api/agent/messages?page=2&search=%20quarter%20&read=false").set(AGENT);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ messages: [dto], unreadCount: 4, pagination: { page: 2, pageSize: 20, total: 25, pages: 2 } });
    const q = prisma.message.findMany.mock.calls[0][0];
    expect(q).toMatchObject({
      where: { toAgentId: "agent-1", subject: { contains: "quarter", mode: "insensitive" }, read: false },
      skip: 20,
      take: 20,
    });
    expect(q.orderBy[0]).toEqual({ sentAt: "desc" });
  });

  it("rejects bad filters and non-agents", async () => {
    expect((await request(app).get("/api/agent/messages?read=maybe").set(AGENT)).status).toBe(400);
    expect((await request(app).get("/api/agent/messages?page=0").set(AGENT)).status).toBe(400);
    expect((await request(app).get("/api/agent/messages").set(ADMIN)).status).toBe(403);
    expect((await request(app).get("/api/agent/messages").set(as("USER", "user-1"))).status).toBe(403);
  });

  it("returns the unread count", async () => {
    prisma.message.count.mockResolvedValue(2);
    expect((await request(app).get("/api/agent/messages/unread-count").set(AGENT)).body).toEqual({ unreadCount: 2 });
  });
});

describe("GET /api/agent/messages/:id", () => {
  it("returns the agent's own message and 404s anyone else's", async () => {
    prisma.message.findFirst.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    const res = await request(app).get("/api/agent/messages/msg-1").set(AGENT);
    expect(res.body).toEqual(dto);
    expect(prisma.message.findFirst.mock.calls[0][0].where).toEqual({ id: "msg-1", toAgentId: "agent-1" });
    expect((await request(app).get("/api/agent/messages/msg-9").set(AGENT)).status).toBe(404);
  });
});

describe("PUT /api/agent/messages/:id/read and /unread", () => {
  it("marks it read and clears its notification", async () => {
    prisma.message.findFirst.mockResolvedValue(row());
    prisma.message.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row(data));
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app).put("/api/agent/messages/msg-1/read").set(AGENT);

    expect(res.status).toBe(200);
    expect(res.body.read).toBe(true);
    expect(res.body.readAt).toEqual(expect.any(String));
    const update = prisma.message.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "msg-1" });
    expect(update.data.read).toBe(true);
    const n = prisma.notification.updateMany.mock.calls[0][0];
    expect(n.where).toEqual({ userId: "agent-1", messageId: "msg-1", readAt: null });
    expect(n.data.readAt).toBeInstanceOf(Date);
  });

  it("leaves an already-read message (and its read time) alone", async () => {
    prisma.message.findFirst.mockResolvedValue(row({ read: true, readAt: new Date("2026-10-11T11:00:00Z") }));
    const res = await request(app).put("/api/agent/messages/msg-1/read").set(AGENT);
    expect(res.body.readAt).toBe("2026-10-11T11:00:00.000Z");
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it("marks it unread without touching notifications", async () => {
    prisma.message.findFirst.mockResolvedValue(row({ read: true, readAt: new Date() }));
    prisma.message.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => row(data));
    const res = await request(app).put("/api/agent/messages/msg-1/unread").set(AGENT);
    expect(res.body).toMatchObject({ read: false, readAt: null });
    expect(prisma.message.update.mock.calls[0][0].data).toEqual({ read: false, readAt: null });
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it("404s another agent's message", async () => {
    prisma.message.findFirst.mockResolvedValue(null);
    expect((await request(app).put("/api/agent/messages/msg-9/read").set(AGENT)).status).toBe(404);
    expect(prisma.message.update).not.toHaveBeenCalled();
  });
});
