"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PostEditor } from "../../../../components/cms/PostEditor";
import { PageContainer } from "../../../../components/ui/PageHeader";

export default function NewPostPage() {
  return (
    <PageContainer wide>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href="/admin/cms" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          All posts
        </Link>
        <span className="h-4 w-px bg-gray-300" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">New post</h1>
      </div>
      <PostEditor initial={null} />
    </PageContainer>
  );
}
