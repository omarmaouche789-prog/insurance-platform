"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useParams } from "next/navigation";
import type { BlogPostDTO } from "@insurance/shared";
import { useApiQuery } from "../../../../lib/use-api";
import { PostEditor } from "../../../../components/cms/PostEditor";
import { PageContainer } from "../../../../components/ui/PageHeader";
import { ErrorState, LoadingState } from "../../../../components/ui/States";

export default function EditPostPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApiQuery<{ post: BlogPostDTO }>(`/api/admin/cms/posts/${encodeURIComponent(id)}`, "Couldn't load this post");
  return (
    <PageContainer wide>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href="/admin/cms" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All posts
        </Link>
        <span className="h-4 w-px bg-gray-300" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">Edit post</h1>
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <LoadingState /> : <PostEditor key={data.post.id} initial={data.post} />}
    </PageContainer>
  );
}
