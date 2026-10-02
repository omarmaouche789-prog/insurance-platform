"use client";

import { useParams } from "next/navigation";
import type { BlogPostDTO } from "@insurance/shared";
import { useApiQuery } from "../../../../lib/use-api";
import { PostEditor } from "../../../../components/cms/PostEditor";
import { PageContainer, PageHeader } from "../../../../components/ui/PageHeader";
import { ErrorState, LoadingState } from "../../../../components/ui/States";

export default function EditPostPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useApiQuery<{ post: BlogPostDTO }>(`/api/admin/cms/posts/${encodeURIComponent(id)}`, "Couldn't load this post");
  return (
    <PageContainer wide>
      <PageHeader back={{ href: "/admin/cms", label: "All posts" }} title="Edit post" />
      {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <LoadingState /> : <PostEditor key={data.post.id} initial={data.post} />}
    </PageContainer>
  );
}
