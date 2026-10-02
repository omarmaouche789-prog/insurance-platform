import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeDbMock } from "./fixtures";

const db = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeDbMock> }));
vi.mock("../src/lib/prisma", async () => {
  const { makeDbMock: make } = await import("./fixtures");
  db.current = make();
  return { prisma: db.current };
});
const storage = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock("../src/integrations/documentStorage", () => ({ documentStorage: storage }));

import { createApp } from "../src/app";
import { signAccessToken } from "../src/lib/jwt";
import { displayStatusWhere } from "../src/modules/cms/cms.service";

const app = createApp();
const as = (adminRole: string) => ({
  Authorization: `Bearer ${signAccessToken({ sub: "admin-1", role: "ADMIN", adminRole: adminRole as "SUPER" })}`,
});
const EDITOR = as("OPERATIONS");
const READER = as("FINANCE");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let prisma: ReturnType<typeof makeDbMock>;

const post = (overrides: Record<string, unknown> = {}) => ({
  id: "post-1",
  title: "Open enrollment 101",
  slug: "open-enrollment-101",
  excerpt: null,
  content: "<p>Everything you need to know about open enrollment.</p>",
  status: "DRAFT",
  publishedAt: null,
  authorId: "admin-1",
  author: { firstName: "Ada", lastName: "Admin" },
  featuredImageKey: null,
  featuredImageMime: null,
  featuredImageAlt: null,
  seoTitle: null,
  seoDescription: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  updatedAt: new Date("2026-09-02T00:00:00Z"),
  ...overrides,
});

const echoCreate = () =>
  prisma.blogPost.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => post({ ...data }));
const echoUpdate = (base = post()) =>
  prisma.blogPost.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => post({ ...base, ...data }));

beforeEach(() => {
  vi.resetAllMocks();
  prisma = db.current;
  prisma.blogPost.findFirst.mockResolvedValue(null);
  storage.delete.mockResolvedValue(undefined);
});

describe("POST /api/admin/cms/posts", () => {
  it("creates a draft with a slug from the title, sanitizing the HTML", async () => {
    echoCreate();
    const res = await request(app)
      .post("/api/admin/cms/posts")
      .set(EDITOR)
      .send({
        title: "Open Enrollment 101!",
        status: "DRAFT",
        content: '<h1>Hi</h1><p onclick="x()">Body <a href="javascript:alert(1)">bad</a> <a href="https://cms.gov">good</a></p><script>alert(1)</script><img src="data:image/png;base64,AAAA">',
      });

    expect(res.status).toBe(201);
    const data = prisma.blogPost.create.mock.calls[0][0].data;
    expect(data.slug).toBe("open-enrollment-101");
    expect(data.authorId).toBe("admin-1");
    expect(data.content).not.toMatch(/script|onclick|javascript:|data:image/);
    expect(data.content).toContain("<h2>Hi</h2>");
    expect(data.content).toContain('<a href="https://cms.gov" target="_blank" rel="noopener noreferrer nofollow">good</a>');
    expect(res.body.post).toMatchObject({ displayStatus: "DRAFT", readingMinutes: 1 });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "admin.cms.post.create" }) });
  });

  it("de-duplicates slugs", async () => {
    prisma.blogPost.findFirst.mockResolvedValueOnce({ id: "other" }).mockResolvedValueOnce({ id: "other2" }).mockResolvedValue(null);
    echoCreate();
    await request(app).post("/api/admin/cms/posts").set(EDITOR).send({ title: "Same title", status: "DRAFT", content: "" });
    expect(prisma.blogPost.create.mock.calls[0][0].data.slug).toBe("same-title-3");
  });

  it("publishing without a date publishes now; a future date schedules", async () => {
    echoCreate();
    const now = await request(app).post("/api/admin/cms/posts").set(EDITOR).send({ title: "Now", status: "PUBLISHED", content: "<p>Live</p>" });
    expect(now.body.post.displayStatus).toBe("PUBLISHED");
    expect(new Date(now.body.post.publishedAt).getTime()).toBeLessThanOrEqual(Date.now());

    const later = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const scheduled = await request(app)
      .post("/api/admin/cms/posts")
      .set(EDITOR)
      .send({ title: "Later", status: "PUBLISHED", content: "<p>Soon</p>", publishedAt: later });
    expect(scheduled.body.post).toMatchObject({ displayStatus: "SCHEDULED", publishedAt: later });
  });

  it("won't publish an empty post", async () => {
    const res = await request(app).post("/api/admin/cms/posts").set(EDITOR).send({ title: "Empty", status: "PUBLISHED", content: "<p> </p>" });
    expect(res.status).toBe(400);
  });

  it("validates SEO lengths and slug characters", async () => {
    const res = await request(app)
      .post("/api/admin/cms/posts")
      .set(EDITOR)
      .send({ title: "T", status: "DRAFT", content: "", seoDescription: "x".repeat(161), slug: "bad slug!" });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details.fieldErrors)).toEqual(expect.arrayContaining(["seoDescription", "slug"]));
  });

  it("is limited to SUPER/OPERATIONS", async () => {
    expect((await request(app).post("/api/admin/cms/posts").set(READER).send({ title: "T", status: "DRAFT", content: "" })).status).toBe(403);
  });
});

describe("PUT /api/admin/cms/posts/:id", () => {
  it("keeps the original publish date when re-saving a published post", async () => {
    const publishedAt = new Date("2026-09-10T12:00:00Z");
    prisma.blogPost.findUnique.mockResolvedValue(post({ status: "PUBLISHED", publishedAt }));
    echoUpdate(post({ status: "PUBLISHED", publishedAt }));
    const res = await request(app)
      .put("/api/admin/cms/posts/post-1")
      .set(EDITOR)
      .send({ title: "Updated", status: "PUBLISHED", content: "<p>New</p>", seoTitle: "Open enrollment guide" });
    expect(res.status).toBe(200);
    expect(prisma.blogPost.update.mock.calls[0][0].data).toMatchObject({ publishedAt, slug: "open-enrollment-101", seoTitle: "Open enrollment guide" });
  });

  it("404s on unknown posts", async () => {
    prisma.blogPost.findUnique.mockResolvedValue(null);
    expect((await request(app).put("/api/admin/cms/posts/nope").set(EDITOR).send({ title: "T", status: "DRAFT", content: "" })).status).toBe(404);
  });
});

describe("listing and reading", () => {
  it("lists with display-status counts and filters SCHEDULED correctly", async () => {
    prisma.blogPost.count.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    prisma.blogPost.findMany.mockResolvedValue([post()]);
    const res = await request(app).get("/api/admin/cms/posts?status=SCHEDULED&search=enroll").set(READER);
    expect(res.status).toBe(200);
    expect(res.body.statusCounts).toEqual({ DRAFT: 2, SCHEDULED: 1, PUBLISHED: 3, ARCHIVED: 0 });
    expect(prisma.blogPost.findMany.mock.calls[0][0].where).toMatchObject({ status: "PUBLISHED", publishedAt: { gt: expect.any(Date) } });
    expect(res.body.posts[0].excerpt).toBe("Everything you need to know about open enrollment.");
  });

  it("maps display statuses", () => {
    const now = new Date();
    expect(displayStatusWhere("PUBLISHED", now)).toEqual({ status: "PUBLISHED", publishedAt: { lte: now } });
    expect(displayStatusWhere("DRAFT", now)).toEqual({ status: "DRAFT" });
  });

  it("gets one post for the editor/preview", async () => {
    prisma.blogPost.findUnique.mockResolvedValue(post());
    const res = await request(app).get("/api/admin/cms/posts/post-1").set(READER);
    expect(res.body.post.content).toContain("open enrollment");
  });

  it("deletes a post and its image", async () => {
    prisma.blogPost.findUnique.mockResolvedValue(post({ featuredImageKey: "cms/post-1/a.png" }));
    expect((await request(app).delete("/api/admin/cms/posts/post-1").set(EDITOR)).status).toBe(204);
    expect(storage.delete).toHaveBeenCalledWith("cms/post-1/a.png");
  });
});

describe("featured image", () => {
  it("accepts a PNG by magic bytes and replaces the old file", async () => {
    prisma.blogPost.findUnique.mockResolvedValue(post({ featuredImageKey: "cms/post-1/old.jpg" }));
    echoUpdate();
    const res = await request(app).post("/api/admin/cms/posts/post-1/image").set(EDITOR).attach("file", PNG, "hero.png");
    expect(res.status).toBe(200);
    expect(storage.put.mock.calls[0][0]).toMatch(/^cms\/post-1\/[0-9a-f-]+\.png$/);
    expect(storage.put.mock.calls[0][2]).toBe("image/png");
    expect(storage.delete).toHaveBeenCalledWith("cms/post-1/old.jpg");
    expect(res.body.post.featuredImageUrl).toMatch(/^\/api\/blog\/images\/post-1\?v=/);
  });

  it("rejects non-images", async () => {
    prisma.blogPost.findUnique.mockResolvedValue(post());
    const res = await request(app).post("/api/admin/cms/posts/post-1/image").set(EDITOR).attach("file", Buffer.from("%PDF-1.4"), "x.png");
    expect(res.status).toBe(400);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("removes the image", async () => {
    prisma.blogPost.findUnique.mockResolvedValue(post({ featuredImageKey: "cms/post-1/a.png" }));
    echoUpdate();
    expect((await request(app).delete("/api/admin/cms/posts/post-1/image").set(EDITOR)).status).toBe(200);
    prisma.blogPost.findUnique.mockResolvedValue(post());
    expect((await request(app).delete("/api/admin/cms/posts/post-1/image").set(EDITOR)).status).toBe(409);
  });
});

describe("public blog", () => {
  it("only lists live posts", async () => {
    prisma.blogPost.count.mockResolvedValue(1);
    prisma.blogPost.findMany.mockResolvedValue([post({ status: "PUBLISHED", publishedAt: new Date("2026-09-01T00:00:00Z") })]);
    const res = await request(app).get("/api/blog/posts");
    expect(res.status).toBe(200);
    expect(prisma.blogPost.findMany.mock.calls[0][0].where).toEqual({ status: "PUBLISHED", publishedAt: { lte: expect.any(Date) } });
    expect(res.headers["cache-control"]).toContain("public");
  });

  it("404s on drafts and scheduled posts by slug", async () => {
    prisma.blogPost.findFirst.mockResolvedValue(null);
    expect((await request(app).get("/api/blog/posts/secret-draft")).status).toBe(404);
  });

  it("serves featured images with a sniffed type", async () => {
    prisma.blogPost.findUnique.mockResolvedValue({ featuredImageKey: "cms/post-1/a.png", featuredImageMime: "image/png" });
    storage.get.mockResolvedValue(PNG);
    const res = await request(app).get("/api/blog/images/post-1");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
