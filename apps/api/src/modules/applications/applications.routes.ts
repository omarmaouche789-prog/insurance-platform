import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { MAX_DOCUMENT_BYTES } from "@insurance/shared";
import { requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import {
  createApplication,
  getApplication,
  listApplications,
  submitApplication,
  updateApplication,
  uploadDocument,
} from "./applications.service";
import { createApplicationSchema, documentTypeSchema, updateApplicationSchema } from "./applications.validation";

// Applicant-facing endpoints. Agent/admin views of applications live in their
// own routers (Phases 4-5) with different visibility rules.
export const applicationsRouter = Router();
applicationsRouter.use(requireAuth, requireRole("USER"));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 0 },
});

// Wraps multer so its errors (file too large, unexpected field) become 400s
// through the normal error handler instead of 500s.
function singleFile(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE" ? `File must be ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB or smaller` : err.message;
      next(new HttpError(400, message));
      return;
    }
    next(err);
  });
}

applicationsRouter.get("/", async (req, res, next) => {
  try {
    res.status(200).json({ applications: await listApplications(req.auth!.userId) });
  } catch (err) {
    next(err);
  }
});

applicationsRouter.post("/", async (req, res, next) => {
  try {
    const input = createApplicationSchema.parse(req.body);
    res.status(201).json({ application: await createApplication(req.auth!.userId, input, req) });
  } catch (err) {
    next(err);
  }
});

applicationsRouter.get("/:id", async (req, res, next) => {
  try {
    res.status(200).json({ application: await getApplication(req.auth!.userId, req.params.id) });
  } catch (err) {
    next(err);
  }
});

applicationsRouter.put("/:id", async (req, res, next) => {
  try {
    const input = updateApplicationSchema.parse(req.body);
    res.status(200).json({ application: await updateApplication(req.auth!.userId, req.params.id, input, req) });
  } catch (err) {
    next(err);
  }
});

applicationsRouter.post("/:id/documents/:type", singleFile, async (req, res, next) => {
  try {
    const type = documentTypeSchema.parse(req.params.type);
    if (!req.file) throw new HttpError(400, "Attach the document as a 'file' form field");
    const application = await uploadDocument(req.auth!.userId, req.params.id, type, req.file, req);
    res.status(200).json({ application });
  } catch (err) {
    next(err);
  }
});

applicationsRouter.post("/:id/submit", async (req, res, next) => {
  try {
    res.status(200).json({ application: await submitApplication(req.auth!.userId, req.params.id, req) });
  } catch (err) {
    next(err);
  }
});
