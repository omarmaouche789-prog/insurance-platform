"use client";

import { PostEditor } from "../../../../components/cms/PostEditor";
import { PageContainer, PageHeader } from "../../../../components/ui/PageHeader";

export default function NewPostPage() {
  return (
    <PageContainer wide>
      <PageHeader back={{ href: "/admin/cms", label: "All posts" }} title="New post" />
      <PostEditor initial={null} />
    </PageContainer>
  );
}
