import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import {
  BLOG_CONTENT_MAX,
  BLOG_EXCERPT_MAX,
  BLOG_POST_DISPLAY_STATUSES,
  BLOG_POST_STATUSES,
  BLOG_TITLE_MAX,
  CMS_EDITOR_ADMIN_ROLES,
  MAX_IMAGE_BYTES,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
} from "@insurance/shared";
import { requireAdminRole, requireAuth, requireRole } from "../../middleware/auth";
import { HttpError } from "../../middleware/errorHandler";
import {
  createPost,
  deletePost,
  getFeaturedImage,
  getPost,
  getPublishedPost,
  listPosts,
  listPublishedPosts,
  removeFeaturedImage,
  setFeaturedImage,
  updatePost,
} from "./cms.service";

// ─── Admin CMS: /api/admin/cms ───────────────────────────────────────────────
export const adminCmsRouter = Router();
adminCmsRouter.use(requireAuth, requireRole("ADMIN"));
const requireEditor = requireAdminRole(...CMS_EDITOR_ADMIN_ROLES);

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} can be at most ${max} characters`).nullable().optional();

export const upsertPostSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(BLOG_TITLE_MAX),
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]*$/i, "Slug can only contain letters, numbers and dashes")
    .optional(),
  excerpt: optionalText(BLOG_EXCERPT_MAX, "Excerpt"),
  content: z.string().max(BLOG_CONTENT_MAX, "Post is too long"),
  status: z.enum(BLOG_POST_STATUSES),
  publishedAt: z.string().datetime({ offset: true, message: "Pick a valid publish date" }).nullable().optional(),
  featuredImageAlt: optionalText(200, "Image alt text"),
  seoTitle: optionalText(SEO_TITLE_MAX, "SEO title"),
  seoDescription: optionalText(SEO_DESCRIPTION_MAX, "SEO description"),
});

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(BLOG_POST_DISPLAY_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

adminCmsRouter.get("/posts", async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    res.status(200).json(await listPosts({ ...q, search: q.search || undefined }));
  } catch (err) {
    next(err);
  }
});

adminCmsRouter.post("/posts", requireEditor, async (req, res, next) => {
  try {
    const input = upsertPostSchema.parse(req.body);
    res.status(201).json({ post: await createPost(req.auth!.userId, input, req) });
  } catch (err) {
    next(err);
  }
});

adminCmsRouter.get("/posts/:id", async (req, res, next) => {
  try {
    res.status(200).json({ post: await getPost(req.params.id) });
  } catch (err) {
    next(err);
  }
});

adminCmsRouter.put("/posts/:id", requireEditor, async (req, res, next) => {
  try {
    const input = upsertPostSchema.parse(req.body);
    res.status(200).json({ post: await updatePost(req.auth!.userId, req.params.id, input, req) });
  } catch (err) {
    next(err);
  }
});

adminCmsRouter.delete("/posts/:id", requireEditor, async (req, res, next) => {
  try {
    await deletePost(req.auth!.userId, req.params.id, req);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 } });

function singleImage(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      next(new HttpError(400, err.code === "LIMIT_FILE_SIZE" ? `Image must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller` : err.message));
      return;
    }
    next(err);
  });
}

adminCmsRouter.post("/posts/:id/image", requireEditor, singleImage, async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, "Attach the image as a 'file' form field");
    res.status(200).json({ post: await setFeaturedImage(req.auth!.userId, req.params.id, req.file, req) });
  } catch (err) {
    next(err);
  }
});

adminCmsRouter.delete("/posts/:id/image", requireEditor, async (req, res, next) => {
  try {
    res.status(200).json({ post: await removeFeaturedImage(req.auth!.userId, req.params.id, req) });
  } catch (err) {
    next(err);
  }
});

// ─── Public blog: /api/blog ──────────────────────────────────────────────────
export const blogRouter = Router();

const publicListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(9),
});

blogRouter.get("/posts", async (req, res, next) => {
  try {
    const { page, pageSize } = publicListSchema.parse(req.query);
    res.set("Cache-Control", "public, max-age=60");
    res.status(200).json(await listPublishedPosts(page, pageSize));
  } catch (err) {
    next(err);
  }
});

blogRouter.get("/posts/:slug", async (req, res, next) => {
  try {
    const slug = z.string().max(100).parse(req.params.slug);
    res.set("Cache-Control", "public, max-age=60");
    res.status(200).json({ post: await getPublishedPost(slug) });
  } catch (err) {
    next(err);
  }
});

blogRouter.get("/images/:id", async (req, res, next) => {
  try {
    const { data, mime } = await getFeaturedImage(req.params.id);
    res
      .status(200)
      .type(mime)
      .set("X-Content-Type-Options", "nosniff")
      .set("Cache-Control", "public, max-age=86400")
      .send(data);
  } catch (err) {
    next(err);
  }
});
