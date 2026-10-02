import { Router } from "express";
import { z } from "zod";
import { APPLICATION_STATUSES, FOLLOW_UP_FILTERS, SUBMISSION_STATUSES } from "@insurance/shared";
import { requireAuth, requireRole } from "../../middleware/auth";
import { requestDocumentsSchema } from "../applications/applications.validation";
import {
  addNote,
  completeFollowUp,
  deleteFollowUp,
  getOwnPerformance,
  listApplicationFollowUps,
  listFollowUps,
  listNotes,
  scheduleFollowUp,
} from "./tooling.service";
import {
  closeDocumentRequest,
  getApplicationPdf,
  getAssignedApplication,
  getAssignedDocument,
  getCommissions,
  listAssignedApplications,
  requestDocuments,
  resubmitApplication,
} from "./agent.service";

export const agentRouter = Router();
agentRouter.use(requireAuth, requireRole("AGENT"));

const csv = z.string().transform((s) =>
  s
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
);

const listQuerySchema = z.object({
  status: csv.pipe(z.array(z.enum(APPLICATION_STATUSES))).optional(),
  submissionStatus: csv.pipe(z.array(z.enum(SUBMISSION_STATUSES))).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

agentRouter.get("/applications", async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    res.status(200).json(
      await listAssignedApplications(req.auth!.userId, {
        statuses: q.status,
        submissionStatuses: q.submissionStatus,
        search: q.search || undefined,
        page: q.page,
        pageSize: q.pageSize,
      }),
    );
  } catch (err) {
    next(err);
  }
});

agentRouter.get("/applications/:id", async (req, res, next) => {
  try {
    res.status(200).json({ application: await getAssignedApplication(req.auth!.userId, req.params.id, req) });
  } catch (err) {
    next(err);
  }
});

agentRouter.post("/applications/:id/request-documents", async (req, res, next) => {
  try {
    const input = requestDocumentsSchema.parse(req.body);
    res.status(201).json({ application: await requestDocuments(req.auth!.userId, req.params.id, input, req) });
  } catch (err) {
    next(err);
  }
});

agentRouter.post("/applications/:id/resubmit", async (req, res, next) => {
  try {
    res.status(200).json({ application: await resubmitApplication(req.auth!.userId, req.params.id, req) });
  } catch (err) {
    next(err);
  }
});

agentRouter.get("/applications/:id/documents/:documentId", async (req, res, next) => {
  try {
    const { document, data } = await getAssignedDocument(req.auth!.userId, req.params.id, req.params.documentId, req);
    // Always a download, never rendered inline, and the type is the one we
    // sniffed at upload — not whatever the uploader claimed.
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

agentRouter.get("/applications/:id/pdf", async (req, res, next) => {
  try {
    const pdf = await getApplicationPdf(req.auth!.userId, req.params.id, req);
    res
      .status(200)
      .type("application/pdf")
      .set("Cache-Control", "no-store")
      .attachment(`application-${req.params.id}.pdf`)
      .send(pdf);
  } catch (err) {
    next(err);
  }
});

const commissionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

agentRouter.get("/commission", async (req, res, next) => {
  try {
    const { page, pageSize } = commissionQuerySchema.parse(req.query);
    res.status(200).json(await getCommissions(req.auth!.userId, page, pageSize));
  } catch (err) {
    next(err);
  }
});

agentRouter.post("/applications/:id/document-requests/:requestId/complete", async (req, res, next) => {
  try {
    const application = await closeDocumentRequest(req.auth!.userId, req.params.id, req.params.requestId, "COMPLETED", req);
    res.status(200).json({ application });
  } catch (err) {
    next(err);
  }
});

agentRouter.post("/applications/:id/document-requests/:requestId/cancel", async (req, res, next) => {
  try {
    const application = await closeDocumentRequest(req.auth!.userId, req.params.id, req.params.requestId, "CANCELLED", req);
    res.status(200).json({ application });
  } catch (err) {
    next(err);
  }
});

// ─── Follow-ups ──────────────────────────────────────────────────────────────

const MAX_FOLLOW_UP_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
// A little slack so a time picked "right now" isn't refused by clock skew.
const PAST_SLACK_MS = 60 * 1000;

export const scheduleFollowUpSchema = z.object({
  dueAt: z
    .string()
    .datetime({ offset: true, message: "Pick a valid date and time" })
    .refine((v) => new Date(v).getTime() > Date.now() - PAST_SLACK_MS, "Follow-up time must be in the future")
    .refine((v) => new Date(v).getTime() < Date.now() + MAX_FOLLOW_UP_AHEAD_MS, "Follow-up must be within a year"),
  note: z.string().trim().min(1, "Add a short note about the follow-up").max(1000),
});

agentRouter.post("/applications/:id/schedule-followup", async (req, res, next) => {
  try {
    const input = scheduleFollowUpSchema.parse(req.body);
    res.status(201).json({ followUp: await scheduleFollowUp(req.auth!.userId, req.params.id, input, req) });
  } catch (err) {
    next(err);
  }
});

agentRouter.get("/applications/:id/follow-ups", async (req, res, next) => {
  try {
    res.status(200).json({ followUps: await listApplicationFollowUps(req.auth!.userId, req.params.id) });
  } catch (err) {
    next(err);
  }
});

agentRouter.get("/follow-ups", async (req, res, next) => {
  try {
    const { filter } = z.object({ filter: z.enum(FOLLOW_UP_FILTERS).default("upcoming") }).parse(req.query);
    res.status(200).json(await listFollowUps(req.auth!.userId, filter));
  } catch (err) {
    next(err);
  }
});

agentRouter.post("/follow-ups/:followUpId/complete", async (req, res, next) => {
  try {
    res.status(200).json({ followUp: await completeFollowUp(req.auth!.userId, req.params.followUpId, req) });
  } catch (err) {
    next(err);
  }
});

agentRouter.delete("/follow-ups/:followUpId", async (req, res, next) => {
  try {
    await deleteFollowUp(req.auth!.userId, req.params.followUpId, req);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─── Internal notes ──────────────────────────────────────────────────────────

const noteSchema = z.object({ body: z.string().trim().min(1, "Note can't be empty").max(5000) });

agentRouter.get("/applications/:id/notes", async (req, res, next) => {
  try {
    res.status(200).json({ notes: await listNotes(req.auth!.userId, req.params.id) });
  } catch (err) {
    next(err);
  }
});

agentRouter.post("/applications/:id/notes", async (req, res, next) => {
  try {
    const { body } = noteSchema.parse(req.body);
    res.status(201).json({ note: await addNote(req.auth!.userId, req.params.id, body, req) });
  } catch (err) {
    next(err);
  }
});

// ─── Performance ─────────────────────────────────────────────────────────────

agentRouter.get("/performance", async (req, res, next) => {
  try {
    res.status(200).json(await getOwnPerformance(req.auth!.userId));
  } catch (err) {
    next(err);
  }
});
