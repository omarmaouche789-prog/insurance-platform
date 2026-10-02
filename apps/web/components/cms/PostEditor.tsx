"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, CalendarClock, Eye, ImagePlus, Rocket, Save, Trash2, Undo2, X } from "lucide-react";
import type { BlogPostDTO, BlogPostStatus, UpsertBlogPostRequestDTO } from "@insurance/shared";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  BLOG_EXCERPT_MAX,
  blogPostDisplayStatus,
  canEditCms,
  MAX_IMAGE_BYTES,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
  slugify,
} from "@insurance/shared";
import { ApiError, apiFetch, describeApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { formatDateTime } from "../../lib/format";
import { Button } from "../ui/Button";
import { Card, CardBody, CardHeader } from "../ui/Card";
import { CharCount, Checkbox, Field, Input, Textarea } from "../ui/Field";
import { ConfirmDialog } from "../ui/Modal";
import { Alert } from "../ui/States";
import { useToast } from "../ui/Toast";
import { PostStatusBadge } from "./PostStatusBadge";
import { RichTextEditor } from "./RichTextEditor";

interface Draft {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  featuredImageAlt: string;
  seoTitle: string;
  seoDescription: string;
  schedule: boolean;
  // <input type="datetime-local"> value, in the editor's local time.
  publishAt: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function draftFrom(post: BlogPostDTO | null): Draft {
  const future = post?.publishedAt && new Date(post.publishedAt) > new Date();
  return {
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    excerpt: post?.excerpt ?? "",
    content: post?.content ?? "",
    featuredImageAlt: post?.featuredImageAlt ?? "",
    seoTitle: post?.seoTitle ?? "",
    seoDescription: post?.seoDescription ?? "",
    schedule: Boolean(future),
    publishAt: future ? toLocalInput(post!.publishedAt) : "",
  };
}

export function PostEditor({ initial }: { initial: BlogPostDTO | null }) {
  const { user, accessToken } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const canEdit = canEditCms(user?.adminRole ?? null);

  const [post, setPost] = useState<BlogPostDTO | null>(initial);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(draftFrom(initial)));
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = JSON.stringify(draft) !== savedSnapshot;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const effectiveSlug = slugTouched ? draft.slug : slugify(draft.title);
  const publishAtIso = draft.schedule && draft.publishAt ? new Date(draft.publishAt).toISOString() : null;
  const scheduleInPast = Boolean(publishAtIso && new Date(publishAtIso) <= new Date());
  const displayStatus = post ? blogPostDisplayStatus(post.status, post.publishedAt) : "DRAFT";

  // Publishing: a scheduled date wins; an already-live post keeps its
  // original date; otherwise (including un-scheduling) it goes live now.
  function publishDateFor(): string {
    if (publishAtIso) return publishAtIso;
    const live = post?.status === "PUBLISHED" && post.publishedAt && new Date(post.publishedAt) <= new Date();
    return live ? post.publishedAt! : new Date().toISOString();
  }

  // Saves with the given status and returns the saved post (null on failure).
  async function save(status: BlogPostStatus, label: string, opts: { quiet?: boolean; stay?: boolean } = {}): Promise<BlogPostDTO | null> {
    if (!accessToken) return null;
    if (!draft.title.trim()) {
      setFieldErrors({ title: "Give your post a title" });
      return null;
    }
    setBusy(label);
    setError(null);
    setFieldErrors({});
    const body: UpsertBlogPostRequestDTO = {
      title: draft.title.trim(),
      slug: effectiveSlug || undefined,
      excerpt: draft.excerpt.trim() || null,
      content: draft.content,
      status,
      publishedAt: status === "PUBLISHED" ? publishDateFor() : publishAtIso,
      featuredImageAlt: draft.featuredImageAlt.trim() || null,
      seoTitle: draft.seoTitle.trim() || null,
      seoDescription: draft.seoDescription.trim() || null,
    };
    try {
      const res = await apiFetch<{ post: BlogPostDTO }>(post ? `/api/admin/cms/posts/${post.id}` : "/api/admin/cms/posts", {
        method: post ? "PUT" : "POST",
        body: JSON.stringify(body),
        accessToken,
      });
      const next = draftFrom(res.post);
      // Keep the editor's own HTML so the cursor doesn't jump on re-render.
      next.content = draft.content;
      setPost(res.post);
      setDraft(next);
      setSavedSnapshot(JSON.stringify(next));
      setSlugTouched(true);
      if (!opts.quiet) {
        const shown = blogPostDisplayStatus(res.post.status, res.post.publishedAt);
        toast.success(
          shown === "SCHEDULED" ? "Post scheduled" : shown === "PUBLISHED" ? "Post published" : shown === "ARCHIVED" ? "Post archived" : "Draft saved",
          shown === "SCHEDULED" ? `Goes live ${formatDateTime(res.post.publishedAt)}.` : undefined,
        );
      }
      // A brand-new post moves to its permanent URL (unless the caller has
      // more to do first and will navigate itself).
      if (!post && !opts.stay) router.replace(`/admin/cms/${res.post.id}`);
      return res.post;
    } catch (err) {
      if (err instanceof ApiError) setFieldErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v?.[0]])));
      setError(describeApiError(err, "Couldn't save the post"));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    // Preview what's on the page now: save first (keeping the current status).
    const saved = dirty || !post ? await save(post?.status ?? "DRAFT", "preview", { quiet: true }) : post;
    if (saved) window.open(`/admin/cms/${saved.id}/preview`, "_blank", "noopener");
  }

  async function uploadImage(file: File) {
    if (!accessToken) return;
    if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Unsupported image", "Use a JPEG, PNG, WebP or GIF.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image too large", `Images must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller.`);
      return;
    }
    // A new post needs an id before it can own an image.
    const isNew = !post;
    const target = post ?? (await save("DRAFT", "image", { quiet: true, stay: true }));
    if (!target) return;
    setBusy("image");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiFetch<{ post: BlogPostDTO }>(`/api/admin/cms/posts/${target.id}/image`, { method: "POST", body: form, accessToken });
      setPost(res.post);
      toast.success("Featured image updated");
    } catch (err) {
      toast.error("Upload failed", describeApiError(err));
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
      if (isNew) router.replace(`/admin/cms/${target.id}`);
    }
  }

  async function removeImage() {
    if (!post || !accessToken) return;
    setBusy("image");
    try {
      const res = await apiFetch<{ post: BlogPostDTO }>(`/api/admin/cms/posts/${post.id}/image`, { method: "DELETE", accessToken });
      setPost(res.post);
    } catch (err) {
      toast.error("Couldn't remove image", describeApiError(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!post || !accessToken) return;
    setBusy("delete");
    try {
      await apiFetch(`/api/admin/cms/posts/${post.id}`, { method: "DELETE", accessToken });
      setSavedSnapshot(JSON.stringify(draft));
      toast.success("Post deleted");
      router.push("/admin/cms");
    } catch (err) {
      toast.error("Couldn't delete", describeApiError(err));
      setBusy(null);
    }
  }

  const seoTitle = draft.seoTitle || draft.title || "Post title";
  const seoDescription = draft.seoDescription || draft.excerpt || "Add an SEO description to control what search engines show under your title.";
  const origin = useMemo(() => (typeof window === "undefined" ? "" : window.location.host), []);
  const disabled = !canEdit || busy !== null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {!canEdit && <Alert tone="blue">You have read-only access to the blog. Super and operations admins can edit posts.</Alert>}
        {error && <Alert>{error}</Alert>}
        <div>
          <label htmlFor="post-title" className="sr-only">Title</label>
          <input
            id="post-title"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Post title"
            disabled={!canEdit}
            className="w-full border-0 bg-transparent px-0 text-3xl font-bold tracking-tight text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-0"
            aria-invalid={Boolean(fieldErrors.title) || undefined}
          />
          {fieldErrors.title && <p className="text-sm text-red-600">{fieldErrors.title}</p>}
          <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
            <span className="shrink-0">/blog/</span>
            <input
              aria-label="URL slug"
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
              }}
              disabled={!canEdit}
              placeholder="post-url"
              className="min-w-0 flex-1 rounded border-0 bg-transparent px-1 py-0.5 font-mono text-sm text-gray-700 focus:bg-gray-100 focus:outline-none"
            />
          </div>
          {fieldErrors.slug && <p className="text-sm text-red-600">{fieldErrors.slug}</p>}
        </div>

        <Field label={<span className="flex justify-between">Excerpt <CharCount value={draft.excerpt} max={BLOG_EXCERPT_MAX} /></span>} htmlFor="post-excerpt" hint="Shown on the blog index and under the title." error={fieldErrors.excerpt}>
          <Textarea id="post-excerpt" value={draft.excerpt} onChange={(e) => set("excerpt", e.target.value)} disabled={!canEdit} className="min-h-[64px]" />
        </Field>

        <RichTextEditor value={draft.content} onChange={(html) => set("content", html)} />
        {fieldErrors.content && <p className="text-sm text-red-600">{fieldErrors.content}</p>}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader title="Publishing" actions={<PostStatusBadge status={displayStatus} />} />
          <CardBody className="space-y-4">
            {post?.publishedAt && (
              <p className="text-sm text-gray-500">
                {displayStatus === "SCHEDULED" ? "Goes live" : displayStatus === "PUBLISHED" ? "Published" : "Planned for"} {formatDateTime(post.publishedAt)}
              </p>
            )}
            <div>
              <Checkbox checked={draft.schedule} onChange={(e) => set("schedule", e.target.checked)} disabled={!canEdit} label="Schedule for later" />
              {draft.schedule && (
                <Field label="Publish date & time" htmlFor="post-publish-at" className="mt-3" error={scheduleInPast ? "Pick a time in the future" : fieldErrors.publishedAt}>
                  <Input id="post-publish-at" type="datetime-local" value={draft.publishAt} onChange={(e) => set("publishAt", e.target.value)} disabled={!canEdit} />
                </Field>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="accent"
                icon={draft.schedule ? <CalendarClock className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
                loading={busy === "publish"}
                disabled={disabled || (draft.schedule && (!draft.publishAt || scheduleInPast))}
                onClick={() => save("PUBLISHED", "publish")}
              >
                {draft.schedule ? "Schedule" : displayStatus === "PUBLISHED" ? "Update post" : "Publish now"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button icon={<Save className="h-4 w-4" />} loading={busy === "draft"} disabled={disabled || (draft.schedule && scheduleInPast)} onClick={() => save(post?.status ?? "DRAFT", "draft")}>
                  Save
                </Button>
                <Button icon={<Eye className="h-4 w-4" />} loading={busy === "preview"} disabled={busy !== null || (!canEdit && !post)} onClick={preview}>
                  Preview
                </Button>
              </div>
              {post && post.status !== "DRAFT" && (
                <Button variant="ghost" size="sm" icon={<Undo2 className="h-3.5 w-3.5" />} disabled={disabled} onClick={() => save("DRAFT", "unpublish")}>
                  Revert to draft
                </Button>
              )}
              {post && post.status !== "ARCHIVED" && (
                <Button variant="ghost" size="sm" icon={<Archive className="h-3.5 w-3.5" />} disabled={disabled} onClick={() => save("ARCHIVED", "archive")}>
                  Archive
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-400">{dirty ? "Unsaved changes" : post ? `Saved ${formatDateTime(post.updatedAt)}` : "Not saved yet"}</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Featured image" />
          <CardBody className="space-y-3">
            {post?.featuredImageUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- API-served upload preview */}
                <img src={post.featuredImageUrl} alt={draft.featuredImageAlt} className="aspect-[2/1] w-full rounded-lg border border-gray-200 object-cover" />
                {canEdit && (
                  <button type="button" onClick={removeImage} disabled={busy !== null} className="absolute right-2 top-2 rounded-full bg-gray-900/70 p-1 text-onaccent hover:bg-gray-900" aria-label="Remove featured image">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => fileInput.current?.click()}
                className="flex aspect-[2/1] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 transition-colors hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
              >
                <ImagePlus className="h-6 w-6" aria-hidden />
                {busy === "image" ? "Uploading…" : "Upload image"}
                <span className="text-xs text-gray-400">JPEG, PNG, WebP or GIF · up to 5 MB</span>
              </button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void uploadImage(e.target.files[0])}
            />
            {post?.featuredImageUrl && canEdit && (
              <Button size="sm" className="w-full" loading={busy === "image"} onClick={() => fileInput.current?.click()}>
                Replace image
              </Button>
            )}
            <Field label="Alt text" htmlFor="post-image-alt" hint="Describes the image for screen readers.">
              <Input id="post-image-alt" value={draft.featuredImageAlt} onChange={(e) => set("featuredImageAlt", e.target.value)} disabled={!canEdit} maxLength={200} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="SEO" description="How this post appears in search results." />
          <CardBody className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3" aria-label="Search result preview">
              <p className="truncate text-xs text-gray-500">{origin}/blog/{effectiveSlug || "post-url"}</p>
              <p className="mt-0.5 line-clamp-1 text-base text-indigo-700">{seoTitle}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{seoDescription}</p>
            </div>
            <Field label={<span className="flex justify-between">Meta title <CharCount value={draft.seoTitle} max={SEO_TITLE_MAX} /></span>} htmlFor="post-seo-title" hint="Defaults to the post title." error={fieldErrors.seoTitle}>
              <Input id="post-seo-title" value={draft.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={<span className="flex justify-between">Meta description <CharCount value={draft.seoDescription} max={SEO_DESCRIPTION_MAX} /></span>} htmlFor="post-seo-desc" hint="Aim for 120–160 characters." error={fieldErrors.seoDescription}>
              <Textarea id="post-seo-desc" value={draft.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} disabled={!canEdit} className="min-h-[72px]" />
            </Field>
          </CardBody>
        </Card>

        {post && canEdit && (
          <Button variant="ghost" className="w-full text-red-700 hover:bg-red-50" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
            Delete post
          </Button>
        )}
      </aside>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={busy === "delete"}
        title="Delete this post?"
        description="It will be removed from the blog immediately along with its featured image. Consider archiving instead if you might want it back."
        confirmLabel="Delete post"
      />
    </div>
  );
}
