import { Router } from "express";
import { z } from "zod";
import { ANALYTICS_INTERVALS } from "@insurance/shared";
import { requireAuth, requireRole } from "../../middleware/auth";
import { recordAuditEvent } from "../../lib/audit";
import { buildAnalyticsWorkbook } from "./analytics.export";
import {
  getApprovalAnalytics,
  getFunnelAnalytics,
  getRevenueAnalytics,
  getUserAcquisition,
  resolveRange,
} from "./analytics.service";

// Read-only, aggregate (PHI-free) reporting for every admin sub-role.
export const adminAnalyticsRouter = Router();
adminAnalyticsRouter.use(requireAuth, requireRole("ADMIN"));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}, "Not a valid date");

const rangeSchema = z.object({ from: day.optional(), to: day.optional() });
const usersSchema = rangeSchema.extend({ interval: z.enum(ANALYTICS_INTERVALS).default("week") });

const parseRange = (query: unknown) => {
  const { from, to } = rangeSchema.parse(query);
  return resolveRange(from, to);
};

adminAnalyticsRouter.get("/users", async (req, res, next) => {
  try {
    const { from, to, interval } = usersSchema.parse(req.query);
    res.status(200).json(await getUserAcquisition(resolveRange(from, to), interval));
  } catch (err) {
    next(err);
  }
});

adminAnalyticsRouter.get("/approvals", async (req, res, next) => {
  try {
    res.status(200).json(await getApprovalAnalytics(parseRange(req.query)));
  } catch (err) {
    next(err);
  }
});

adminAnalyticsRouter.get("/revenue", async (req, res, next) => {
  try {
    res.status(200).json(await getRevenueAnalytics(parseRange(req.query)));
  } catch (err) {
    next(err);
  }
});

adminAnalyticsRouter.get("/funnel", async (req, res, next) => {
  try {
    res.status(200).json(await getFunnelAnalytics(parseRange(req.query)));
  } catch (err) {
    next(err);
  }
});

adminAnalyticsRouter.get("/export", async (req, res, next) => {
  try {
    const { from, to, interval } = usersSchema.parse(req.query);
    const range = resolveRange(from, to);
    const [users, approvals, revenue, funnel] = await Promise.all([
      getUserAcquisition(range, interval),
      getApprovalAnalytics(range),
      getRevenueAnalytics(range),
      getFunnelAnalytics(range),
    ]);
    const workbook = await buildAnalyticsWorkbook({ users, approvals, revenue, funnel, generatedAt: new Date() });
    await recordAuditEvent({
      actorUserId: req.auth!.userId,
      action: "admin.analytics.export",
      entityType: "Analytics",
      metadata: { from: range.from, to: range.to, interval },
      req,
    });
    res
      .status(200)
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .set("Cache-Control", "no-store")
      .attachment(`analytics-${range.from}-to-${range.to}.xlsx`)
      .send(workbook);
  } catch (err) {
    next(err);
  }
});
