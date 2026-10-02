import ExcelJS from "exceljs";
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
import {
  bucketStart,
  buildAcquisitionPoints,
  buildBuckets,
  buildFunnelStages,
  resolveRange,
} from "../src/modules/admin/analytics.service";

const app = createApp();
const auth = { Authorization: `Bearer ${signAccessToken({ sub: "admin-1", role: "ADMIN", adminRole: "FINANCE" })}` };
let prisma: ReturnType<typeof makeDbMock>;

beforeEach(() => {
  vi.resetAllMocks();
  prisma = db.current;
});

function binaryParser(res: NodeJS.ReadableStream & { setEncoding(e: string): void }, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
}

function approvalMocks() {
  prisma.application.groupBy
    .mockResolvedValueOnce([
      { agentId: "a1", _count: { _all: 10 } },
      { agentId: "a2", _count: { _all: 4 } },
    ])
    .mockResolvedValueOnce([
      { agentId: "a1", status: "APPROVED", _count: { _all: 6 } },
      { agentId: "a1", status: "REJECTED", _count: { _all: 2 } },
      { agentId: "a2", status: "APPROVED", _count: { _all: 3 } },
    ]);
  prisma.commission.groupBy.mockResolvedValueOnce([{ agentId: "a1", _sum: { amountCents: 120000 } }]);
  prisma.user.findMany.mockResolvedValue([
    { id: "a1", firstName: "Alex", lastName: "Agent", isActive: true },
    { id: "a2", firstName: "Bea", lastName: "Broker", isActive: false },
  ]);
}

function revenueMocks() {
  prisma.commission.groupBy
    .mockResolvedValueOnce([
      { carrierId: "c1", status: "PENDING", _sum: { amountCents: 1000 } },
      { carrierId: "c1", status: "EARNED", _sum: { amountCents: 5000 } },
      { carrierId: "c2", status: "PAID", _sum: { amountCents: 9000 } },
    ])
    .mockResolvedValueOnce([
      { carrierId: "c1", _count: { _all: 3 } },
      { carrierId: "c2", _count: { _all: 1 } },
    ]);
  prisma.carrier.findMany.mockResolvedValue([
    { id: "c1", name: "BluePeak Health" },
    { id: "c2", name: "Summit Mutual" },
  ]);
}

describe("date ranges", () => {
  it("defaults to the last 90 days, inclusive of today", () => {
    const r = resolveRange(undefined, undefined, new Date("2026-10-02T15:00:00Z"));
    expect(r).toMatchObject({ from: "2026-07-05", to: "2026-10-02" });
    expect(r.end.toISOString()).toBe("2026-10-03T00:00:00.000Z");
  });

  it("rejects inverted and oversized ranges", () => {
    expect(() => resolveRange("2026-10-02", "2026-10-01")).toThrow(/on or before/);
    expect(() => resolveRange("2020-01-01", "2026-01-01")).toThrow(/at most/);
  });

  it("buckets by Monday-start week and by month without gaps", () => {
    expect(bucketStart(new Date("2026-10-04T23:00:00Z"), "week").toISOString().slice(0, 10)).toBe("2026-09-28");
    expect(buildBuckets(resolveRange("2026-09-29", "2026-10-13"), "week")).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(buildBuckets(resolveRange("2026-11-15", "2027-01-02"), "month")).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
  });

  it("folds raw rows into points with a running total", () => {
    const points = buildAcquisitionPoints(
      ["2026-09-28", "2026-10-05"],
      [
        { period: new Date("2026-09-28T00:00:00Z"), role: "USER", count: 3 },
        { period: new Date("2026-10-05T00:00:00Z"), role: "USER", count: 2 },
        { period: new Date("2026-10-05T00:00:00Z"), role: "AGENT", count: 1 },
      ],
    );
    expect(points).toEqual([
      { period: "2026-09-28", users: 3, agents: 0, cumulativeUsers: 3 },
      { period: "2026-10-05", users: 2, agents: 1, cumulativeUsers: 5 },
    ]);
  });

  it("computes funnel conversion, guarding against divide-by-zero", () => {
    const stages = buildFunnelStages({ registered: 100, started: 40, submitted: 30, accepted: 0, approved: 0 });
    expect(stages[1]).toMatchObject({ conversionFromPrevious: 0.4, conversionFromStart: 0.4 });
    expect(stages[3]).toMatchObject({ count: 0, conversionFromPrevious: 0 });
    expect(stages[4].conversionFromPrevious).toBeNull();
    expect(buildFunnelStages({ registered: 0, started: 0, submitted: 0, accepted: 0, approved: 0 })[1].conversionFromStart).toBeNull();
  });
});

describe("GET /api/admin/analytics/*", () => {
  it("users: acquisition with growth vs the previous period", async () => {
    prisma.$queryRaw.mockResolvedValue([{ period: new Date("2026-09-28T00:00:00Z"), role: "USER", count: 6 }]);
    prisma.user.count.mockResolvedValue(4);
    const res = await request(app).get("/api/admin/analytics/users?from=2026-09-28&to=2026-10-04&interval=week").set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalUsers: 6, growthRate: 0.5, points: [{ period: "2026-09-28", users: 6 }] });
  });

  it("approvals: ranks agents and computes rates", async () => {
    approvalMocks();
    const res = await request(app).get("/api/admin/analytics/approvals?from=2026-09-01&to=2026-09-30").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.overall).toEqual({ approved: 9, rejected: 2, approvalRate: 9 / 11 });
    expect(res.body.agents.map((a: { agentName: string }) => a.agentName)).toEqual(["Alex Agent", "Bea Broker"]);
    expect(res.body.agents[0]).toMatchObject({ handled: 10, approvalRate: 0.75, revenueCents: 120000 });
    expect(res.body.agents[1]).toMatchObject({ isActive: false, approvalRate: 1, revenueCents: 0 });
  });

  it("revenue: per carrier by commission status, excluding VOID", async () => {
    revenueMocks();
    const res = await request(app).get("/api/admin/analytics/revenue").set(auth);
    expect(res.status).toBe(200);
    expect(prisma.commission.groupBy.mock.calls[0][0].where.status).toEqual({ not: "VOID" });
    expect(res.body.totalCents).toBe(15000);
    expect(res.body.carriers[0]).toMatchObject({ carrierName: "Summit Mutual", revenueCents: 9000, paidCents: 9000, policies: 1 });
    expect(res.body.carriers[1]).toMatchObject({ carrierName: "BluePeak Health", pendingCents: 1000, earnedCents: 5000, policies: 3 });
  });

  it("funnel: a registration cohort", async () => {
    prisma.user.count.mockResolvedValueOnce(50).mockResolvedValueOnce(20).mockResolvedValueOnce(15).mockResolvedValueOnce(12).mockResolvedValueOnce(9);
    const res = await request(app).get("/api/admin/analytics/funnel?from=2026-09-01&to=2026-09-30").set(auth);
    expect(res.status).toBe(200);
    expect(res.body.stages.map((s: { count: number }) => s.count)).toEqual([50, 20, 15, 12, 9]);
    expect(prisma.user.count.mock.calls[1][0].where).toMatchObject({ role: "USER", applications: { some: {} } });
  });

  it("validates dates and intervals", async () => {
    expect((await request(app).get("/api/admin/analytics/users?interval=day").set(auth)).status).toBe(400);
    expect((await request(app).get("/api/admin/analytics/funnel?from=2026-02-31").set(auth)).status).toBe(400);
    expect((await request(app).get("/api/admin/analytics/revenue?from=2026-10-02&to=2026-01-01").set(auth)).status).toBe(400);
  });

  it("is admin-only", async () => {
    const agent = { Authorization: `Bearer ${signAccessToken({ sub: "a", role: "AGENT", adminRole: null })}` };
    expect((await request(app).get("/api/admin/analytics/revenue").set(agent)).status).toBe(403);
  });

  it("exports an Excel workbook with one sheet per panel, and audits it", async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    prisma.application.groupBy.mockResolvedValue([]);
    prisma.commission.groupBy.mockResolvedValue([]);
    const res = await request(app)
      .get("/api/admin/analytics/export?from=2026-09-01&to=2026-09-30&interval=month")
      .set(auth)
      .buffer(true)
      .parse(binaryParser as never);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain("analytics-2026-09-01-to-2026-09-30.xlsx");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body as ExcelJS.Buffer);
    expect(book.worksheets.map((w) => w.name)).toEqual(["Summary", "User acquisition", "Agents", "Revenue by carrier", "Funnel"]);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "admin.analytics.export" }) });
  });
});
