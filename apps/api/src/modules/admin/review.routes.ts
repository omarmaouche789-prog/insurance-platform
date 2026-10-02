import { Router } from "express";
import { z } from "zod";
import { ADMIN_QUEUE_SORTS, APPLICATION_STATUSES, APPROVER_ADMIN_ROLES } from "@insurance/shared";
import { requireAdminRole, requireAuth, requireRole } from "../../middleware/auth";
import {
  approveApplication,
  bulkDecide,
  getApplicationForAdmin,
  getApprovalMetrics,
  getDocumentForAdmin,
  listPending,
  listQueue,
  rejectApplication,
} from "./review.service";
import { listNotesForApplication } from "../agent/tooling.service";
import { prisma } from "../../lib/prisma";
import { HttpError } from "../../middleware/errorHandler";

// Any admin can read; only SUPER/OPERATIONS admins can decide.
export const adminApplicationsRouter = Router();
adminApplicationsRouter.use(requireAuth, requireRole("ADMIN"));
const requireApprover = requireAdminRole(...APPROVER_ADMIN_ROLES);

const csv = z.string().transform((s) =>
  s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
);

const notesSchema = z.string().trim().max(2000);
const reasonSchema = z.string().trim().min(1, "A rejection reason is required").max(2000);

adminApplicationsRouter.get("/pending", async (_req, res, next) => {
  try {
    res.status(200).json(await listPending());
  } catch (err) {
    next(err);
  }
});

const queueQuerySchema = z.object({
  status: csv.pipe(z.array(z.enum(APPLICATION_STATUSES))).optional(),
  agentId: z.string().min(1).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(ADMIN_QUEUE_SORTS).default("submittedAt"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

adminApplicationsRouter.get("/queue", async (req, res, next) => {
  try {
    const q = queueQuerySchema.parse(req.query);
    res.status(200).json(await listQueue({ ...q, statuses: q.status, search: q.search || undefined }));
  } catch (err) {
    next(err);
  }
});

const metricsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

adminApplicationsRouter.get("/metrics", async (req, res, next) => {
  try {
    const { days } = metricsQuerySchema.parse(req.query);
    res.status(200).json(await getApprovalMetrics(days));
  } catch (err) {
    next(err);
  }
});

const bulkSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    ids: z
      .array(z.string().min(1))
      .min(1)
      .max(100)
      .transform((ids) => [...new Set(ids)]),
    notes: notesSchema.optional(),
  })
  .refine((b) => b.action === "approve" || Boolean(b.notes), {
    message: "A rejection reason is required",
    path: ["notes"],
  });

adminApplicationsRouter.post("/bulk", requireApprover, async (req, res, next) => {
  try {
    const { action, ids, notes } = bulkSchema.parse(req.body);
    res.status(200).json(await bulkDecide(req.auth!.userId, action, ids, notes || undefined, req));
  } catch (err) {
    next(err);
  }
});

// Parameterized routes last so "/pending", "/queue", etc. aren't read as ids.
adminApplicationsRouter.get("/:id", async (req, res, next) => {
  try {
    res.status(200).json({ application: await getApplicationForAdmin(req.auth!.userId, req.params.id, req) });
  } catch (err) {
    next(err);
  }
});

// The assigned agent's internal notes, read-only for admins.
adminApplicationsRouter.get("/:id/notes", async (req, res, next) => {
  try {
    const exists = await prisma.application.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!exists) throw new HttpError(404, "Application not found");
    res.status(200).json({ notes: await listNotesForApplication(req.params.id) });
  } catch (err) {
    next(err);
  }
});

adminApplicationsRouter.get("/:id/documents/:documentId", async (req, res, next) => {
  try {
    const { document, data } = await getDocumentForAdmin(req.auth!.userId, req.params.id, req.params.documentId, req);
    res
      .status(200)
      .type(document.mimeType)
      .set("X-Content-Type-Options", "nosniff")
      .set("Cache-Control", "no-store")
      .attachment(document.fileName)
      .send(data);
  } catch (err) {
    next(err);
  }
});

adminApplicationsRouter.post("/:id/approve", requireApprover, async (req, res, next) => {
  try {
    const { notes } = z.object({ notes: notesSchema.optional() }).parse(req.body ?? {});
    res.status(200).json({ application: await approveApplication(req.auth!.userId, req.params.id, notes || undefined, req) });
  } catch (err) {
    next(err);
  }
});

adminApplicationsRouter.post("/:id/reject", requireApprover, async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: reasonSchema }).parse(req.body ?? {});
    res.status(200).json({ application: await rejectApplication(req.auth!.userId, req.params.id, reason, req) });
  } catch (err) {
    next(err);
  }
});
