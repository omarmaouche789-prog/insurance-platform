import type { AdminRole } from "./roles";

export const CMS_EDITOR_ADMIN_ROLES = ["SUPER", "OPERATIONS"] as const satisfies readonly AdminRole[];

export function canEditCms(adminRole: AdminRole | null): boolean {
  return adminRole !== null && (CMS_EDITOR_ADMIN_ROLES as readonly AdminRole[]).includes(adminRole);
}

export const BLOG_POST_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type BlogPostStatus = (typeof BLOG_POST_STATUSES)[number];

// What editors see: a PUBLISHED post with a future date is SCHEDULED.
export const BLOG_POST_DISPLAY_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
export type BlogPostDisplayStatus = (typeof BLOG_POST_DISPLAY_STATUSES)[number];

export const SEO_TITLE_MAX = 70;
export const SEO_DESCRIPTION_MAX = 160;
export const BLOG_TITLE_MAX = 200;
export const BLOG_EXCERPT_MAX = 500;
export const BLOG_CONTENT_MAX = 200_000;
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function blogPostDisplayStatus(
  status: BlogPostStatus,
  publishedAt: string | Date | null,
  now: Date = new Date(),
): BlogPostDisplayStatus {
  if (status === "PUBLISHED" && publishedAt && new Date(publishedAt) > now) return "SCHEDULED";
  return status;
}

// "Hello, World!" → "hello-world". Non-ASCII letters are folded where
// possible (é → e) and anything else is dropped.
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export interface BlogPostSummaryDTO {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  status: BlogPostStatus;
  displayStatus: BlogPostDisplayStatus;
  publishedAt: string | null;
  author: { firstName: string; lastName: string } | null;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  readingMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface BlogPostDTO extends BlogPostSummaryDTO {
  content: string; // sanitized HTML
  seoTitle: string | null;
  seoDescription: string | null;
}

export interface BlogPostListResponseDTO {
  total: number;
  page: number;
  pageSize: number;
  posts: BlogPostSummaryDTO[];
  statusCounts: Record<BlogPostDisplayStatus, number>;
}

export interface PublicBlogPostListResponseDTO {
  total: number;
  page: number;
  pageSize: number;
  posts: BlogPostSummaryDTO[];
}

export interface UpsertBlogPostRequestDTO {
  title: string;
  slug?: string;
  excerpt?: string | null;
  content: string;
  status: BlogPostStatus;
  // ISO timestamp. A future date with status PUBLISHED schedules the post.
  publishedAt?: string | null;
  featuredImageAlt?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}
