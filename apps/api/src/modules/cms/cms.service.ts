import crypto from "node:crypto";
import type { Request } from "express";
import type { BlogPost, BlogPostStatus, Prisma } from "@prisma/client";
import type {
  BlogPostDisplayStatus,
  BlogPostDTO,
  BlogPostListResponseDTO,
  BlogPostSummaryDTO,
  PublicBlogPostListResponseDTO,
  UpsertBlogPostRequestDTO,
} from "@insurance/shared";
import { blogPostDisplayStatus, slugify } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { HttpError } from "../../middleware/errorHandler";
import { documentStorage } from "../../integrations/documentStorage";
import { htmlToText, readingMinutes, sanitizePostHtml } from "./sanitize";
import { imageExtension, sniffImageMime } from "./images";

type PostWithAuthor = BlogPost & { author: { firstName: string; lastName: string } | null };
const AUTHOR = { author: { select: { firstName: true, lastName: true } } } as const;

const EXCERPT_FALLBACK_CHARS = 200;

export function featuredImageUrl(post: Pick<BlogPost, "id" | "featuredImageKey" | "updatedAt">): string | null {
  // The version param busts caches when the image is replaced.
  return post.featuredImageKey ? `/api/blog/images/${post.id}?v=${post.updatedAt.getTime()}` : null;
}

export function toSummaryDTO(p: PostWithAuthor, now = new Date()): BlogPostSummaryDTO {
  const text = htmlToText(p.content);
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt ?? (text ? text.slice(0, EXCERPT_FALLBACK_CHARS) + (text.length > EXCERPT_FALLBACK_CHARS ? "…" : "") : null),
    status: p.status,
    displayStatus: blogPostDisplayStatus(p.status, p.publishedAt, now),
    publishedAt: p.publishedAt?.toISOString() ?? null,
    author: p.author,
    featuredImageUrl: featuredImageUrl(p),
    featuredImageAlt: p.featuredImageAlt,
    readingMinutes: readingMinutes(p.content),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toPostDTO(p: PostWithAuthor, now = new Date()): BlogPostDTO {
  return { ...toSummaryDTO(p, now), content: p.content, seoTitle: p.seoTitle, seoDescription: p.seoDescription };
}

// Display status → query. SCHEDULED and PUBLISHED share a stored status and
// differ only by whether the date has passed.
export function displayStatusWhere(status: BlogPostDisplayStatus, now: Date): Prisma.BlogPostWhereInput {
  switch (status) {
    case "DRAFT":
      return { status: "DRAFT" };
    case "ARCHIVED":
      return { status: "ARCHIVED" };
    case "SCHEDULED":
      return { status: "PUBLISHED", publishedAt: { gt: now } };
    case "PUBLISHED":
      return { status: "PUBLISHED", publishedAt: { lte: now } };
  }
}

export async function listPosts(f: {
  search?: string;
  status?: BlogPostDisplayStatus;
  page: number;
  pageSize: number;
}): Promise<BlogPostListResponseDTO> {
  const now = new Date();
  const where: Prisma.BlogPostWhereInput = {
    ...(f.status ? displayStatusWhere(f.status, now) : {}),
    ...(f.search
      ? {
          OR: [
            { title: { contains: f.search, mode: "insensitive" } },
            { slug: { contains: f.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, posts, draft, scheduled, published, archived] = await Promise.all([
    prisma.blogPost.count({ where }),
    prisma.blogPost.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      include: AUTHOR,
    }),
    prisma.blogPost.count({ where: displayStatusWhere("DRAFT", now) }),
    prisma.blogPost.count({ where: displayStatusWhere("SCHEDULED", now) }),
    prisma.blogPost.count({ where: displayStatusWhere("PUBLISHED", now) }),
    prisma.blogPost.count({ where: displayStatusWhere("ARCHIVED", now) }),
  ]);
  return {
    total,
    page: f.page,
    pageSize: f.pageSize,
    posts: posts.map((p) => toSummaryDTO(p, now)),
    statusCounts: { DRAFT: draft, SCHEDULED: scheduled, PUBLISHED: published, ARCHIVED: archived },
  };
}

async function findPost(id: string): Promise<PostWithAuthor> {
  const post = await prisma.blogPost.findUnique({ where: { id }, include: AUTHOR });
  if (!post) throw new HttpError(404, "Post not found");
  return post;
}

export async function getPost(id: string): Promise<BlogPostDTO> {
  return toPostDTO(await findPost(id));
}

// Appends -2, -3, … until the slug is free (ignoring the post itself).
async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
  const root = base || "post";
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const clash = await prisma.blogPost.findFirst({
      where: { slug: candidate, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${root}-${crypto.randomUUID().slice(0, 8)}`;
}

function resolvePublishedAt(status: BlogPostStatus, requested: string | null | undefined, existing: Date | null): Date | null {
  if (requested) return new Date(requested);
  // Publishing without a date means "now"; keep the original date on edits.
  if (status === "PUBLISHED") return existing ?? new Date();
  // Drafts can carry a planned date; clearing it is explicit (null).
  return requested === null ? null : existing;
}

function editableFields(input: UpsertBlogPostRequestDTO, existing: BlogPost | null) {
  const content = sanitizePostHtml(input.content);
  if (input.status === "PUBLISHED" && !htmlToText(content)) {
    throw new HttpError(400, "Add some content before publishing");
  }
  return {
    title: input.title,
    excerpt: input.excerpt || null,
    content,
    status: input.status,
    publishedAt: resolvePublishedAt(input.status, input.publishedAt, existing?.publishedAt ?? null),
    featuredImageAlt: input.featuredImageAlt || null,
    seoTitle: input.seoTitle || null,
    seoDescription: input.seoDescription || null,
  };
}

export async function createPost(authorId: string, input: UpsertBlogPostRequestDTO, req: Request): Promise<BlogPostDTO> {
  const slug = await uniqueSlug(slugify(input.slug || input.title));
  const post = await prisma.blogPost.create({
    data: { ...editableFields(input, null), slug, authorId },
    include: AUTHOR,
  });
  await recordAuditEvent({
    actorUserId: authorId,
    action: "admin.cms.post.create",
    entityType: "BlogPost",
    entityId: post.id,
    metadata: { status: post.status, slug },
    req,
  });
  return toPostDTO(post);
}

export async function updatePost(actorUserId: string, id: string, input: UpsertBlogPostRequestDTO, req: Request): Promise<BlogPostDTO> {
  const existing = await findPost(id);
  const requestedSlug = input.slug ? slugify(input.slug) : existing.slug;
  const slug = requestedSlug === existing.slug ? existing.slug : await uniqueSlug(requestedSlug, id);
  const post = await prisma.blogPost.update({
    where: { id },
    data: { ...editableFields(input, existing), slug },
    include: AUTHOR,
  });
  await recordAuditEvent({
    actorUserId,
    action: "admin.cms.post.update",
    entityType: "BlogPost",
    entityId: id,
    metadata: { status: post.status, previousStatus: existing.status, slug },
    req,
  });
  return toPostDTO(post);
}

export async function deletePost(actorUserId: string, id: string, req: Request): Promise<void> {
  const post = await findPost(id);
  await prisma.blogPost.delete({ where: { id } });
  if (post.featuredImageKey) await documentStorage.delete(post.featuredImageKey).catch(() => undefined);
  await recordAuditEvent({ actorUserId, action: "admin.cms.post.delete", entityType: "BlogPost", entityId: id, metadata: { slug: post.slug }, req });
}

export async function setFeaturedImage(
  actorUserId: string,
  id: string,
  file: { buffer: Buffer; size: number },
  req: Request,
): Promise<BlogPostDTO> {
  const post = await findPost(id);
  const mime = sniffImageMime(file.buffer);
  if (!mime) throw new HttpError(400, "Image must be a JPEG, PNG, WebP or GIF");

  const key = `cms/${id}/${crypto.randomUUID()}.${imageExtension(mime)}`;
  await documentStorage.put(key, file.buffer, mime);
  const updated = await prisma.blogPost.update({
    where: { id },
    data: { featuredImageKey: key, featuredImageMime: mime },
    include: AUTHOR,
  });
  // Remove the replaced file only after the row points at the new one.
  if (post.featuredImageKey) await documentStorage.delete(post.featuredImageKey).catch(() => undefined);
  await recordAuditEvent({
    actorUserId,
    action: "admin.cms.post.image",
    entityType: "BlogPost",
    entityId: id,
    metadata: { mime, sizeBytes: file.size },
    req,
  });
  return toPostDTO(updated);
}

export async function removeFeaturedImage(actorUserId: string, id: string, req: Request): Promise<BlogPostDTO> {
  const post = await findPost(id);
  if (!post.featuredImageKey) throw new HttpError(409, "This post has no featured image");
  const updated = await prisma.blogPost.update({
    where: { id },
    data: { featuredImageKey: null, featuredImageMime: null },
    include: AUTHOR,
  });
  await documentStorage.delete(post.featuredImageKey).catch(() => undefined);
  await recordAuditEvent({ actorUserId, action: "admin.cms.post.image_remove", entityType: "BlogPost", entityId: id, req });
  return toPostDTO(updated);
}

// ─── Public blog ─────────────────────────────────────────────────────────────

const LIVE = (now: Date): Prisma.BlogPostWhereInput => ({ status: "PUBLISHED", publishedAt: { lte: now } });

export async function listPublishedPosts(page: number, pageSize: number): Promise<PublicBlogPostListResponseDTO> {
  const now = new Date();
  const [total, posts] = await Promise.all([
    prisma.blogPost.count({ where: LIVE(now) }),
    prisma.blogPost.findMany({
      where: LIVE(now),
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: AUTHOR,
    }),
  ]);
  return { total, page, pageSize, posts: posts.map((p) => toSummaryDTO(p, now)) };
}

export async function getPublishedPost(slug: string): Promise<BlogPostDTO> {
  const now = new Date();
  const post = await prisma.blogPost.findFirst({ where: { slug, ...LIVE(now) }, include: AUTHOR });
  if (!post) throw new HttpError(404, "Post not found");
  return toPostDTO(post, now);
}

// Featured images are public assets. A draft's image is reachable only by
// its post's random UUID, which is fine for the editor preview.
export async function getFeaturedImage(id: string): Promise<{ data: Buffer; mime: string }> {
  const post = await prisma.blogPost.findUnique({ where: { id }, select: { featuredImageKey: true, featuredImageMime: true } });
  if (!post?.featuredImageKey || !post.featuredImageMime) throw new HttpError(404, "Image not found");
  return { data: await documentStorage.get(post.featuredImageKey), mime: post.featuredImageMime };
}
