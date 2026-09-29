import { Router } from "express";
import { z } from "zod";
import { APPLICATION_STATUSES, SUBMISSION_STATUSES } from "@insurance/shared";
import { requireAuth, requireRole } from "../../middleware/auth";
import { requestDocumentsSchema } from "../applications/applications.validation";
import {
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
