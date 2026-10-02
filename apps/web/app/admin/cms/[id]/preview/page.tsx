"use client";

import { useParams } from "next/navigation";
import { Eye } from "lucide-react";
import type { BlogPostDTO } from "@insurance/shared";
import { blogPostDisplayStatus } from "@insurance/shared";
import { formatDateTime } from "../../../../../lib/format";
import { useApiQuery } from "../../../../../lib/use-api";
import { BlogArticle } from "../../../../../components/cms/BlogArticle";
import { PostStatusBadge } from "../../../../../components/cms/PostStatusBadge";
import { ButtonLink } from "../../../../../components/ui/Button";
import { ErrorState, LoadingState } from "../../../../../components/ui/States";

export default function PreviewPostPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApiQuery<{ post: BlogPostDTO }>(`/api/admin/cms/posts/${encodeURIComponent(id)}`, "Couldn't load this post");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <LoadingState className="py-32" />;
  const p = data.post;
  const status = blogPostDisplayStatus(p.status, p.publishedAt);
  return (
    <div>
      <div className="border-b border-indigo-200 bg-indigo-50">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6">
          <span className="flex items-center gap-2 text-indigo-900">
            <Eye className="h-4 w-4" aria-hidden /> Preview — readers {status === "PUBLISHED" ? "see this now" : status === "SCHEDULED" ? `will see this ${formatDateTime(p.publishedAt)}` : "can't see this yet"}
            <PostStatusBadge status={status} />
          </span>
          <ButtonLink href={`/admin/cms/${p.id}`} size="sm">
            Back to editor
          </ButtonLink>
        </div>
      </div>
      <BlogArticle post={{ ...p, publishedAt: p.publishedAt ?? new Date().toISOString() }} />
    </div>
  );
}
